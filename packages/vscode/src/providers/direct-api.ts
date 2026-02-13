import type {
  IModelProvider,
  ResolvedModel,
  ModelRequestOptions,
  ModelResponse,
  ModelTier,
  ModelRole,
  DirectApiConfig,
  OperatingMode,
} from '@aidev/core';
import { resolveTier, resolveModelId } from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';

// ─── Known Model Catalogs ───────────────────────────────────────────────────

interface KnownModel {
  id: string;
  name: string;
  tier: ModelTier;
}

const ANTHROPIC_MODELS: readonly KnownModel[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'high' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', tier: 'mid' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tier: 'low' },
] as const;

const OPENAI_MODELS: readonly KnownModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', tier: 'high' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'mid' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', tier: 'low' },
] as const;

// ─── API Endpoints ──────────────────────────────────────────────────────────

const ANTHROPIC_DEFAULT_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_API_VERSION = '2023-06-01';

/** Default max tokens for responses */
const DEFAULT_MAX_TOKENS = 4096;

// ─── Provider Implementation ────────────────────────────────────────────────

/**
 * Model provider using direct API keys (Anthropic, OpenAI).
 *
 * Intended as a fallback/override when IDE-provided models are unavailable
 * or when the user needs a specific model not exposed by their IDE.
 *
 * Configuration comes from aidev.directApi.* settings.
 */
export class DirectApiProvider implements IModelProvider {
  readonly id = 'direct-api';
  readonly name = 'Direct API';

  private settingsManager: SettingsManager | undefined;

  setSettingsManager(settings: SettingsManager): void {
    this.settingsManager = settings;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.settingsManager) return false;
    const config = this.settingsManager.current.directApi;
    return !!config?.apiKey;
  }

  async listModels(): Promise<ResolvedModel[]> {
    if (!this.settingsManager) return [];
    const config = this.settingsManager.current.directApi;
    if (!config) return [];

    const catalog = config.provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS;
    return catalog.map((m) => ({
      id: m.id,
      name: m.name,
      tier: m.tier,
      role: 'chat' as ModelRole,
      provider: config.provider,
    }));
  }

  async sendRequest(options: ModelRequestOptions): Promise<ModelResponse> {
    if (!this.settingsManager) {
      throw new Error('DirectApiProvider: SettingsManager not initialized.');
    }

    const settings = this.settingsManager.current;
    const config = settings.directApi;
    if (!config) {
      throw new Error('DirectApiProvider: No API configuration. Set aidev.directApi.* settings.');
    }

    const modelId = this.resolveModel(settings.mode, options.role, config);
    const tier = resolveTier(settings.mode, options.role);

    const response =
      config.provider === 'anthropic'
        ? await this.sendAnthropic(config, modelId, options)
        : await this.sendOpenAI(config, modelId, options);

    return {
      content: response.content,
      model: {
        id: modelId,
        name: modelId,
        tier,
        role: options.role,
        provider: config.provider,
      },
      usage: response.usage,
    };
  }

  dispose(): void {
    // No persistent resources
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private resolveModel(
    mode: OperatingMode,
    role: ModelRole,
    config: DirectApiConfig,
  ): string {
    if (!this.settingsManager) throw new Error('Settings not initialized');

    // First try the user's tier map
    const userModelId = resolveModelId(mode, role, this.settingsManager.current.modelTiers);
    if (userModelId) return userModelId;

    // Fall back to default model for this tier
    const tier = resolveTier(mode, role);
    const catalog = config.provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS;
    const match = catalog.find((m) => m.tier === tier);
    return match?.id ?? catalog[0].id;
  }

  private async sendAnthropic(
    config: DirectApiConfig,
    modelId: string,
    options: ModelRequestOptions,
  ): Promise<{ content: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const url = config.baseUrl || ANTHROPIC_DEFAULT_URL;

    // Separate system message from conversation messages
    const systemMessages = options.messages.filter((m) => m.role === 'system');
    const conversationMessages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: conversationMessages,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => m.content).join('\n');
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Anthropic API error (${String(response.status)}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''),
      usage: data.usage
        ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
          }
        : undefined,
    };
  }

  private async sendOpenAI(
    config: DirectApiConfig,
    modelId: string,
    options: ModelRequestOptions,
  ): Promise<{ content: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const url = config.baseUrl || OPENAI_DEFAULT_URL;

    const messages = options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: modelId,
      messages,
    };

    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${String(response.status)}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
