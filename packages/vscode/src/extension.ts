import * as vscode from 'vscode';
import * as path from 'path';
import { SettingsManager } from './settings/index.js';
import { ProviderManager } from './providers/index.js';
import { ToolRunner } from './tools/index.js';
import { registerCommands } from './commands/index.js';
import { registerChatParticipant } from './chat/index.js';
import { registerSidebar } from './sidebar/index.js';
import { createStatusBarItems } from './status/index.js';
import { SqliteTelemetry } from './telemetry/index.js';

/**
 * Extension activation.
 *
 * Initialization order matters — each layer depends on the previous:
 * 1. SettingsManager (everything reads from this)
 * 2. ProviderManager (depends on settings)
 * 3. ToolRunner (depends on settings + providers)
 * 4. UI components (depend on all of the above)
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('AIDev: Activating...');

  try {
    // 1. Settings — single source of truth for all configuration
    console.log('AIDev: Initializing SettingsManager...');
    const settings = new SettingsManager();
    context.subscriptions.push(settings);
    console.log('AIDev: SettingsManager initialized');

    // 2. Model providers — depends on settings for source + tier config
    console.log('AIDev: Initializing ProviderManager...');
    const providers = new ProviderManager(settings);
    try {
      await providers.initialize();
      console.log('AIDev: ProviderManager initialized');
      
      // If no provider available initially, set up a delayed retry
      // Models might load asynchronously after extension activation
      if (!providers.getActiveProvider()) {
        console.log('AIDev: No provider available at activation. Will retry when tools are used.');
        // Don't block activation - retry happens when tools are actually used
      }
    } catch (error) {
      console.error('AIDev: ProviderManager initialization failed:', error);
      // Continue anyway - tools that don't need providers will still work
    }
    context.subscriptions.push(providers);

    // 3. Telemetry — SQLite-based event storage
    console.log('AIDev: Initializing Telemetry...');
    const telemetryDbPath = path.join(context.globalStorageUri.fsPath, 'telemetry.db');
    const telemetry = new SqliteTelemetry(telemetryDbPath);
    context.subscriptions.push({
      dispose: () => telemetry.dispose(),
    });
    console.log('AIDev: Telemetry initialized');

    // 4. Status bar (single item; exposes setBusy/clearBusy for runner)
    const { disposables: statusBarDisposables, statusBar } = createStatusBarItems(context);
    context.subscriptions.push(...statusBarDisposables);

    // 5. Tool runner — orchestrates tool execution with providers + settings + status bar + telemetry
    console.log('AIDev: Initializing ToolRunner...');
    const toolRunner = new ToolRunner(settings, providers, statusBar, telemetry);
    context.subscriptions.push(toolRunner);
    console.log('AIDev: ToolRunner initialized');

    // Verify tool imports work
    try {
      const { TldrTool } = await import('@aidev/core');
      console.log('AIDev: TldrTool import verified:', typeof TldrTool);
      if (typeof TldrTool === 'undefined') {
        console.error('AIDev: TldrTool is undefined after import');
      }
    } catch (error) {
      console.error('AIDev: Failed to import TldrTool:', error);
    }

    // 6. UI components — commands, chat, sidebar (status bar already registered above)
    console.log('AIDev: Registering UI components...');
    context.subscriptions.push(
      ...registerCommands(context, settings, toolRunner),
      ...registerChatParticipant(context, providers, toolRunner, telemetry),
      ...registerSidebar(context, toolRunner),
    );
    console.log('AIDev: UI components registered');

    console.log('AIDev: Activated successfully.');
  } catch (error) {
    console.error('AIDev: Activation failed:', error);
    void vscode.window.showErrorMessage(
      `AIDev activation failed: ${error instanceof Error ? error.message : String(error)}. Check the console for details.`,
    );
    throw error;
  }
}

export function deactivate(): void {
  // All cleanup handled by context.subscriptions disposal
}
