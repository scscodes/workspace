import * as vscode from 'vscode';
import {
  TOOL_REGISTRY,
  getToolByCommand,
  getToolDefinitions,
  runAgentLoop,
  WORKFLOW_REGISTRY,
  matchWorkflow,
  WORKFLOW_PARALLEL_TIMEOUT_MS,
  SPECULATIVE_EXECUTION_ENABLED,
  generateId,
  NullTelemetry,
} from '@aidev/core';
import type {
  ToolId,
  ToolResult,
  ChatMessage,
  AgentConfig,
  AgentAction,
  WorkflowDefinition,
  ScanResult,
  ITelemetry,
} from '@aidev/core';
import type { ProviderManager } from '../providers/index.js';
import type { ToolRunner } from '../tools/runner.js';
import type { SettingsManager } from '../settings/index.js';

const PARTICIPANT_ID = 'aidev.chat';

/** Severity icons for finding display */
const SEVERITY_ICONS: Record<string, string> = {
  error: '🔴',
  warning: '🟡',
  info: 'ℹ️',
  hint: '💡',
};

/** Default severity icon when severity is unknown */
const DEFAULT_SEVERITY_ICON = 'ℹ️';

/**
 * Cache for speculative pre-execution of autonomous tools.
 * Maps toolId to a promise that resolves to the tool's ScanResult.
 * Scoped to a single message handler invocation.
 */
type SpeculativeCache = Map<ToolId, Promise<ScanResult>>;

/**
 * Create a new speculative cache.
 */
function createSpeculativeCache(): SpeculativeCache {
  return new Map();
}

/**
 * Register the @aidev chat participant for VSCode Copilot Chat.
 * If the Chat Participant API is unavailable, tools remain accessible via commands (palette + sidebar).
 */
export function registerChatParticipant(
  _context: vscode.ExtensionContext,
  providerManager: ProviderManager,
  toolRunner?: ToolRunner,
  telemetry?: ITelemetry,
): vscode.Disposable[] {
  // Guard: Chat Participant API may not exist in all environments
  if (!vscode.chat?.createChatParticipant) {
    console.log('AIDev: Chat Participant API not available — commands still work.');
    return [];
  }

  const handler = createHandler(providerManager, toolRunner, telemetry);
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('beaker');

  return [participant];
}

