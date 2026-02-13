import * as vscode from 'vscode';
import { TOOL_REGISTRY, VALID_MODES } from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';
import type { ProviderManager } from '../providers/index.js';

/**
 * Register all extension commands.
 *
 * Tool commands are driven by TOOL_REGISTRY — adding a new tool there
 * automatically registers its command here.
 */
export function registerCommands(
  _context: vscode.ExtensionContext,
  _settings: SettingsManager,
  _providerManager: ProviderManager,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Register a command for each tool in the registry
  for (const tool of TOOL_REGISTRY) {
    disposables.push(
      vscode.commands.registerCommand(tool.commandId, () => {
        // TODO: Route to actual tool execution via providerManager + settings
        void vscode.window.showInformationMessage(
          `AIDev: ${tool.name} — not yet implemented.`,
        );
      }),
    );
  }

  // Export results command
  disposables.push(
    vscode.commands.registerCommand('aidev.exportResults', async () => {
      const format = await vscode.window.showQuickPick(
        [
          { label: 'JSON', description: 'Machine-readable format', value: 'json' },
          { label: 'Markdown', description: 'Human-readable format', value: 'markdown' },
        ],
        { placeHolder: 'Export format' },
      );

      if (format) {
        // TODO: Export the most recent scan result in the chosen format
        void vscode.window.showInformationMessage(
          `AIDev: Export as ${format.label} — not yet implemented.`,
        );
      }
    }),
  );

  // Set mode command — uses SettingsManager for current mode display
  disposables.push(
    vscode.commands.registerCommand('aidev.setMode', async () => {
      const current = _settings.current.mode;
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
        // SettingsManager picks up the change automatically
      }
    }),
  );

  return disposables;
}
