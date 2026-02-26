/**
 * Enhanced Configuration Provider — Typed schema, validation, and fail-fast semantics.
 * 
 * This module extends the existing Config with:
 * - Schema validation with jsonschema-like checking
 * - get/set/ensure methods
 * - Fail-fast on missing required values
 * - Type-safe configuration access
 * - Default value management
 */

import {
  ConfigProvider,
  AppError,
  Result,
  failure,
  success,
} from "../types";
import { CHAT_SETTINGS, GIT_DEFAULTS, LOG_SETTINGS } from "../constants";

// ============================================================================
// Configuration Schema & Types
// ============================================================================

/**
 * Typed configuration schema.
 * All config keys are explicit constants; no magic string keys.
 */
export const CONFIG_KEYS = {
  // Git configuration
  GIT_AUTOFETCH: "git.autofetch" as const,
  GIT_BRANCH_CLEAN: "git.branchClean" as const,
  GIT_DEFAULT_REMOTE: "git.defaultRemote" as const,
  GIT_DEFAULT_BRANCH: "git.defaultBranch" as const,

  // Hygiene configuration
  HYGIENE_ENABLED: "hygiene.enabled" as const,
  HYGIENE_SCAN_INTERVAL: "hygiene.scanInterval" as const,
  HYGIENE_EXCLUDE_PATTERNS: "hygiene.excludePatterns" as const,

  // Chat configuration
  CHAT_MODEL: "chat.model" as const,
  CHAT_CONTEXT_LINES: "chat.contextLines" as const,
  CHAT_TIMEOUT_MS: "chat.timeoutMs" as const,

  // Logging configuration
  LOG_LEVEL: "log.level" as const,
  LOG_MAX_ENTRIES: "log.maxEntries" as const,
  LOG_INCLUDE_CONTEXT: "log.includeContext" as const,

  // Telemetry configuration
  TELEMETRY_ENABLED: "telemetry.enabled" as const,
  TELEMETRY_VERBOSE: "telemetry.verbose" as const,
} as const;

export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];

/**
 * Configuration schema with all supported types.
 */
export interface ConfigSchema {
  // Git configuration
  [CONFIG_KEYS.GIT_AUTOFETCH]: boolean;
  [CONFIG_KEYS.GIT_BRANCH_CLEAN]: boolean;
  [CONFIG_KEYS.GIT_DEFAULT_REMOTE]: string;
  [CONFIG_KEYS.GIT_DEFAULT_BRANCH]: string;

