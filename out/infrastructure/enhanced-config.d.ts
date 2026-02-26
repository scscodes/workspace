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
import { ConfigProvider, Result } from "../types";
/**
 * Typed configuration schema.
 * All config keys are explicit constants; no magic string keys.
 */
export declare const CONFIG_KEYS: {
    readonly GIT_AUTOFETCH: "git.autofetch";
    readonly GIT_BRANCH_CLEAN: "git.branchClean";
    readonly GIT_DEFAULT_REMOTE: "git.defaultRemote";
    readonly GIT_DEFAULT_BRANCH: "git.defaultBranch";
    readonly HYGIENE_ENABLED: "hygiene.enabled";
    readonly HYGIENE_SCAN_INTERVAL: "hygiene.scanInterval";
    readonly HYGIENE_EXCLUDE_PATTERNS: "hygiene.excludePatterns";
    readonly CHAT_MODEL: "chat.model";
    readonly CHAT_CONTEXT_LINES: "chat.contextLines";
    readonly CHAT_TIMEOUT_MS: "chat.timeoutMs";
    readonly LOG_LEVEL: "log.level";
    readonly LOG_MAX_ENTRIES: "log.maxEntries";
    readonly LOG_INCLUDE_CONTEXT: "log.includeContext";
    readonly TELEMETRY_ENABLED: "telemetry.enabled";
    readonly TELEMETRY_VERBOSE: "telemetry.verbose";
};
export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];
/**
 * Configuration schema with all supported types.
 */
export interface ConfigSchema {
    [CONFIG_KEYS.GIT_AUTOFETCH]: boolean;
    [CONFIG_KEYS.GIT_BRANCH_CLEAN]: boolean;
    [CONFIG_KEYS.GIT_DEFAULT_REMOTE]: string;
    [CONFIG_KEYS.GIT_DEFAULT_BRANCH]: string;
    [CONFIG_KEYS.HYGIENE_ENABLED]: boolean;
    [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: number;
    [CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS]: string[];
    [CONFIG_KEYS.CHAT_MODEL]: string;
    [CONFIG_KEYS.CHAT_CONTEXT_LINES]: number;
    [CONFIG_KEYS.CHAT_TIMEOUT_MS]: number;
    [CONFIG_KEYS.LOG_LEVEL]: "debug" | "info" | "warn" | "error";
    [CONFIG_KEYS.LOG_MAX_ENTRIES]: number;
    [CONFIG_KEYS.LOG_INCLUDE_CONTEXT]: boolean;
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
declare const DEFAULTS: ConfigSchema;
/**
 * Validation rules for each configuration key.
 * Ensures type safety and sensible value ranges.
 */
declare const VALIDATION_RULES: ValidationSchema;
/**
 * Type-safe configuration provider with validation and fail-fast semantics.
 *
 * Features:
 * - Type-checked get/set operations
 * - Schema validation with default values
 * - ensure() method for fail-fast semantics
 * - Backward compatible with existing ConfigProvider interface
 */
export declare class EnhancedConfig implements ConfigProvider {
    private store;
    /**
     * Initialize configuration with defaults.
     * In a real VS Code extension, this would load from workspace settings.
     */
    initialize(): Promise<Result<void>>;
    /**
     * Type-safe get with optional default override.
     * Returns undefined if key not found and no default provided.
     */
    get<T>(key: string, defaultValue?: T): T | undefined;
    /**
     * Type-safe set with validation.
     * Validates value against schema before storing.
     */
    set<T>(key: string, value: T): Promise<Result<void>>;
    /**
     * Fail-fast getter: throws if key is missing or invalid.
     * Use for required configuration values that must exist.
     *
     * @throws AppError if key is missing or invalid
     */
    ensure<T>(key: string, defaultValue?: T): T;
    /**
     * Validate type of a value against a validation rule type.
     */
    private validateType;
    /**
     * Export current configuration (for debugging or persistence).
     */
    exportAll(): Partial<ConfigSchema>;
    /**
     * Export configuration as JSON string for serialization.
     */
    exportJSON(): string;
    /**
     * Reset all configuration to defaults.
     */
    reset(): Promise<Result<void>>;
    /**
     * Check if a configuration key exists and has a value.
     */
    has(key: string): boolean;
    /**
     * Get all available configuration keys.
     */
    keys(): ConfigKey[];
}
/**
 * Backward compatibility: DEFAULTS and VALIDATION_RULES are available for export.
 * CONFIG_KEYS is already exported above.
 */
export { DEFAULTS, VALIDATION_RULES };
//# sourceMappingURL=enhanced-config.d.ts.map