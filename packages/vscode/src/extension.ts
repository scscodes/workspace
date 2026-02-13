import * as vscode from 'vscode';
import { SettingsManager } from './settings/index.js';
import { ProviderManager } from './providers/index.js';
import { ToolRunner } from './tools/index.js';
import { registerCommands } from './commands/index.js';
import { registerChatParticipant } from './chat/index.js';
import { registerSidebar } from './sidebar/index.js';
import { createStatusBarItems } from './status/index.js';

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

    // 3. Tool runner — orchestrates tool execution with providers + settings
    console.log('AIDev: Initializing ToolRunner...');
    const toolRunner = new ToolRunner(settings, providers);
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

    // 4. UI components — all independent of each other
    console.log('AIDev: Registering UI components...');
    context.subscriptions.push(
      ...registerCommands(context, settings, toolRunner),
      ...registerChatParticipant(context, providers, toolRunner),
      ...registerSidebar(context, toolRunner),
      ...createStatusBarItems(context),
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
