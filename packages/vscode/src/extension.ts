import * as vscode from 'vscode';
import { SettingsManager } from './settings/index.js';
import { ProviderManager } from './providers/index.js';
import { ToolRunner } from './tools/index.js';
import { registerCommands } from './commands/index.js';
import { registerChatParticipant } from './chat/index.js';
import { registerSidebar, AidevSidebarProvider } from './sidebar/index.js';
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

  // 1. Settings — single source of truth for all configuration
  const settings = new SettingsManager();
  context.subscriptions.push(settings);

  // 2. Model providers — depends on settings for source + tier config
  const providers = new ProviderManager(settings);
  await providers.initialize();
  context.subscriptions.push(providers);

  // 3. Tool runner — orchestrates tool execution with providers + settings
  const toolRunner = new ToolRunner(settings, providers);
  context.subscriptions.push(toolRunner);

  // 4. UI components — all independent of each other
  const sidebarProvider = new AidevSidebarProvider(context, settings, toolRunner);

  context.subscriptions.push(
    ...registerCommands(context, settings, toolRunner),
    ...registerChatParticipant(context, providers, toolRunner),
    ...registerSidebar(context, toolRunner),
    vscode.window.registerWebviewViewProvider(AidevSidebarProvider.viewType, sidebarProvider),
    ...createStatusBarItems(context),
  );

  console.log('AIDev: Activated.');
}

export function deactivate(): void {
  // All cleanup handled by context.subscriptions disposal
}