  // Hygiene configuration
  [CONFIG_KEYS.HYGIENE_ENABLED]: boolean;
  [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: number; // minutes
  [CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS]: string[];

  // Chat configuration
  [CONFIG_KEYS.CHAT_MODEL]: string;
  [CONFIG_KEYS.CHAT_CONTEXT_LINES]: number;
  [CONFIG_KEYS.CHAT_TIMEOUT_MS]: number;

  // Logging configuration
  [CONFIG_KEYS.LOG_LEVEL]: "debug" | "info" | "warn" | "error";
  [CONFIG_KEYS.LOG_MAX_ENTRIES]: number;
  [CONFIG_KEYS.LOG_INCLUDE_CONTEXT]: boolean;

  // Telemetry configuration
  [CONFIG_KEYS.TELEMETRY_ENABLED]: boolean;
  [CONFIG_KEYS.TELEMETRY_VERBOSE]: boolean;
}

/**
 * Validation schema: define type, default, and whether required.
 */
interface ValidationRule {
  type: "boolean" | "string" | "number" | "string[]";
  required?: boolean;
  defaultValue?: unknown;
  validate?: (value: unknown) => boolean;
}

type ValidationSchema = {
  [K in ConfigKey]?: ValidationRule;
};

/**
 * Default configuration values.
 * Ensures all keys have sensible defaults.
 */
const DEFAULTS: ConfigSchema = {
  [CONFIG_KEYS.GIT_AUTOFETCH]: GIT_DEFAULTS.AUTO_FETCH,
  [CONFIG_KEYS.GIT_BRANCH_CLEAN]: GIT_DEFAULTS.AUTO_BRANCH_CLEAN,
  [CONFIG_KEYS.GIT_DEFAULT_REMOTE]: GIT_DEFAULTS.DEFAULT_REMOTE,
  [CONFIG_KEYS.GIT_DEFAULT_BRANCH]: GIT_DEFAULTS.DEFAULT_BRANCH,

  [CONFIG_KEYS.HYGIENE_ENABLED]: true,
  [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: 60,
  [CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS]: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
  ],

  [CONFIG_KEYS.CHAT_MODEL]: CHAT_SETTINGS.DEFAULT_MODEL,
  [CONFIG_KEYS.CHAT_CONTEXT_LINES]: CHAT_SETTINGS.CONTEXT_LINES,
  [CONFIG_KEYS.CHAT_TIMEOUT_MS]: CHAT_SETTINGS.RESPONSE_TIMEOUT_MS,

  [CONFIG_KEYS.LOG_LEVEL]: LOG_SETTINGS.DEFAULT_LEVEL,
  [CONFIG_KEYS.LOG_MAX_ENTRIES]: 1000,
  [CONFIG_KEYS.LOG_INCLUDE_CONTEXT]: LOG_SETTINGS.INCLUDE_CONTEXT,

  [CONFIG_KEYS.TELEMETRY_ENABLED]: true,
  [CONFIG_KEYS.TELEMETRY_VERBOSE]: false,
};

/**
 * Validation rules for each configuration key.
 * Ensures type safety and sensible value ranges.
 */
const VALIDATION_RULES: ValidationSchema = {
  [CONFIG_KEYS.GIT_AUTOFETCH]: {
    type: "boolean",
    defaultValue: DEFAULTS[CONFIG_KEYS.GIT_AUTOFETCH],
  },
  [CONFIG_KEYS.GIT_BRANCH_CLEAN]: {
    type: "boolean",
    defaultValue: DEFAULTS[CONFIG_KEYS.GIT_BRANCH_CLEAN],
  },
  [CONFIG_KEYS.GIT_DEFAULT_REMOTE]: {
    type: "string",
    defaultValue: DEFAULTS[CONFIG_KEYS.GIT_DEFAULT_REMOTE],
    validate: (v) => typeof v === "string" && v.length > 0,
  },
  [CONFIG_KEYS.GIT_DEFAULT_BRANCH]: {
    type: "string",
    defaultValue: DEFAULTS[CONFIG_KEYS.GIT_DEFAULT_BRANCH],
    validate: (v) => typeof v === "string" && v.length > 0,
  },

  [CONFIG_KEYS.HYGIENE_ENABLED]: {
    type: "boolean",
    defaultValue: DEFAULTS[CONFIG_KEYS.HYGIENE_ENABLED],
  },
  [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: {
    type: "number",
    defaultValue: DEFAULTS[CONFIG_KEYS.HYGIENE_SCAN_INTERVAL],
    validate: (v) => typeof v === "number" && v > 0,
  },
  [CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS]: {
    type: "string[]",
    defaultValue: DEFAULTS[CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS],
  },

  [CONFIG_KEYS.CHAT_MODEL]: {
    type: "string",
    defaultValue: DEFAULTS[CONFIG_KEYS.CHAT_MODEL],
    validate: (v) => typeof v === "string" && v.length > 0,
  },
  [CONFIG_KEYS.CHAT_CONTEXT_LINES]: {
    type: "number",
    defaultValue: DEFAULTS[CONFIG_KEYS.CHAT_CONTEXT_LINES],
    validate: (v) => typeof v === "number" && v > 0,
  },
  [CONFIG_KEYS.CHAT_TIMEOUT_MS]: {
    type: "number",
    defaultValue: DEFAULTS[CONFIG_KEYS.CHAT_TIMEOUT_MS],
    validate: (v) => typeof v === "number" && v > 0,
  },

  [CONFIG_KEYS.LOG_LEVEL]: {
    type: "string",
    defaultValue: DEFAULTS[CONFIG_KEYS.LOG_LEVEL],
    validate: (v) =>
      typeof v === "string" &&
      ["debug", "info", "warn", "error"].includes(v),
  },
  [CONFIG_KEYS.LOG_MAX_ENTRIES]: {
    type: "number",
    defaultValue: DEFAULTS[CONFIG_KEYS.LOG_MAX_ENTRIES],
    validate: (v) => typeof v === "number" && v > 0,
  },
  [CONFIG_KEYS.LOG_INCLUDE_CONTEXT]: {
    type: "boolean",
    defaultValue: DEFAULTS[CONFIG_KEYS.LOG_INCLUDE_CONTEXT],
  },

  [CONFIG_KEYS.TELEMETRY_ENABLED]: {
    type: "boolean",
    defaultValue: DEFAULTS[CONFIG_KEYS.TELEMETRY_ENABLED],
  },
  [CONFIG_KEYS.TELEMETRY_VERBOSE]: {
    type: "boolean",
    defaultValue: DEFAULTS[CONFIG_KEYS.TELEMETRY_VERBOSE],
  },
};

// ============================================================================
// Enhanced Configuration Provider
// ============================================================================

/**
 * Type-safe configuration provider with validation and fail-fast semantics.
 *
 * Features:
 * - Type-checked get/set operations
 * - Schema validation with default values
 * - ensure() method for fail-fast semantics
 * - Backward compatible with existing ConfigProvider interface
 */
export class EnhancedConfig implements ConfigProvider {
  private store: Partial<ConfigSchema> = {};

  /**
   * Initialize configuration with defaults.
   * In a real VS Code extension, this would load from workspace settings.
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Load from vscode.workspace.getConfiguration() in extension context
      // For now, use defaults
      this.store = { ...DEFAULTS };
      return success(void 0);
    } catch (err) {
      const error: AppError = {
        code: "CONFIG_INIT_ERROR",
        message: "Failed to initialize configuration",
        details: err,
        context: "EnhancedConfig.initialize",
      };
      return failure(error);
    }
  }

  /**
   * Type-safe get with optional default override.
   * Returns undefined if key not found and no default provided.
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.store[key as ConfigKey];

    if (value !== undefined) {
      return value as T;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // Return schema default if available
    const rule = VALIDATION_RULES[key as ConfigKey];
    if (rule?.defaultValue !== undefined) {
      return rule.defaultValue as T;
    }

    return undefined;
  }

  /**
   * Type-safe set with validation.
   * Validates value against schema before storing.
   */
  async set<T>(key: string, value: T): Promise<Result<void>> {
    try {
      const rule = VALIDATION_RULES[key as ConfigKey];

      // Validate type and custom rules
      if (rule) {
        const typeMatch = this.validateType(value, rule.type);
        if (!typeMatch) {
          const error: AppError = {
            code: "CONFIG_VALIDATION_ERROR",
            message: `Invalid type for config key '${key}': expected ${rule.type}`,
            context: "EnhancedConfig.set",
          };
          return failure(error);
        }

        if (rule.validate && !rule.validate(value)) {
          const error: AppError = {
            code: "CONFIG_VALIDATION_ERROR",
            message: `Invalid value for config key '${key}'`,
            context: "EnhancedConfig.set",
          };
          return failure(error);
        }
      }

      this.store[key as ConfigKey] = value as any;

      // In extension context, would call:
      // await vscode.workspace.getConfiguration().update(key, value, ConfigurationTarget.Workspace);

      return success(void 0);
    } catch (err) {
      const error: AppError = {
        code: "CONFIG_SET_ERROR",
        message: `Failed to set config key '${key}'`,
        details: err,
        context: "EnhancedConfig.set",
      };
      return failure(error);
    }
  }

  /**
   * Fail-fast getter: throws if key is missing or invalid.
   * Use for required configuration values that must exist.
   *
   * @throws AppError if key is missing or invalid
   */
  ensure<T>(key: string, defaultValue?: T): T {
    const value = this.get<T>(key, defaultValue);

    if (value === undefined) {
      throw {
        code: "CONFIG_MISSING_REQUIRED",
        message: `Required config key '${key}' is not set and no default provided`,
        context: "EnhancedConfig.ensure",
      } as AppError;
    }

    return value;
  }

  /**
   * Validate type of a value against a validation rule type.
   */
  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case "boolean":
        return typeof value === "boolean";
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && !isNaN(value);
      case "string[]":
        return Array.isArray(value) && value.every((v) => typeof v === "string");
      default:
        return true;
    }
  }

