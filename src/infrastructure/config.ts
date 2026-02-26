/**
 * Configuration Provider — Typed schema, validation.
 */

import { ConfigProvider, AppError, Result, failure, success } from "../types";

/**
 * Typed configuration schema.
 * No magic keys; all config paths are explicit constants.
 */
export const CONFIG_KEYS = {
  GIT_AUTOFETCH: "git.autofetch" as const,
  GIT_BRANCH_CLEAN: "git.branchClean" as const,
  HYGIENE_ENABLED: "hygiene.enabled" as const,
  HYGIENE_SCAN_INTERVAL: "hygiene.scanInterval" as const,
  CHAT_MODEL: "chat.model" as const,
  CHAT_CONTEXT_LINES: "chat.contextLines" as const,
  LOG_LEVEL: "log.level" as const,
} as const;

export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];

interface ConfigSchema {
  [CONFIG_KEYS.GIT_AUTOFETCH]: boolean;
  [CONFIG_KEYS.GIT_BRANCH_CLEAN]: boolean;
  [CONFIG_KEYS.HYGIENE_ENABLED]: boolean;
  [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: number; // minutes
  [CONFIG_KEYS.CHAT_MODEL]: string;
  [CONFIG_KEYS.CHAT_CONTEXT_LINES]: number;
  [CONFIG_KEYS.LOG_LEVEL]: "debug" | "info" | "warn" | "error";
}

/**
 * Default configuration values.
 */
const DEFAULTS: ConfigSchema = {
  [CONFIG_KEYS.GIT_AUTOFETCH]: false,
  [CONFIG_KEYS.GIT_BRANCH_CLEAN]: true,
  [CONFIG_KEYS.HYGIENE_ENABLED]: true,
  [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: 60,
  [CONFIG_KEYS.CHAT_MODEL]: "gpt-4",
  [CONFIG_KEYS.CHAT_CONTEXT_LINES]: 50,
  [CONFIG_KEYS.LOG_LEVEL]: "info",
};

export class Config implements ConfigProvider {
  private store: Partial<ConfigSchema> = {};

  /**
   * Load config from VS Code workspace settings.
   * In a real extension, this would call vscode.workspace.getConfiguration().
   * For now, use defaults + in-memory override.
   */
  async initialize(): Promise<Result<void>> {
    try {
      // In extension context, load from vscode.workspace.getConfiguration()
      // For now, just use defaults
      this.store = { ...DEFAULTS };
      return success(void 0);
    } catch (err) {
      const error: AppError = {
        code: "CONFIG_INIT_ERROR",
        message: "Failed to initialize configuration",
        details: err,
      };
      return failure(error);
    }
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.store[key as ConfigKey];
    if (value === undefined) {
      return defaultValue;
    }
    return value as T;
  }

  async set<T>(key: string, value: T): Promise<Result<void>> {
    try {
      this.store[key as ConfigKey] = value as any;
      // In extension context, would call vscode.workspace.getConfiguration().update()
      return success(void 0);
    } catch (err) {
      const error: AppError = {
        code: "CONFIG_SET_ERROR",
        message: `Failed to set config key '${key}'`,
        details: err,
      };
      return failure(error);
    }
  }

  /**
   * Export current configuration (for debugging).
   */
  exportAll(): Partial<ConfigSchema> {
    return { ...this.store };
  }
}
