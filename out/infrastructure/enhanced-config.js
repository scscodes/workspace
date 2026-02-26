"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATION_RULES = exports.DEFAULTS = exports.EnhancedConfig = exports.CONFIG_KEYS = void 0;
const types_1 = require("../types");
const constants_1 = require("../constants");
// ============================================================================
// Configuration Schema & Types
// ============================================================================
/**
 * Typed configuration schema.
 * All config keys are explicit constants; no magic string keys.
 */
exports.CONFIG_KEYS = {
    // Git configuration
    GIT_AUTOFETCH: "git.autofetch",
    GIT_BRANCH_CLEAN: "git.branchClean",
    GIT_DEFAULT_REMOTE: "git.defaultRemote",
    GIT_DEFAULT_BRANCH: "git.defaultBranch",
    // Hygiene configuration
    HYGIENE_ENABLED: "hygiene.enabled",
    HYGIENE_SCAN_INTERVAL: "hygiene.scanInterval",
    HYGIENE_EXCLUDE_PATTERNS: "hygiene.excludePatterns",
    // Chat configuration
    CHAT_MODEL: "chat.model",
    CHAT_CONTEXT_LINES: "chat.contextLines",
    CHAT_TIMEOUT_MS: "chat.timeoutMs",
    // Logging configuration
    LOG_LEVEL: "log.level",
    LOG_MAX_ENTRIES: "log.maxEntries",
    LOG_INCLUDE_CONTEXT: "log.includeContext",
    // Telemetry configuration
    TELEMETRY_ENABLED: "telemetry.enabled",
    TELEMETRY_VERBOSE: "telemetry.verbose",
};
/**
 * Default configuration values.
 * Ensures all keys have sensible defaults.
 */
const DEFAULTS = {
    [exports.CONFIG_KEYS.GIT_AUTOFETCH]: constants_1.GIT_DEFAULTS.AUTO_FETCH,
    [exports.CONFIG_KEYS.GIT_BRANCH_CLEAN]: constants_1.GIT_DEFAULTS.AUTO_BRANCH_CLEAN,
    [exports.CONFIG_KEYS.GIT_DEFAULT_REMOTE]: constants_1.GIT_DEFAULTS.DEFAULT_REMOTE,
    [exports.CONFIG_KEYS.GIT_DEFAULT_BRANCH]: constants_1.GIT_DEFAULTS.DEFAULT_BRANCH,
    [exports.CONFIG_KEYS.HYGIENE_ENABLED]: true,
    [exports.CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: 60,
    [exports.CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS]: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
    ],
    [exports.CONFIG_KEYS.CHAT_MODEL]: constants_1.CHAT_SETTINGS.DEFAULT_MODEL,
    [exports.CONFIG_KEYS.CHAT_CONTEXT_LINES]: constants_1.CHAT_SETTINGS.CONTEXT_LINES,
    [exports.CONFIG_KEYS.CHAT_TIMEOUT_MS]: constants_1.CHAT_SETTINGS.RESPONSE_TIMEOUT_MS,
    [exports.CONFIG_KEYS.LOG_LEVEL]: constants_1.LOG_SETTINGS.DEFAULT_LEVEL,
    [exports.CONFIG_KEYS.LOG_MAX_ENTRIES]: 1000,
    [exports.CONFIG_KEYS.LOG_INCLUDE_CONTEXT]: constants_1.LOG_SETTINGS.INCLUDE_CONTEXT,
    [exports.CONFIG_KEYS.TELEMETRY_ENABLED]: true,
    [exports.CONFIG_KEYS.TELEMETRY_VERBOSE]: false,
};
exports.DEFAULTS = DEFAULTS;
/**
 * Validation rules for each configuration key.
 * Ensures type safety and sensible value ranges.
 */
