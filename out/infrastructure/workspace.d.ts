/**
 * Workspace utilities — detect workspace root, resolve .vscode/ paths.
 * All workflow/agent definitions live under .vscode/
 *
 * Note: In a real VS Code extension, these would use vscode.workspace APIs.
 * This implementation uses Node.js fs/promises for real file I/O.
 */
/**
 * Workspace paths and constants.
 */
export declare const WORKSPACE_PATHS: {
    readonly AGENTS_DIR: ".vscode/agents";
    readonly WORKFLOWS_DIR: ".vscode/workflows";
    readonly AGENT_SCHEMA: ".vscode/agents/.schema.json";
    readonly WORKFLOW_SCHEMA: ".vscode/workflows/.schema.json";
};
/**
 * Detect workspace root by searching for .vscode directory.
 * Falls back to process.cwd() when not in a VS Code extension context.
 */
export declare function detectWorkspaceRoot(startPath?: string): string;
/**
 * Resolve path relative to workspace root.
 */
export declare function resolveWorkspacePath(relativePath: string, workspaceRoot?: string): string;
/**
 * Get absolute path to agents directory.
 */
export declare function getAgentsDir(workspaceRoot?: string): string;
/**
 * Get absolute path to workflows directory.
 */
export declare function getWorkflowsDir(workspaceRoot?: string): string;
/**
 * List all JSON files (non-recursively) in a directory.
 * Returns an empty array if the directory does not exist or is unreadable.
 */
export declare function listJsonFiles(dirPath: string): string[];
/**
 * Read and parse a JSON file synchronously.
 * Returns null if the file does not exist, is unreadable, or is invalid JSON.
 */
export declare function readJsonFile<T = unknown>(filePath: string): T | null;
/**
 * Write data as a formatted JSON file synchronously.
 * Returns true on success, false on failure.
 */
export declare function writeJsonFile<T = unknown>(filePath: string, data: T): boolean;
//# sourceMappingURL=workspace.d.ts.map