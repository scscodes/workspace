import * as vscode from 'vscode';
import type {
  ExtensionSettings,
  OperatingMode,
  ModelProviderSource,
  SupportedLanguage,
} from '@aidev/core';
import { normalizeSettings, validateSettings, DEFAULT_COMMIT_CONSTRAINTS } from '@aidev/core';

/** VSCode configuration namespace — all settings live under this prefix. */
const CONFIG_NAMESPACE = 'aidev';

/**
 * Centralized settings manager for the AIDev extension.
 *
 * All VSCode-side code reads settings through this manager — never
 * directly from vscode.workspace.getConfiguration. This ensures:
 * - Single read path with normalization and validation
 * - Reactive change notifications for in-flight updates
 * - Consistent defaults sourced from @aidev/core
 */
export class SettingsManager implements vscode.Disposable {
  private _settings: ExtensionSettings;
  private readonly _onDidChange = new vscode.EventEmitter<SettingsChangeEvent>();
  private readonly _disposables: vscode.Disposable[] = [];

  /** Fires when any aidev.* setting changes. */
  readonly onDidChange: vscode.Event<SettingsChangeEvent> = this._onDidChange.event;

  constructor() {
    this._settings = this.readFromConfig();

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
          const previous = this._settings;
          this._settings = this.readFromConfig();
          this._onDidChange.fire({ previous, current: this._settings });
        }
      }),
    );
  }

  /** Current resolved settings. Always valid and complete. */
  get current(): ExtensionSettings {
    return this._settings;
  }

  /** Force re-read from VSCode configuration. Rarely needed. */
  refresh(): ExtensionSettings {
    this._settings = this.readFromConfig();
    return this._settings;
  }

  /**
   * Read raw config values and normalize into a complete ExtensionSettings.
   *
   * VSCode guarantees defaults for all contributes.configuration properties,
   * so reads always return defined values. normalizeSettings is a safety net
   * to ensure the type contract is always satisfied.
   *
   * NOTE: The default values in packages/vscode/package.json (contributes.configuration)
   * MUST stay in sync with packages/core/src/settings/defaults.ts. Both define the same
   * defaults in different formats — package.json for the VSCode settings UI, defaults.ts
   * for runtime normalization. If they diverge, the runtime defaults (defaults.ts) win.
   */
  private readFromConfig(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);

    const settings = normalizeSettings({
      mode: config.get<OperatingMode>('mode'),
      providerSource: config.get<ModelProviderSource>('providerSource'),
      enabledLanguages: config.get<SupportedLanguage[]>('enabledLanguages'),
      preCommitDryRun: config.get<boolean>('preCommitDryRun'),
      modelTiers: {
        high: config.get<string>('modelTiers.high', ''),
        mid: config.get<string>('modelTiers.mid', ''),
        low: config.get<string>('modelTiers.low', ''),
      },
      commitConstraints: {
        minLength: config.get<number>(
          'commitConstraints.minLength',
          DEFAULT_COMMIT_CONSTRAINTS.minLength,
        ),
        maxLength: config.get<number>(
          'commitConstraints.maxLength',
          DEFAULT_COMMIT_CONSTRAINTS.maxLength,
        ),
        prefix: config.get<string>('commitConstraints.prefix', ''),
        suffix: config.get<string>('commitConstraints.suffix', ''),
        enforcement: config.get<'warn' | 'deny'>('commitConstraints.enforcement', 'warn'),
      },
      directApi: this.readDirectApi(config),
    });

    // Validate and warn — never block on bad settings, they fall back to defaults
    const errors = validateSettings(settings);
    for (const error of errors) {
      console.warn(`AIDev settings: ${error}`);
    }

    return settings;
  }

  private readDirectApi(
    config: vscode.WorkspaceConfiguration,
  ): ExtensionSettings['directApi'] {
    const apiKey = config.get<string>('directApi.apiKey', '');
    if (!apiKey) return undefined;

    const provider = config.get<string>('directApi.provider', 'anthropic');
    return {
      provider: provider === 'openai' ? 'openai' : 'anthropic',
      apiKey,
      baseUrl: config.get<string>('directApi.baseUrl', '') || undefined,
    };
  }

  dispose(): void {
    this._onDidChange.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}

/**
 * Payload for settings change events.
 * Consumers can diff previous vs current to react to specific changes.
 */
export interface SettingsChangeEvent {
  previous: ExtensionSettings;
  current: ExtensionSettings;
}
