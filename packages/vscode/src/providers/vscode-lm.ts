import * as vscode from 'vscode';
import type {
  IModelProvider,
  ResolvedModel,
  ModelRequestOptions,
  ModelResponse,
  ModelTier,
  ModelRole,
  OperatingMode,
} from '@aidev/core';
import { resolveTier, resolveModelId } from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';

/**
 * Model provider using the VSCode Language Model API (vscode.lm).
 *
 * Works with:
 * - GitHub Copilot in VSCode (models exposed via Copilot subscription)
 * - Cursor's built-in models (exposed via the same API surface)
 *
 * The vscode.lm API is available in VSCode 1.93+ (stable since 1.95).
 */
export class VscodeLmProvider implements IModelProvider {
  readonly id = 'vscode-lm';
  readonly name = 'IDE Language Models';

  private settingsManager: SettingsManager | undefined;

  /**
   * Inject settings manager after construction.
   * Called by ProviderManager during initialization.
   */
  setSettingsManager(settings: SettingsManager): void {
    this.settingsManager = settings;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ResolvedModel[]> {
    try {
      const models = await vscode.lm.selectChatModels();
      return models.map((m) => ({
        id: m.id,
        name: m.name,
        tier: 'mid' as ModelTier,
        role: 'chat' as ModelRole,
        provider: m.vendor,
      }));
    } catch {
      return [];
    }
  }

  async sendRequest(options: ModelRequestOptions): Promise<ModelResponse> {
    if (!this.settingsManager) {
      throw new Error('VscodeLmProvider: SettingsManager not initialized.');
    }

    const settings = this.settingsManager.current;
    const model = await this.selectModel(settings.mode, options.role, settings.modelTiers);

    if (!model) {
      throw new Error(
        `No model available for role "${options.role}" in mode "${settings.mode}". ` +
          'Configure model tiers in AIDev settings or check that your IDE provides models.',
      );
    }

    // Build messages for the vscode.lm API
    const messages = options.messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return vscode.LanguageModelChatMessage.User(`[System] ${msg.content}`);
        case 'user':
          return vscode.LanguageModelChatMessage.User(msg.content);
        case 'assistant':
          return vscode.LanguageModelChatMessage.Assistant(msg.content);
        default:
          return vscode.LanguageModelChatMessage.User(msg.content);
      }
    });

    // Send the request
    const requestOptions: vscode.LanguageModelChatRequestOptions = {};

    const cancellation = new vscode.CancellationTokenSource();

    // Wire up external abort signal to VSCode cancellation
    if (options.signal) {
      options.signal.addEventListener('abort', () => cancellation.cancel(), { once: true });
    }

    try {
      const response = await model.sendRequest(messages, requestOptions, cancellation.token);

      // Collect the streamed response
      let content = '';
      for await (const fragment of response.text) {
        content += fragment;
      }

      return {
        content,
        model: {
          id: model.id,
          name: model.name,
          tier: resolveTier(settings.mode, options.role),
          role: options.role,
          provider: model.vendor,
        },
      };
    } finally {
      cancellation.dispose();
    }
  }

  dispose(): void {
    // No persistent resources
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Select the best available model for the given mode and role.
   *
   * Resolution strategy:
   * 1. Resolve the target model ID from tier map
   * 2. Try exact match against available models
   * 3. Try partial match (model ID contains the configured string)
   * 4. Fall back to first available model
   */
  private async selectModel(
    mode: OperatingMode,
    role: ModelRole,
    tierMap: { high: string; mid: string; low: string },
  ): Promise<vscode.LanguageModelChat | undefined> {
    const targetId = resolveModelId(mode, role, tierMap);
    const available = await vscode.lm.selectChatModels();

    if (available.length === 0) return undefined;

    // If no model configured for this tier, use first available
    if (!targetId) return available[0];

    // Exact match
    const exact = available.find((m) => m.id === targetId);
    if (exact) return exact;

    // Partial match — configured ID is a substring of the model ID
    // Allows users to configure 'claude-3-opus' to match 'claude-3-opus-20240229'
    const partial = available.find(
      (m) => m.id.includes(targetId) || m.name.toLowerCase().includes(targetId.toLowerCase()),
    );
    if (partial) return partial;

    // Last resort: first available
    console.warn(
      `AIDev: Model "${targetId}" not found among ${String(available.length)} available models. Using "${available[0].name}".`,
    );
    return available[0];
  }
}
