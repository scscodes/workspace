import * as vscode from 'vscode';
import type { ScanResult, ScanOptions, ToolId, ITelemetry } from '@aidev/core';
import {
  getToolEntry,
  DeadCodeTool,
  LintTool,
  CommitTool,
  CommentsTool,
  TldrTool,
  BranchDiffTool,
  DiffResolveTool,
  PRReviewTool,
  NullTelemetry,
} from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';
import type { ProviderManager } from '../providers/index.js';
import type { StatusBarApi } from '../status/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ToolResultCallback = (result: ScanResult) => void;

// ─── Tool Runner ────────────────────────────────────────────────────────────

/**
 * Orchestrates tool execution in the VSCode environment.
 *
 * Bridges @aidev/core tools with VSCode-specific concerns:
 * - Injects model provider and settings as dependencies
 * - Resolves workspace path for cwd
 * - Manages result notifications and sidebar updates
 * - Single status bar busy state (Scanning... / Fetching...)
 */
export class ToolRunner implements vscode.Disposable {
  private readonly _onDidCompleteRun = new vscode.EventEmitter<ScanResult>();

  /** Fires when any tool run completes (success, failure, or cancel) */
  readonly onDidCompleteRun: vscode.Event<ScanResult> = this._onDidCompleteRun.event;

  /** Most recent result from each tool */
  private readonly lastResults = new Map<ToolId, ScanResult>();

  /** Track which tools are currently running */
  private readonly runningTools = new Set<ToolId>();

  /** Event emitter for running state changes */
  private readonly _onDidChangeRunningState = new vscode.EventEmitter<ToolId>();
  readonly onDidChangeRunningState: vscode.Event<ToolId> = this._onDidChangeRunningState.event;

  constructor(
    private readonly settings: SettingsManager,
    private readonly providers: ProviderManager,
    private readonly statusBar?: StatusBarApi,
    private readonly telemetry?: ITelemetry,
  ) {}