function createHandler(
  providerManager: ProviderManager,
  toolRunner?: ToolRunner,
  telemetry?: ITelemetry,
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> => {
    const { command } = request;

    // ─── Slash command: direct tool invocation (bypass agent loop) ──────
    if (command) {
      await handleSlashCommand(command, request, stream, toolRunner);
      return;
    }

    // ─── Workflow matching: detect intent and run tool chain ───────────
    const workflow = matchWorkflow(request.prompt);
    if (workflow) {
      // Speculative pre-execution: fire autonomous tools before UI updates
      const speculativeCache = createSpeculativeCache();
      const workflowTelemetry = telemetry ?? new NullTelemetry();
      
      if (SPECULATIVE_EXECUTION_ENABLED && toolRunner) {
        const autonomousToolIds = workflow.toolIds.filter((toolId) => {
          const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
          return entry && entry.invocation === 'autonomous';
        });

        // Fire autonomous tools speculatively (do NOT await)
        const paths = extractPaths(request);
        for (const toolId of autonomousToolIds) {
          const startTime = Date.now();
          const promise = toolRunner
            .run(toolId, {
              paths: paths.length > 0 ? paths : undefined,
            })
            .then((result) => {
              // Emit speculative.hit event
              if (result) {
                const endTime = Date.now();
                const savedMs = endTime - startTime;
                workflowTelemetry.emit({
                  kind: 'speculative.hit',
                  toolId,
                  savedMs,
                  timestamp: endTime,
                });
              }
              return result;
            })
            .catch(() => {
              // Emit speculative.miss event
              workflowTelemetry.emit({
                kind: 'speculative.miss',
                toolId,
                timestamp: Date.now(),
              });
              return null;
            });
          
          speculativeCache.set(toolId, promise as Promise<ScanResult>);
        }
      }

      await handleWorkflow(workflow, request, stream, token, toolRunner, speculativeCache, workflowTelemetry);
      return;
    }

    // ─── Free-form message: run through the agentic loop ───────────────
    const provider = providerManager.getActiveProvider();
    if (!provider) {
      stream.markdown(
        '**No model provider available.** Configure one in AIDev settings ' +
          '(`aidev.providerSource` and model tier assignments).',
      );
      return;
    }

    if (!toolRunner) {
      stream.markdown('**Tool runner not available.** The extension may not have fully initialized.');
      return;
    }

    const settings = providerManager.getSettings().current;

    // Build agent config from settings + tool registry
    const agentConfig: AgentConfig = {
      maxTurns: settings.agent.maxTurns,
      maxTokenBudget: settings.agent.maxTokenBudget,
      systemPrompt: settings.agent.systemPrompt,
      // Provide ALL tools to the model — the loop classifies autonomous vs restricted
      availableTools: getToolDefinitions(),
    };

    // Reconstruct conversation history from VSCode chat context
    const history = buildHistoryFromContext(context);

    // Run the agent loop
    const loop = runAgentLoop(provider, agentConfig, history, request.prompt);

    let iterResult = await loop.next();

    while (!iterResult.done) {
      // Check for cancellation
      if (token.isCancellationRequested) {
        stream.markdown('\n\n*Cancelled.*');
        return;
      }

      const action: AgentAction = iterResult.value;

      switch (action.type) {
        case 'tool_call': {
          // Autonomous tool — execute directly
          stream.markdown(`\n\n**Running ${getToolDisplayName(action.toolId)}**...\n\n`);
          const result = await executeToolCall(action.toolId, action.args, action.callId, toolRunner);
          streamToolResult(stream, result);
          iterResult = await loop.next(result);
          break;
        }

        case 'confirmation_required': {
          // Restricted tool — show what the model wants to do, then execute
          // (In a future iteration this can be a true confirm/deny UI)
          stream.markdown(
            `\n\n**${action.description}**\n` +
              `> This tool modifies files or git state. Executing with your approval scope...\n\n`,
          );
          const result = await executeToolCall(action.toolId, action.args, action.callId, toolRunner);
          streamToolResult(stream, result);
          iterResult = await loop.next(result);
          break;
        }

        case 'response': {
          // Final text response from the model
          stream.markdown(action.content);
          if (action.usage) {
            stream.markdown(
              `\n\n---\n*Tokens: ${String(action.usage.totalInputTokens)} in / ${String(action.usage.totalOutputTokens)} out*`,
            );
          }
          iterResult = await loop.next();
          break;
        }

        case 'error': {
          stream.markdown(`\n\n**Error**: ${action.message}`);
          iterResult = await loop.next();
          break;
        }
      }
    }
  };
}

// ─── Slash Command Handler ─────────────────────────────────────────────────

/**
 * Handle direct slash commands (e.g. /deadcode, /lint, /workflow, /decompose).
 * Bypasses the agent loop — runs the tool directly, same as the original behavior.
 */
