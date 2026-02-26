"use strict";
/**
 * Configuration Provider — Typed schema, validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.CONFIG_KEYS = void 0;
const types_1 = require("../types");
/**
 * Typed configuration schema.
 * No magic keys; all config paths are explicit constants.
 */
exports.CONFIG_KEYS = {
    GIT_AUTOFETCH: "git.autofetch",
    GIT_BRANCH_CLEAN: "git.branchClean",
    HYGIENE_ENABLED: "hygiene.enabled",
    HYGIENE_SCAN_INTERVAL: "hygiene.scanInterval",
    CHAT_MODEL: "chat.model",
    CHAT_CONTEXT_LINES: "chat.contextLines",
    LOG_LEVEL: "log.level",
};
/**
 * Default configuration values.
 */
const DEFAULTS = {
    [exports.CONFIG_KEYS.GIT_AUTOFETCH]: false,
    [exports.CONFIG_KEYS.GIT_BRANCH_CLEAN]: true,
    [exports.CONFIG_KEYS.HYGIENE_ENABLED]: true,
    [exports.CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: 60,
    [exports.CONFIG_KEYS.CHAT_MODEL]: "gpt-4",
    [exports.CONFIG_KEYS.CHAT_CONTEXT_LINES]: 50,
    [exports.CONFIG_KEYS.LOG_LEVEL]: "info",
};
class Config {
    constructor() {
        this.store = {};
    }
    /**
     * Load config from VS Code workspace settings.
     * In a real extension, this would call vscode.workspace.getConfiguration().
     * For now, use defaults + in-memory override.
     */
    async initialize() {
        try {
            // In extension context, load from vscode.workspace.getConfiguration()
            // For now, just use defaults
            this.store = { ...DEFAULTS };
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            const error = {
                code: "CONFIG_INIT_ERROR",
                message: "Failed to initialize configuration",
                details: err,
            };
            return (0, types_1.failure)(error);
        }
    }
    get(key, defaultValue) {
        const value = this.store[key];
        if (value === undefined) {
            return defaultValue;
        }
        return value;
    }
    async set(key, value) {
        try {
            this.store[key] = value;
            // In extension context, would call vscode.workspace.getConfiguration().update()
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            const error = {
                code: "CONFIG_SET_ERROR",
                message: `Failed to set config key '${key}'`,
                details: err,
            };
            return (0, types_1.failure)(error);
        }
    }
    /**
     * Export current configuration (for debugging).
     */
    exportAll() {
        return { ...this.store };
    }
}
exports.Config = Config;
//# sourceMappingURL=config.js.map