import * as vscode from 'vscode';
import { TOOL_REGISTRY, VALID_MODES } from '@aidev/core';
import type { ToolId, ExportFormat } from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';
import type { ToolRunner } from '../tools/runner.js';

/**
 * Register all extension commands.
 *
 * Tool commands are driven by TOOL_REGISTRY — adding a new tool there
 * automatically registers its command here and routes to ToolRunner.
 */
export function registerCommands(
  _context: vscode.ExtensionContext,
  settings: SettingsManager,
  toolRunner: ToolRunner,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Register a command for each tool in the registry
  for (const tool of TOOL_REGISTRY) {
    disposables.push(
      vscode.commands.registerCommand(tool.commandId, async () => {
        await toolRunner.run(tool.id as ToolId);
      }),
    );
  }

  // Export results command
  disposables.push(
    vscode.commands.registerCommand('aidev.exportResults', async () => {
      const results = toolRunner.getAllResults();
      if (results.size === 0) {
        void vscode.window.showInformationMessage('AIDev: No results to export. Run a scan first.');
        return;
      }

      // Pick which tool's results to export
      const toolPick = await vscode.window.showQuickPick(
        Array.from(results.entries()).map(([id, result]) => {
          const entry = TOOL_REGISTRY.find((t) => t.id === id);
          return {
            label: entry?.name ?? id,
            description: `${String(result.summary.totalFindings)} findings`,
            toolId: id,
          };
        }),
        { placeHolder: 'Which results to export?' },
      );

      if (!toolPick) return;

      const formatPick = await vscode.window.showQuickPick(
        [
          { label: 'JSON', description: 'Machine-readable format', format: 'json' as ExportFormat },
          {
            label: 'Markdown',
            description: 'Human-readable format',
            format: 'markdown' as ExportFormat,
          },
        ],
        { placeHolder: 'Export format' },
      );

      if (!formatPick) return;

      // Create and open the exported file
      const result = results.get(toolPick.toolId as ToolId);
      if (!result) return;

      const ext = formatPick.format === 'json' ? 'json' : 'md';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`aidev-${toolPick.toolId}-results.${ext}`),
        filters:
          formatPick.format === 'json'
            ? { JSON: ['json'] }
            : { Markdown: ['md'] },
      });

      if (uri) {
        // Use the BaseTool's export via a simple inline formatter
        const content =
          formatPick.format === 'json'
            ? JSON.stringify(result, null, 2)
            : formatResultAsMarkdown(toolPick.label, result);

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        await vscode.window.showTextDocument(uri);
      }
    }),
  );

  // Set mode command
  disposables.push(
    vscode.commands.registerCommand('aidev.setMode', async () => {
      const current = settings.current.mode;
      const picked = await vscode.window.showQuickPick(
        VALID_MODES.map((m) => ({
          label: m,
          description: m === current ? '(current)' : `Switch to ${m} mode`,
        })),
        { placeHolder: `Current mode: ${current}` },
      );

      if (picked && picked.label !== current) {
        const config = vscode.workspace.getConfiguration('aidev');
        await config.update('mode', picked.label, vscode.ConfigurationTarget.Global);
      }
    }),
  );

  return disposables;
}

/**
 * Quick markdown formatter for export.
 * Used when the tool instance isn't readily available.
 */
function formatResultAsMarkdown(
  toolName: string,
  result: import('@aidev/core').ScanResult,
): string {
  const lines: string[] = [];
  lines.push(`# ${toolName} — Results`);
  lines.push('');
  lines.push(`**Status**: ${result.status}`);
  lines.push(`**Findings**: ${String(result.summary.totalFindings)}`);
  lines.push(`**Files scanned**: ${String(result.summary.filesScanned)}`);
  lines.push('');

  if (result.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of result.findings) {
      lines.push(
        `### [${f.severity.toUpperCase()}] ${f.title}`,
      );
      lines.push('');
      lines.push(f.description);
      lines.push('');
      lines.push(`File: \`${f.location.filePath}:${String(f.location.startLine)}\``);
      if (f.suggestedFix) {
        lines.push('');
        lines.push(`**Fix**: ${f.suggestedFix.description}`);
        lines.push('```');
        lines.push(f.suggestedFix.replacement);
        lines.push('```');
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}