async function handleSlashCommand(
  command: string,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  toolRunner?: ToolRunner,
): Promise<void> {
  // Special case: /workflow lists available workflows
  if (command === 'workflow') {
    stream.markdown('## Available Workflows\n\n');
    for (const workflow of WORKFLOW_REGISTRY) {
      stream.markdown(`### ${workflow.name}\n`);
      stream.markdown(`**ID**: \`${workflow.id}\`\n`);
      stream.markdown(`**Description**: ${workflow.description}\n`);
      stream.markdown(`**Triggers**: ${workflow.triggers.join(', ')}\n`);
      stream.markdown(`**Tools**: ${workflow.toolIds.join(', ')}\n\n`);
    }
    return;
  }

  // Special case: /decompose requires objective parameter
  if (command === 'decompose') {
    if (!toolRunner) {
      stream.markdown('**Task Decomposition** — tool runner not available.');
      return;
    }

    // Extract objective from request prompt or ask user
    let objective = request.prompt.trim();
    if (!objective) {
      stream.markdown(
        '**Task Decomposition** requires an objective. Please provide: `/decompose <objective>`',
      );
      return;
    }

    // TODO: In a real implementation, show user the proposed subtask plan and ask for confirmation before executing.
    // For now, we just execute directly.

    stream.markdown(`**Decomposing objective:**\n\n> ${objective}\n\n**Planning subtasks...**\n\n`);

    try {
      const result = await toolRunner.run('decompose' as ToolId, {
        args: {
          objective,
          maxSubtasks: 5,
        },
      });

      if (!result) {
        stream.markdown('**Error**: Tool execution returned no result. Check the console for details.');
        return;
      }

      if (result.status === 'failed') {
        stream.markdown(`**Error**: ${result.error ?? 'Decomposition failed'}\n\n`);
        return;
      }

      // For decompose, the metadata should contain the DecomposeSummary
      if (result.metadata?.decomposeSummary) {
        const summary = result.metadata.decomposeSummary as any;
        stream.markdown(`## Decomposition Plan\n\n`);
        stream.markdown(`**Objective**: ${summary.objective}\n\n`);
        stream.markdown(`**${String(summary.subtasks?.length ?? 0)} Subtasks**:\n\n`);

        for (const subtask of summary.subtasks || []) {
          stream.markdown(`### ${subtask.id}\n`);
          stream.markdown(`${subtask.description}\n\n`);
          stream.markdown(`**Tools**: ${(subtask.toolIds || []).join(', ')}\n`);
          stream.markdown(`**Rationale**: ${subtask.rationale}\n\n`);
        }

        stream.markdown(`\n---\n\n`);
        stream.markdown(`**Total findings from all subtasks**: ${String(summary.totalFindings ?? 0)}\n`);

        if ((summary.consolidated || []).length > 0) {
          stream.markdown(`\n**Consolidated findings**:\n\n`);
          for (const finding of summary.consolidated || []) {
            const icon = SEVERITY_ICONS[finding.severity] ?? DEFAULT_SEVERITY_ICON;
            stream.markdown(`${icon} **${finding.title}**\n`);
            stream.markdown(`${finding.description}\n`);
            if (finding.location?.startLine > 0) {
              stream.markdown(
                `📍 \`${finding.location.filePath}:${String(finding.location.startLine)}\`\n`,
              );
            }
            stream.markdown('\n');
          }
        } else {
          stream.markdown('No consolidated findings.');
        }
      } else {
        stream.markdown(`**Status**: ${result.status}\n\n`);
        if (result.findings.length === 0) {
          stream.markdown('Decomposition complete.');
        }
      }
    } catch (error: unknown) {
      stream.markdown(
        `**Error**: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  const entry = getToolByCommand(command);
  if (!entry) {
    stream.markdown(`Unknown command: \`/${command}\`. Type \`@aidev\` for available commands.`);
    return;
  }

  if (!toolRunner) {
    stream.markdown(`**${entry.name}** — tool runner not available.`);
    return;
  }

  const paths = extractPaths(request);

  stream.markdown(`Running **${entry.name}**...\n\n`);

  try {
    const result = await toolRunner.run(entry.id as ToolId, {
      paths: paths.length > 0 ? paths : undefined,
    });

    if (!result) {
      stream.markdown('**Error**: Tool execution returned no result. Check the console for details.');
      return;
    }

    stream.markdown(`**Status**: ${result.status}\n\n`);

    if (result.status === 'failed') {
      stream.markdown(`**Error**: ${result.error ?? 'Unknown error occurred'}\n\n`);
      return;
    }

    if (result.status === 'cancelled') {
      stream.markdown('**Cancelled**: Tool execution was cancelled.\n\n');
      return;
    }

    if (result.findings.length === 0) {
      stream.markdown('No findings.');
      return;
    }

    stream.markdown(`**${String(result.findings.length)} findings**:\n\n`);

    for (const finding of result.findings) {
      const icon = SEVERITY_ICONS[finding.severity] ?? DEFAULT_SEVERITY_ICON;
      stream.markdown(`${icon} **${finding.title}**\n`);
      stream.markdown(`${finding.description}\n`);

      if (finding.location.startLine > 0) {
        stream.markdown(
          `📍 \`${finding.location.filePath}:${String(finding.location.startLine)}\`\n`,
        );
      }

      stream.markdown('\n');
    }
  } catch (error: unknown) {
    stream.markdown(
      `**Error**: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── Workflow Handler ──────────────────────────────────────────────────────

/**
 * Handle workflow execution with parallel autonomous tools and sequential restricted tools.
 *
 * Splits the workflow's tools into two phases:
 * 1. Parallel phase: all 'autonomous' tools run concurrently with Promise.all()
 *    - If speculative cache has pre-started results, use those instead of re-running
 * 2. Sequential phase: all 'restricted' tools run in order after parallel completes
 *
 * Wraps the parallel phase with a timeout (WORKFLOW_PARALLEL_TIMEOUT_MS).
 * Emits workflow.start and workflow.complete telemetry events.
 */
async function handleWorkflow(
  workflow: WorkflowDefinition,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  toolRunner?: ToolRunner,
  speculativeCache: SpeculativeCache = new Map(),
  telemetry?: ITelemetry,
): Promise<void> {
  if (!toolRunner) {
    stream.markdown('**Tool runner not available.** The extension may not have fully initialized.');
    return;
  }

  const workflowTelemetry = telemetry ?? new NullTelemetry();
  const workflowRunId = generateId();
  const workflowStartTime = Date.now();

  // Emit workflow.start event
  workflowTelemetry.emit({
    kind: 'workflow.start',
    runId: workflowRunId,
    workflowId: workflow.id,
    matchedInput: request.prompt,
    timestamp: workflowStartTime,
  });

  stream.markdown(`🔧 **Running workflow: ${workflow.name}**\n\n`);
  stream.markdown('---\n\n');

  const paths = extractPaths(request);
  const parallelStartTime = Date.now();

  // Partition tools by invocation mode
  const autonomousTools = workflow.toolIds.filter((toolId) => {
    const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
    return entry && entry.invocation === 'autonomous';
  });

  const restrictedTools = workflow.toolIds.filter((toolId) => {
    const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
    return entry && entry.invocation === 'restricted';
  });

  // Track findings from parallel phase for logging
  const parallelResults = new Map<ToolId, import('@aidev/core').ScanResult | null>();
  let aggregatedFindings = 0;

  // ─── Phase 1: Parallel Autonomous Tools ─────────────────────────────────
  if (autonomousTools.length > 0) {
    stream.markdown(
      `Running workflow: **${workflow.name}** — starting ${String(autonomousTools.length)} parallel analyses...\n\n`,
    );

    const parallelPromises = autonomousTools.map((toolId) =>
      executeWorkflowToolWithProgress(
        toolId,
        paths,
        toolRunner,
        stream,
        token,
        parallelResults,
        speculativeCache,
      ),
    );

    // Wrap parallel execution with timeout
    try {
      await Promise.race([
        Promise.all(parallelPromises),
        createTimeoutPromise(WORKFLOW_PARALLEL_TIMEOUT_MS),
      ]);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        stream.markdown(
          `\n\n⏱️ **Parallel phase timed out** after ${String(WORKFLOW_PARALLEL_TIMEOUT_MS / 1000)}s. Proceeding with results so far.\n\n`,
        );
      } else {
        throw error;
      }
    }

    // Aggregate findings from parallel phase
    for (const result of parallelResults.values()) {
      if (result && result.status === 'completed') {
        aggregatedFindings += result.findings.length;
      }
    }

    stream.markdown(`\n✓ Analyses complete — ${String(aggregatedFindings)} findings from parallel phase.\n\n`);
  }

  // ─── Phase 2: Sequential Restricted Tools ────────────────────────────────
  if (restrictedTools.length > 0) {
    stream.markdown(`Running ${String(restrictedTools.length)} sequential action(s)...\n\n`);

    for (const toolId of restrictedTools) {
      if (token.isCancellationRequested) {
        stream.markdown('\n\n*Cancelled.*');
        return;
      }

      const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
      if (!entry) {
        stream.markdown(`⚠️ Tool ${toolId} not found in registry.\n\n`);
        continue;
      }

      stream.markdown(`**${entry.name}**...\n\n`);

      try {
        const result = await toolRunner.run(toolId, {
          paths: paths.length > 0 ? paths : undefined,
        });

        if (!result) {
          stream.markdown('Tool returned no result.\n\n');
          continue;
        }

        if (result.status === 'failed') {
          stream.markdown(`❌ ${result.error ?? 'Tool failed'}\n\n`);
          continue;
        }

        if (result.status === 'cancelled') {
          stream.markdown('⏸️ Cancelled\n\n');
          continue;
        }

        // Show summary
        stream.markdown(`✓ ${String(result.findings.length)} findings\n\n`);
        aggregatedFindings += result.findings.length;

        // Show key findings
        if (result.findings.length > 0) {
          for (const finding of result.findings.slice(0, 3)) {
            const icon = SEVERITY_ICONS[finding.severity] ?? DEFAULT_SEVERITY_ICON;
            stream.markdown(`  ${icon} ${finding.title}\n`);
          }
          if (result.findings.length > 3) {
            stream.markdown(`  ... and ${String(result.findings.length - 3)} more\n`);
          }
          stream.markdown('\n');
        }
      } catch (error: unknown) {
        stream.markdown(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}\n\n`,
        );
      }
    }
  }

  stream.markdown(`---\n\n`);
  stream.markdown(`✅ **Workflow complete** — ${String(aggregatedFindings)} total findings\n`);

  // Emit workflow.complete event
  const workflowEndTime = Date.now();
  const totalDurationMs = workflowEndTime - workflowStartTime;
  const parallelMs = Date.now() - parallelStartTime;

  workflowTelemetry.emit({
    kind: 'workflow.complete',
    runId: workflowRunId,
    workflowId: workflow.id,
    durationMs: totalDurationMs,
    parallelMs,
    timestamp: workflowEndTime,
  });
}