const VALIDATION_RULES = {
    [exports.CONFIG_KEYS.GIT_AUTOFETCH]: {
        type: "boolean",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.GIT_AUTOFETCH],
    },
    [exports.CONFIG_KEYS.GIT_BRANCH_CLEAN]: {
        type: "boolean",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.GIT_BRANCH_CLEAN],
    },
    [exports.CONFIG_KEYS.GIT_DEFAULT_REMOTE]: {
        type: "string",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.GIT_DEFAULT_REMOTE],
        validate: (v) => typeof v === "string" && v.length > 0,
    },
    [exports.CONFIG_KEYS.GIT_DEFAULT_BRANCH]: {
        type: "string",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.GIT_DEFAULT_BRANCH],
        validate: (v) => typeof v === "string" && v.length > 0,
    },
    [exports.CONFIG_KEYS.HYGIENE_ENABLED]: {
        type: "boolean",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.HYGIENE_ENABLED],
    },
    [exports.CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: {
        type: "number",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.HYGIENE_SCAN_INTERVAL],
        validate: (v) => typeof v === "number" && v > 0,
    },
    [exports.CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS]: {
        type: "string[]",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.HYGIENE_EXCLUDE_PATTERNS],
    },
    [exports.CONFIG_KEYS.CHAT_MODEL]: {
        type: "string",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.CHAT_MODEL],
        validate: (v) => typeof v === "string" && v.length > 0,
    },
    [exports.CONFIG_KEYS.CHAT_CONTEXT_LINES]: {
        type: "number",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.CHAT_CONTEXT_LINES],
        validate: (v) => typeof v === "number" && v > 0,
    },
    [exports.CONFIG_KEYS.CHAT_TIMEOUT_MS]: {
        type: "number",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.CHAT_TIMEOUT_MS],
        validate: (v) => typeof v === "number" && v > 0,
    },
    [exports.CONFIG_KEYS.LOG_LEVEL]: {
        type: "string",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.LOG_LEVEL],
        validate: (v) => typeof v === "string" &&
            ["debug", "info", "warn", "error"].includes(v),
    },
    [exports.CONFIG_KEYS.LOG_MAX_ENTRIES]: {
        type: "number",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.LOG_MAX_ENTRIES],
        validate: (v) => typeof v === "number" && v > 0,
    },
    [exports.CONFIG_KEYS.LOG_INCLUDE_CONTEXT]: {
        type: "boolean",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.LOG_INCLUDE_CONTEXT],
    },
    [exports.CONFIG_KEYS.TELEMETRY_ENABLED]: {
        type: "boolean",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.TELEMETRY_ENABLED],
    },
    [exports.CONFIG_KEYS.TELEMETRY_VERBOSE]: {
        type: "boolean",
        defaultValue: DEFAULTS[exports.CONFIG_KEYS.TELEMETRY_VERBOSE],
    },
};
exports.VALIDATION_RULES = VALIDATION_RULES;
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
class EnhancedConfig {
    constructor() {
        this.store = {};
    }
    /**
     * Initialize configuration with defaults.
     * In a real VS Code extension, this would load from workspace settings.
     */
    async initialize() {
        try {
            // Load from vscode.workspace.getConfiguration() in extension context
            // For now, use defaults
            this.store = { ...DEFAULTS };
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            const error = {
                code: "CONFIG_INIT_ERROR",
                message: "Failed to initialize configuration",
                details: err,
                context: "EnhancedConfig.initialize",
            };
            return (0, types_1.failure)(error);
        }
    }
    /**
     * Type-safe get with optional default override.
     * Returns undefined if key not found and no default provided.
     */
    get(key, defaultValue) {
        const value = this.store[key];
        if (value !== undefined) {
            return value;
        }
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        // Return schema default if available
        const rule = VALIDATION_RULES[key];
        if (rule?.defaultValue !== undefined) {
            return rule.defaultValue;
        }
        return undefined;
    }
    /**
     * Type-safe set with validation.
     * Validates value against schema before storing.
     */
    async set(key, value) {
        try {
            const rule = VALIDATION_RULES[key];
            // Validate type and custom rules
            if (rule) {
                const typeMatch = this.validateType(value, rule.type);
                if (!typeMatch) {
                    const error = {
                        code: "CONFIG_VALIDATION_ERROR",
                        message: `Invalid type for config key '${key}': expected ${rule.type}`,
                        context: "EnhancedConfig.set",
                    };
                    return (0, types_1.failure)(error);
                }
                if (rule.validate && !rule.validate(value)) {
                    const error = {
                        code: "CONFIG_VALIDATION_ERROR",
                        message: `Invalid value for config key '${key}'`,
                        context: "EnhancedConfig.set",
                    };
                    return (0, types_1.failure)(error);
                }
            }
            this.store[key] = value;
            // In extension context, would call:
            // await vscode.workspace.getConfiguration().update(key, value, ConfigurationTarget.Workspace);
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            const error = {
                code: "CONFIG_SET_ERROR",
                message: `Failed to set config key '${key}'`,
                details: err,
                context: "EnhancedConfig.set",
            };
            return (0, types_1.failure)(error);
        }
    }
    /**
     * Fail-fast getter: throws if key is missing or invalid.
     * Use for required configuration values that must exist.
     *
     * @throws AppError if key is missing or invalid
     */
    ensure(key, defaultValue) {
        const value = this.get(key, defaultValue);
        if (value === undefined) {
            throw {
                code: "CONFIG_MISSING_REQUIRED",
                message: `Required config key '${key}' is not set and no default provided`,
                context: "EnhancedConfig.ensure",
            };
        }
        return value;
    }
    /**
     * Validate type of a value against a validation rule type.
     */
    validateType(value, expectedType) {
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
    exportAll() {
        return { ...this.store };
    }
    /**
     * Export configuration as JSON string for serialization.
     */
    exportJSON() {
        return JSON.stringify(this.exportAll(), null, 2);
    }
    /**
     * Reset all configuration to defaults.
     */
    async reset() {
        try {
            this.store = { ...DEFAULTS };
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            const error = {
                code: "CONFIG_INIT_ERROR",
                message: "Failed to reset configuration",
                details: err,
                context: "EnhancedConfig.reset",
            };
            return (0, types_1.failure)(error);
        }
    }
    /**
     * Check if a configuration key exists and has a value.
     */
    has(key) {
        return this.store[key] !== undefined;
    }
    /**
     * Get all available configuration keys.
     */
    keys() {
        return Object.keys(exports.CONFIG_KEYS).map((k) => exports.CONFIG_KEYS[k]);
    }
}
exports.EnhancedConfig = EnhancedConfig;
//# sourceMappingURL=enhanced-config.js.map