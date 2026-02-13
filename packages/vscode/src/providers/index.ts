import * as vscode from 'vscode';
import type { IModelProvider } from '@aidev/core';
import type { SettingsManager } from '../settings/index.js';
import { VscodeLmProvider } from './vscode-lm.js';
import { DirectApiProvider } from './direct-api.js';

/** Maps providerSource setting values to provider IDs */
const SOURCE_TO_PROVIDER_ID: Record<string, string> = {
  ide: 'vscode-lm',
  direct: 'direct-api',
};

/**
 * Manages model provider lifecycle and selection.
 *
 * Reads the active provider source from SettingsManager and switches
 * providers reactively when settings change.
 */
export class ProviderManager implements vscode.Disposable {
  private readonly providers = new Map<string, IModelProvider>();
  private activeProvider: IModelProvider | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly settings: SettingsManager) {}

  /**
   * Register built-in providers and activate the configured one.
   */
  async initialize(): Promise<void> {
    // Register providers
    const vscodeLm = new VscodeLmProvider();
    this.providers.set(vscodeLm.id, vscodeLm);

    const directApi = new DirectApiProvider();
    this.providers.set(directApi.id, directApi);

    // Activate from current settings
    await this.activateFromSettings();

    // React to settings changes — supports in-flight provider switching
    this.disposables.push(
      this.settings.onDidChange(async (e) => {
        if (e.previous.providerSource !== e.current.providerSource) {
          await this.activateFromSettings();
        }
      }),
    );
  }

  /**
   * Select and activate the provider matching current settings.
   * Falls back to any available provider if the primary isn't available.
   */
  private async activateFromSettings(): Promise<void> {
    const { providerSource } = this.settings.current;
    const targetId = SOURCE_TO_PROVIDER_ID[providerSource] ?? 'vscode-lm';
    const target = this.providers.get(targetId);

    if (target && (await target.isAvailable())) {
      this.activeProvider = target;
      console.log(`AIDev: Active model provider: ${target.name}`);
      return;
    }

    // Fallback: try other providers
    for (const [id, provider] of this.providers) {
      if (id !== targetId && (await provider.isAvailable())) {
        this.activeProvider = provider;
        console.log(`AIDev: Fell back to model provider: ${provider.name}`);
        return;
      }
    }

    this.activeProvider = undefined;
    console.warn('AIDev: No model provider available.');
  }

  /** Get the currently active provider. Undefined if none available. */
  getActiveProvider(): IModelProvider | undefined {
    return this.activeProvider;
  }

  /** Get a specific provider by ID. */
  getProvider(id: string): IModelProvider | undefined {
    return this.providers.get(id);
  }

  /** Get the current settings manager (for tools that need settings). */
  getSettings(): SettingsManager {
    return this.settings;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
    this.activeProvider = undefined;
  }
}