/**
 * Execute a single tool as part of a workflow, updating the progress map and streaming updates.
 * Uses the speculative cache if the tool was pre-started; otherwise runs normally.
 */
async function executeWorkflowToolWithProgress(
  toolId: ToolId,
  paths: string[],
  toolRunner: ToolRunner,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  resultMap: Map<ToolId, import('@aidev/core').ScanResult | null>,
  speculativeCache: SpeculativeCache = new Map(),
): Promise<void> {
  if (token.isCancellationRequested) {
    resultMap.set(toolId, null);
    return;
  }

  const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
  if (!entry) {
    stream.markdown(`⚠️ Tool ${toolId} not found in registry.\n`);
    resultMap.set(toolId, null);
    return;
  }

  try {
    let result: ScanResult | null = null;

    // Check speculative cache first
    const speculativePromise = speculativeCache.get(toolId);
    if (speculativePromise) {
      result = await speculativePromise;
      if (result) {
        stream.markdown(`✓ ${entry.name} (cached from speculation) — ${String(result.findings.length)} findings\n`);
        resultMap.set(toolId, result);
        return;
      }
    }

    // Not in cache or cache miss—run normally
    result = await toolRunner.run(toolId, {
      paths: paths.length > 0 ? paths : undefined,
    });

    if (!result) {
      stream.markdown(`⚠️ ${entry.name}: no result\n`);
      resultMap.set(toolId, null);
      return;
    }

    if (result.status === 'failed') {
      stream.markdown(`⚠️ ${entry.name}: ${result.error ?? 'failed'}\n`);
      resultMap.set(toolId, null);
      return;
    }

    if (result.status === 'cancelled') {
      stream.markdown(`⏸️ ${entry.name}: cancelled\n`);
      resultMap.set(toolId, null);
      return;
    }

    // Success: record result and stream progress
    resultMap.set(toolId, result);
    stream.markdown(`✓ ${entry.name} complete (${String(result.findings.length)} findings)\n`);
  } catch (error: unknown) {
    stream.markdown(
      `❌ ${entry.name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    resultMap.set(toolId, null);
  }
}

/**
 * Create a Promise that rejects after a given timeout.
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Workflow timeout after ${String(ms)}ms`));
    }, ms);
  });
}

