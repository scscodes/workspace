/**
 * Workspace utilities — detect workspace root, resolve .vscode/ paths.
 * All workflow/agent definitions live under .vscode/
 *
 * Note: In a real VS Code extension, these would use vscode.workspace APIs.
 * This is a demonstration implementation for scaffold/testing purposes.
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
 * Placeholder: In real extension, use vscode.workspace.workspaceFolders[0]
 */
export declare function detectWorkspaceRoot(startPath?: string): string;
/**
 * Resolve path relative to workspace root.
 */
export declare function resolveWorkspacePath(relativePath: string, _workspaceRoot?: string): string;
/**
 * Get absolute path to agents directory.
 */
export declare function getAgentsDir(workspaceRoot?: string): string;
/**
 * Get absolute path to workflows directory.
 */
export declare function getWorkflowsDir(workspaceRoot?: string): string;
/**
 * List all JSON files in a directory.
 * Placeholder: Would require Node.js fs in real implementation
 */
export declare function listJsonFiles(_dirPath: string): string[];
/**
 * Read and parse JSON file.
 * Placeholder: Would require Node.js fs in real implementation
 */
export declare function readJsonFile<T = unknown>(_filePath: string): T | null;
/**
 * Write JSON file with formatting.
 * Placeholder: Would require Node.js fs in real implementation
 */
export declare function writeJsonFile<T = unknown>(_filePath: string, _data: T): boolean;
//# sourceMappingURL=workspace.d.ts.map