  /**
   * Export current configuration (for debugging or persistence).
   */
  exportAll(): Partial<ConfigSchema> {
    return { ...this.store };
  }

  /**
   * Export configuration as JSON string for serialization.
   */
  exportJSON(): string {
    return JSON.stringify(this.exportAll(), null, 2);
  }

  /**
   * Reset all configuration to defaults.
   */
  async reset(): Promise<Result<void>> {
    try {
      this.store = { ...DEFAULTS };
      return success(void 0);
    } catch (err) {
      const error: AppError = {
        code: "CONFIG_INIT_ERROR",
        message: "Failed to reset configuration",
        details: err,
        context: "EnhancedConfig.reset",
      };
      return failure(error);
    }
  }

  /**
   * Check if a configuration key exists and has a value.
   */
  has(key: string): boolean {
    return this.store[key as ConfigKey] !== undefined;
  }

  /**
   * Get all available configuration keys.
   */
  keys(): ConfigKey[] {
    return Object.keys(CONFIG_KEYS).map(
      (k) => CONFIG_KEYS[k as keyof typeof CONFIG_KEYS]
    );
  }
}

/**
 * Backward compatibility: DEFAULTS and VALIDATION_RULES are available for export.
 * CONFIG_KEYS is already exported above.
 */
export { DEFAULTS, VALIDATION_RULES };
