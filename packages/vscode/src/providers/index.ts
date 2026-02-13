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
    try {
      console.log('AIDev: Initializing providers...');
      
      // Register providers and inject settings (only if not already registered)
      if (!this.providers.has('vscode-lm')) {
        console.log('AIDev: Registering VscodeLmProvider...');
        const vscodeLm = new VscodeLmProvider();
        vscodeLm.setSettingsManager(this.settings);
        this.providers.set(vscodeLm.id, vscodeLm);
        console.log('AIDev: VscodeLmProvider registered');
      }

      if (!this.providers.has('direct-api')) {
        console.log('AIDev: Registering DirectApiProvider...');
        const directApi = new DirectApiProvider();
        directApi.setSettingsManager(this.settings);
        this.providers.set(directApi.id, directApi);
        console.log('AIDev: DirectApiProvider registered');
      }

      // Activate from current settings
      console.log('AIDev: Activating provider from settings...');
      await this.activateFromSettings();

      // React to settings changes — supports in-flight provider switching
      // Only register listener once
      if (this.disposables.length === 0) {
        this.disposables.push(
          this.settings.onDidChange(async (e) => {
            if (e.previous.providerSource !== e.current.providerSource) {
              console.log('AIDev: Provider source changed, reactivating...');
              await this.activateFromSettings();
            }
          }),
        );
      }
      
      console.log('AIDev: Provider initialization complete');
    } catch (error) {
      console.error('AIDev: Provider initialization failed:', error);
      throw error;
    }
  }

  /**
   * Retry provider activation. Useful when providers may have become available
   * after initial initialization (e.g., IDE models loading).
   * 
   * Includes a short delay to allow models to load, and retries multiple times.
   */
  async retryActivation(maxRetries = 3, delayMs = 1000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`AIDev: Provider retry attempt ${String(attempt)}/${String(maxRetries)}`);
      
      if (attempt > 1) {
        // Wait before retrying (except first attempt)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      
      await this.activateFromSettings();
      
      if (this.activeProvider) {
        console.log(`AIDev: Provider became available on attempt ${String(attempt)}`);
        return;
      }
    }
    
    console.warn(`AIDev: Provider still not available after ${String(maxRetries)} retries`);
  }

  /**
   * Select and activate the provider matching current settings.
   * Falls back to any available provider if the primary isn't available.
   */
  private async activateFromSettings(): Promise<void> {
    const { providerSource } = this.settings.current;
    const targetId = SOURCE_TO_PROVIDER_ID[providerSource] ?? 'vscode-lm';
    const target = this.providers.get(targetId);

    console.log(`AIDev: Attempting to activate provider: ${targetId}`);

    if (target) {
      try {
        const isAvailable = await target.isAvailable();
        console.log(`AIDev: Provider ${targetId} availability: ${String(isAvailable)}`);
        
        if (isAvailable) {
          this.activeProvider = target;
          console.log(`AIDev: Active model provider: ${target.name}`);
          return;
        } else {
          console.log(`AIDev: Provider ${targetId} is not available`);
        }
      } catch (error) {
        console.error(`AIDev: Error checking availability of ${targetId}:`, error);
      }
    } else {
      console.warn(`AIDev: Provider ${targetId} not found in registry`);
    }

    // Fallback: try other providers
    console.log('AIDev: Trying fallback providers...');
    for (const [id, provider] of this.providers) {
      if (id !== targetId) {
        try {
          const isAvailable = await provider.isAvailable();
          console.log(`AIDev: Fallback provider ${id} availability: ${String(isAvailable)}`);
          
          if (isAvailable) {
            this.activeProvider = provider;
            console.log(`AIDev: Fell back to model provider: ${provider.name}`);
            return;
          }
        } catch (error) {
          console.error(`AIDev: Error checking fallback provider ${id}:`, error);
        }
      }
    }

    this.activeProvider = undefined;
    
    // Check if we're in Cursor and provide helpful guidance
    const isCursor = vscode.env.appName.toLowerCase().includes('cursor');
    if (isCursor) {
      console.warn(
        'AIDev: No model provider available. ' +
        'Cursor IDE does not expose models via vscode.lm API. ' +
        'Please configure direct API keys: set aidev.providerSource to "direct" ' +
        'and configure aidev.directApi.provider and aidev.directApi.apiKey in settings.',
      );
    } else {
      console.warn('AIDev: No model provider available. Tools requiring models will not work.');
    }
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
