import * as vscode from 'vscode';
import type {
  IModelProvider,
  ResolvedModel,
  ModelRequestOptions,
  ModelResponse,
  ModelTier,
  ModelRole,
  OperatingMode,
  StopReason,
} from '@aidev/core';
import { resolveTier, resolveModelId } from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';

/**
 * Model provider using the VSCode Language Model API (vscode.lm).
 *
 * Works with:
 * - GitHub Copilot in VSCode (models exposed via Copilot subscription)
 *
 * IMPORTANT: Cursor IDE does NOT expose models through vscode.lm API.
 * If you're using Cursor, you must use the Direct API provider instead
 * (aidev.providerSource: "direct" with API keys configured).
 *
 * The vscode.lm API is available in VSCode 1.95+.
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
    // Check if vscode.lm API exists
    if (!vscode.lm) {
      console.log('AIDev: vscode.lm API not available');
      return false;
    }

    try {
      const models = await vscode.lm.selectChatModels();
      console.log(`AIDev: vscode.lm.selectChatModels() returned ${String(models.length)} model(s)`);
      
      if (models.length > 0) {
        console.log(`AIDev: Available models: ${models.map(m => `${m.name} (${m.id})`).join(', ')}`);
        return true;
      } else {
        // Cursor IDE doesn't expose models via vscode.lm API
        // This is expected behavior in Cursor - users should use direct API provider
        const isCursor = vscode.env.appName.toLowerCase().includes('cursor');
        if (isCursor) {
          console.log('AIDev: No models from vscode.lm API (expected in Cursor). Use direct API provider instead.');
        } else {
          console.log('AIDev: No models available from vscode.lm API. Ensure GitHub Copilot is installed and signed in.');
        }
        return false;
      }
    } catch (error) {
      console.error('AIDev: Error checking vscode.lm availability:', error);
      return false;
    }
  }

  async listModels(): Promise<ResolvedModel[]> {
    if (!vscode.lm) {
      console.log('AIDev: vscode.lm API not available for listModels');
      return [];
    }

    try {
      const models = await vscode.lm.selectChatModels();
      console.log(`AIDev: listModels() found ${String(models.length)} model(s)`);
      
      return models.map((m) => ({
        id: m.id,
        name: m.name,
        tier: 'mid' as ModelTier,
        role: 'chat' as ModelRole,
        provider: m.vendor,
      }));
    } catch (error) {
      console.error('AIDev: Error listing models:', error);
      return [];
    }
  }

  async sendRequest(options: ModelRequestOptions): Promise<ModelResponse> {
    if (!this.settingsManager) {
      throw new Error('VscodeLmProvider: SettingsManager not initialized.');
    }

    if (!vscode.lm) {
      throw new Error(
        'vscode.lm API is not available. This extension requires VSCode 1.95+ or Cursor with language model support.',
      );
    }

    const settings = this.settingsManager.current;
    const model = await this.selectModel(settings.mode, options.role, settings.modelTiers);

    if (!model) {
      // Try to get any available model as last resort
      console.log('AIDev: Model selection returned undefined, checking for any available models...');
      const available = await vscode.lm.selectChatModels();
      console.log(`AIDev: Found ${String(available.length)} available model(s) for fallback`);
      
      if (available.length === 0) {
        const isCursor = vscode.env.appName.toLowerCase().includes('cursor');
        const errorMsg = isCursor
          ? 'Cursor IDE does not expose models through vscode.lm API. ' +
            'Please use the Direct API provider instead: set aidev.providerSource to "direct" ' +
            'and configure your API keys (aidev.directApi.provider and aidev.directApi.apiKey).'
          : 'No language models available from vscode.lm API. ' +
            'Ensure GitHub Copilot is installed and signed in.';
        console.error(`AIDev: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      // Use first available model if selection failed
      const fallbackModel = available[0];
      console.warn(
        `AIDev: Model selection failed, using fallback: ${fallbackModel.name} (${fallbackModel.id})`,
      );
      return this.sendRequestWithModel(fallbackModel, options, settings);
    }

    return this.sendRequestWithModel(model, options, settings);
  }

  private async sendRequestWithModel(
    model: vscode.LanguageModelChat,
    options: ModelRequestOptions,
    settings: import('@aidev/core').ExtensionSettings,
  ): Promise<ModelResponse> {

    // Build messages for the vscode.lm API
    // TODO: Add native vscode.lm tool support when the LanguageModelChatRequestOptions.tools
    // API stabilizes across VSCode versions. For now, tool calling is handled by the
    // DirectApiProvider, and the agent loop gracefully handles providers that don't
    // return toolCalls (treats response as final text).
    const messages = options.messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return vscode.LanguageModelChatMessage.User(`[System] ${msg.content}`);
        case 'user':
          return vscode.LanguageModelChatMessage.User(msg.content);
        case 'assistant': {
          let content = msg.content;
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const toolCallSummary = msg.toolCalls
              .map((tc) => `[Tool Call: ${tc.name}(${JSON.stringify(tc.arguments)})]`)
              .join('\n');
            content = content ? `${content}\n${toolCallSummary}` : toolCallSummary;
          }
          return vscode.LanguageModelChatMessage.Assistant(content);
        }
        case 'tool_result':
          return vscode.LanguageModelChatMessage.User(
            `[Tool Result${msg.toolCallId ? ` for ${msg.toolCallId}` : ''}]\n${msg.content}`,
          );
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
        stopReason: 'end_turn' as StopReason,
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
