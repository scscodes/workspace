/**
 * Configuration Provider — Typed schema, validation.
 */
import { ConfigProvider, Result } from "../types";
/**
 * Typed configuration schema.
 * No magic keys; all config paths are explicit constants.
 */
export declare const CONFIG_KEYS: {
    readonly GIT_AUTOFETCH: "git.autofetch";
    readonly GIT_BRANCH_CLEAN: "git.branchClean";
    readonly HYGIENE_ENABLED: "hygiene.enabled";
    readonly HYGIENE_SCAN_INTERVAL: "hygiene.scanInterval";
    readonly CHAT_MODEL: "chat.model";
    readonly CHAT_CONTEXT_LINES: "chat.contextLines";
    readonly LOG_LEVEL: "log.level";
};
export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];
interface ConfigSchema {
    [CONFIG_KEYS.GIT_AUTOFETCH]: boolean;
    [CONFIG_KEYS.GIT_BRANCH_CLEAN]: boolean;
    [CONFIG_KEYS.HYGIENE_ENABLED]: boolean;
    [CONFIG_KEYS.HYGIENE_SCAN_INTERVAL]: number;
    [CONFIG_KEYS.CHAT_MODEL]: string;
    [CONFIG_KEYS.CHAT_CONTEXT_LINES]: number;
    [CONFIG_KEYS.LOG_LEVEL]: "debug" | "info" | "warn" | "error";
}
export declare class Config implements ConfigProvider {
    private store;
    /**
     * Load config from VS Code workspace settings.
     * In a real extension, this would call vscode.workspace.getConfiguration().
     * For now, use defaults + in-memory override.
     */
    initialize(): Promise<Result<void>>;
    get<T>(key: string, defaultValue?: T): T | undefined;
    set<T>(key: string, value: T): Promise<Result<void>>;
    /**
     * Export current configuration (for debugging).
     */
    exportAll(): Partial<ConfigSchema>;
}
export {};
//# sourceMappingURL=config.d.ts.map