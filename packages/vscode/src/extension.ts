import * as vscode from 'vscode';
import { SettingsManager } from './settings/index.js';
import { ProviderManager } from './providers/index.js';
import { registerCommands } from './commands/index.js';
import { registerChatParticipant } from './chat/index.js';
import { registerSidebar } from './sidebar/index.js';
import { createStatusBarItems } from './status/index.js';

/**
 * Extension activation.
 *
 * Initialization order matters:
 * 1. SettingsManager (everything reads from this)
 * 2. ProviderManager (depends on settings)
 * 3. UI components (depend on settings + providers)
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('AIDev: Activating...');

  // 1. Settings — must be first, everything else depends on it
  const settings = new SettingsManager();
  context.subscriptions.push(settings);

  // 2. Model providers — depends on settings for provider source + tier config
  const providers = new ProviderManager(settings);
  await providers.initialize();
  context.subscriptions.push(providers);

  // 3. UI components — all independent of each other
  context.subscriptions.push(
    ...registerCommands(context, settings, providers),
    ...registerChatParticipant(context, providers),
    ...registerSidebar(context),
    ...createStatusBarItems(context),
  );

  console.log('AIDev: Activated.');
}

export function deactivate(): void {
  // All cleanup handled by context.subscriptions disposal
}
