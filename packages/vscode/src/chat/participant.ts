import * as vscode from 'vscode';
import { TOOL_REGISTRY, getToolByCommand } from '@aidev/core';
import type { ToolId } from '@aidev/core';
import type { ProviderManager } from '../providers/index.js';
import type { ToolRunner } from '../tools/runner.js';

const PARTICIPANT_ID = 'aidev.chat';

/**
 * Register the @aidev chat participant for VSCode Copilot Chat.
 *
 * In Cursor, the Chat Participant API may not be available.
 * Features degrade gracefully — all tools remain accessible via
 * commands (palette + sidebar).
 */
export function registerChatParticipant(
  _context: vscode.ExtensionContext,
  _providerManager: ProviderManager,
  toolRunner?: ToolRunner,
): vscode.Disposable[] {
  // Guard: Chat Participant API may not exist in all environments
  if (!vscode.chat?.createChatParticipant) {
    console.log('AIDev: Chat Participant API not available — commands still work.');
    return [];
  }

  const handler = createHandler(toolRunner);
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('beaker');

  return [participant];
}

function createHandler(
  toolRunner?: ToolRunner,
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
  ): Promise<void> => {
    const { command } = request;

    if (!command) {
      // No command — show help
      stream.markdown('### AIDev Tools\n\n');
      for (const tool of TOOL_REGISTRY) {
        stream.markdown(`- \`/${tool.chatCommand}\` — ${tool.description}\n`);
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

    // Extract file/directory references from the request
    const paths = extractPaths(request);

    stream.markdown(`Running **${entry.name}**...\n\n`);

    try {
      const result = await toolRunner.run(entry.id as ToolId, {
        paths: paths.length > 0 ? paths : undefined,
      });

      if (!result) {
        stream.markdown('No result — check the error log for details.');
        return;
      }

      // Format results for chat
      stream.markdown(`**Status**: ${result.status}\n\n`);

      if (result.findings.length === 0) {
        stream.markdown('No findings.');
        return;
      }

      stream.markdown(`**${String(result.findings.length)} findings**:\n\n`);

      for (const finding of result.findings) {
        const icon =
          finding.severity === 'error'
            ? '🔴'
            : finding.severity === 'warning'
              ? '🟡'
              : 'ℹ️';
        stream.markdown(`${icon} **${finding.title}**\n`);
        stream.markdown(`${finding.description}\n`);

        if (finding.location.startLine > 0) {
          stream.markdown(
            `📍 \`${finding.location.filePath}:${String(finding.location.startLine)}\`\n`,
          );
        }

        stream.markdown('\n');
      }
    } catch (error) {
      stream.markdown(
        `**Error**: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}

/**
 * Extract file/directory references from a chat request.
 * Users can mention files with @ or just type paths.
 */
function extractPaths(request: vscode.ChatRequest): string[] {
  const paths: string[] = [];

  // Check for file references in the request
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