  /**
   * Run a tool by ID, with optional scan options.
   * Shows progress in the status bar and notifies on completion.
   */
  async run(toolId: ToolId, options?: Partial<ScanOptions>): Promise<ScanResult | undefined> {
    console.log(`AIDev: Running tool: ${toolId}`);
    
    const entry = getToolEntry(toolId);
    if (!entry) {
      const errorMsg = `AIDev: Unknown tool "${toolId}". Check TOOL_REGISTRY for valid tool IDs.`;
      console.error(errorMsg);
      void vscode.window.showErrorMessage(errorMsg);
      return undefined;
    }

    const cwd = this.getWorkspacePath();
    if (!cwd) {
      const errorMsg = 'AIDev: No workspace folder open. Open a workspace folder to use AIDev tools.';
      console.error(errorMsg);
      void vscode.window.showErrorMessage(errorMsg);
      return undefined;
    }

    console.log(`AIDev: Workspace path: ${cwd}`);

    let provider = this.providers.getActiveProvider();
    console.log(`AIDev: Active provider: ${provider ? provider.name : 'none'}`);
    
    // If no provider but tool requires one, try to reactivate with retries
    if (!provider && this.toolRequiresProvider(toolId)) {
      console.log(`AIDev: Tool ${toolId} requires provider, but none available. Retrying activation with delays...`);
      // Attempt to reactivate providers in case they became available
      // (e.g., IDE models loading after extension activation)
      // Use more retries and longer delays for tool execution
      try {
        await this.providers.retryActivation(5, 1500);
        provider = this.providers.getActiveProvider();
        if (provider) {
          console.log(`AIDev: Provider became available after retry: ${provider.name}`);
        } else {
          console.warn(`AIDev: Provider still not available after retry. Models may not be configured.`);
        }
      } catch (error) {
        console.error('AIDev: Error during provider retry:', error);
      }
    }

    const busyMessage = toolId === 'branch-diff' ? 'Fetching...' : 'Scanning...';
    this.statusBar?.setBusy(busyMessage);
    this.runningTools.add(toolId);
    this._onDidChangeRunningState.fire(toolId);

    let result: ScanResult;
    try {
      // Don't show notification popup - use inline spinner in sidebar instead
      result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `AIDev: ${entry.name}`,
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Starting...' });

          const tool = this.createTool(toolId, cwd, provider);
          if (!tool) {
            return {
              toolId,
              status: 'failed',
              startedAt: new Date(),
              completedAt: new Date(),
              findings: [],
              summary: {
                totalFindings: 0,
                bySeverity: { error: 0, warning: 0, info: 0, hint: 0 },
              },
              error: `Tool "${toolId}" could not be created. Check error messages above for details.`,
              filesScanned: 0,
            };
          }

          token.onCancellationRequested(() => tool.cancel());

          const scanOptions: ScanOptions = {
            paths: options?.paths,
            signal: options?.signal,
            args: options?.args,
            telemetry: this.telemetry ?? new NullTelemetry(),
          };

          progress.report({ message: 'Analyzing...' });
          console.log(`AIDev: Executing ${toolId}...`);
          const executeResult = await tool.execute(scanOptions);
          console.log(`AIDev: ${toolId} execution completed with status: ${executeResult.status}`);
          if (executeResult.status === 'failed' && executeResult.error) {
            console.error(`AIDev: ${toolId} execution failed:`, executeResult.error);
          }
          return executeResult;
        },
      );
    } finally {
      this.statusBar?.clearBusy();
      this.runningTools.delete(toolId);
      this._onDidChangeRunningState.fire(toolId);
    }

    // Store and broadcast result
    this.lastResults.set(toolId, result);
    this._onDidCompleteRun.fire(result);

    // Notify user
    this.notifyResult(entry.name, result);

    console.log(`AIDev: Tool ${toolId} run complete. Status: ${result.status}, Findings: ${result.findings.length}`);
    return result;
  }

  /**
   * Get the most recent result for a tool.
   */
  getLastResult(toolId: ToolId): ScanResult | undefined {
    return this.lastResults.get(toolId);
  }

  /**
   * Check if a tool is currently running.
   */
  isRunning(toolId: ToolId): boolean {
    return this.runningTools.has(toolId);
  }

  /**
   * Get all stored results.
   */
  getAllResults(): Map<ToolId, ScanResult> {
    return new Map(this.lastResults);
  }

  dispose(): void {
    this._onDidCompleteRun.dispose();
    this.lastResults.clear();
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private createTool(
    toolId: ToolId,
    cwd: string,
    provider: import('@aidev/core').IModelProvider | undefined,
  ): import('@aidev/core').ITool | undefined {
    const current = this.settings.current;

    // Helper to create consistent error messages for missing providers
    const getProviderErrorMsg = (toolName: string): string =>
      `AIDev: ${toolName} requires a model provider. No provider is currently available. ` +
      'Check AIDev settings (aidev.providerSource) and ensure your IDE has models configured or API keys are set.';

    // Helper to safely create a tool with error handling
    const createToolSafely = <T extends import('@aidev/core').ITool>(
      ToolClass: new () => T,
      toolName: string,
      setDepsFn: (tool: T) => void,
    ): T | undefined => {
      try {
        const tool = new ToolClass();
        setDepsFn(tool);
        console.log(`AIDev: ${toolName} created successfully`);
        return tool;
      } catch (error) {
        const errorMsg = `AIDev: Failed to create ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg, error);
        void vscode.window.showErrorMessage(errorMsg);
        return undefined;
      }
    };

    switch (toolId) {
      case 'dead-code': {
        return createToolSafely(
          DeadCodeTool,
          'DeadCodeTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider,
              cwd,
              enabledLanguages: current.enabledLanguages,
            });
          },
        );
      }
      case 'lint': {
        return createToolSafely(
          LintTool,
          'LintTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider,
              cwd,
              enabledLanguages: current.enabledLanguages,
            });
          },
        );
      }
      case 'commit': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('Auto-Commit');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          CommitTool,
          'CommitTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              commitConstraints: current.commitConstraints,
              preCommitDryRun: current.preCommitDryRun,
              cwd,
            });
          },
        );
      }
      case 'comments': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('Comment Pruning');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          CommentsTool,
          'CommentsTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
              enabledLanguages: current.enabledLanguages,
            });
          },
        );
      }
      case 'tldr': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('TLDR');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          TldrTool,
          'TldrTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
            });
          },
        );
      }
      case 'branch-diff': {
        return createToolSafely(
          BranchDiffTool,
          'BranchDiffTool',
          (tool) => {
            tool.setDeps({ cwd });
          },
        );
      }
      case 'diff-resolve': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('Diff Resolver');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          DiffResolveTool,
          'DiffResolveTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
            });
          },
        );
      }
      case 'pr-review': {
        if (!provider) {
          const errorMsg = getProviderErrorMsg('PR Review');
          console.error(errorMsg);
          void vscode.window.showErrorMessage(errorMsg);
          return undefined;
        }
        return createToolSafely(
          PRReviewTool,
          'PRReviewTool',
          (tool) => {
            tool.setDeps({
              modelProvider: provider!,
              cwd,
            });
          },
        );
      }
      default: {
        const errorMsg = `AIDev: Unknown tool ID: ${toolId}`;
        console.error(errorMsg);
        void vscode.window.showErrorMessage(errorMsg);
        return undefined;
      }
    }
  }

  private getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
  }

  /**
   * Check if a tool requires a model provider to function.
   */
  private toolRequiresProvider(toolId: ToolId): boolean {
    // Tools that require a model provider
    return ['tldr', 'comments', 'commit', 'diff-resolve', 'pr-review'].includes(toolId);
  }

  private notifyResult(toolName: string, result: ScanResult): void {
    const { status, summary } = result;

    // Log to console only - no pop-up notifications
    switch (status) {
      case 'completed':
        if (summary.totalFindings > 0) {
          console.log(`AIDev: ${toolName} completed — ${String(summary.totalFindings)} item(s) found`);
        } else {
          console.log(`AIDev: ${toolName} completed — no issues found`);
        }
        break;
      case 'failed': {
        const errorMsg = result.error ?? 'Unknown error';
        console.error(`AIDev: ${toolName} failed: ${errorMsg}`);
        break;
      }
      case 'cancelled':
        console.log(`AIDev: ${toolName} cancelled.`);
        break;
    }
  }
}