/**
 * Custom error for workflow timeouts.
 */
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ─── Agent Loop Helpers ────────────────────────────────────────────────────

/**
 * Execute a tool call from the agent loop and return a ToolResult.
 *
 * Passes the full args object through to the tool via ScanOptions.args,
 * enabling tools like commit to receive action/message parameters.
 */
async function executeToolCall(
  toolId: ToolId,
  args: Record<string, unknown>,
  callId: string,
  toolRunner: ToolRunner,
): Promise<ToolResult> {
  try {
    const paths = Array.isArray(args.paths)
      ? (args.paths as string[])
      : undefined;

    const result = await toolRunner.run(toolId, {
      paths: paths && paths.length > 0 ? paths : undefined,
      args,
    });

    if (!result) {
      return {
        toolCallId: callId,
        content: 'Tool returned no result. Check console logs for details.',
        isError: true,
      };
    }

    if (result.status === 'failed') {
      return {
        toolCallId: callId,
        content: `Tool execution failed: ${result.error ?? 'Unknown error'}`,
        isError: true,
      };
    }

    if (result.status === 'cancelled') {
      return {
        toolCallId: callId,
        content: 'Tool execution was cancelled.',
        isError: false,
      };
    }

    // Serialize the scan result into a concise summary for the model
    const summary = formatScanResultForModel(result);
    return {
      toolCallId: callId,
      content: summary,
    };
  } catch (error: unknown) {
    return {
      toolCallId: callId,
      content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

/**
 * Serialize a ScanResult into a concise string for feeding back to the model.
 */
function formatScanResultForModel(result: import('@aidev/core').ScanResult): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.status}`);
  lines.push(`Total findings: ${String(result.summary.totalFindings)}`);
  lines.push(`Files scanned: ${String(result.summary.filesScanned)}`);

  if (result.findings.length > 0) {
    lines.push('');
    lines.push('Findings:');
    for (const finding of result.findings) {
      const location = finding.location.startLine > 0
        ? ` (${finding.location.filePath}:${String(finding.location.startLine)})`
        : '';
      lines.push(`- [${finding.severity}] ${finding.title}${location}: ${finding.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Stream a tool result summary to the chat response.
 */
function streamToolResult(stream: vscode.ChatResponseStream, result: ToolResult): void {
  if (result.isError) {
    stream.markdown(`\n> **Tool error**: ${result.content}\n\n`);
  } else {
    // Show a brief summary — the model will synthesize the full result
    const lines = result.content.split('\n');
    // Show just the header lines (status + counts)
    const HEADER_LINE_COUNT = 3;
    const headerLines = lines.slice(0, HEADER_LINE_COUNT).join('\n');
    stream.markdown(`\n> ${headerLines.replace(/\n/g, '\n> ')}\n\n`);
  }
}

/**
 * Get a display name for a tool ID.
 */
function getToolDisplayName(toolId: ToolId): string {
  const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
  return entry?.name ?? toolId;
}

// ─── Conversation History ──────────────────────────────────────────────────

/**
 * Reconstruct ChatMessage[] from VSCode's ChatContext.history.
 * This enables multi-turn conversations with conversation replay.
 *
 * VSCode provides previous turns as ChatRequestTurn / ChatResponseTurn objects.
 * We convert them to our ChatMessage format for the agent loop.
 */
function buildHistoryFromContext(context: vscode.ChatContext): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const turn of context.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push({
        role: 'user',
        content: turn.prompt,
      });
    } else if (turn instanceof vscode.ChatResponseTurn) {
      // Reconstruct assistant content from response parts
      let content = '';
      for (const part of turn.response) {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          content += part.value.value;
        }
      }
      if (content) {
        messages.push({
          role: 'assistant',
          content,
        });
      }
    }
  }

  return messages;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

/**
 * Extract file/directory references from a chat request.
 * Users can mention files with @ or just type paths.
 */
function extractPaths(request: vscode.ChatRequest): string[] {
  const paths: string[] = [];

  if (request.references) {
    for (const ref of request.references) {
      if (ref.value instanceof vscode.Uri) {
        paths.push(ref.value.fsPath);
      } else if (ref.value && typeof ref.value === 'object' && 'uri' in ref.value) {
        const uriValue = ref.value as { uri: vscode.Uri };
        paths.push(uriValue.uri.fsPath);
      }
    }
  }

  return paths;
}
