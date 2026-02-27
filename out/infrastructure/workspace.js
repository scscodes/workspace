"use strict";
/**
 * Workspace utilities — detect workspace root, resolve .vscode/ paths.
 * All workflow/agent definitions live under .vscode/
 *
 * Note: In a real VS Code extension, these would use vscode.workspace APIs.
 * This implementation uses Node.js fs/promises for real file I/O.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKSPACE_PATHS = void 0;
exports.detectWorkspaceRoot = detectWorkspaceRoot;
exports.resolveWorkspacePath = resolveWorkspacePath;
exports.getAgentsDir = getAgentsDir;
exports.getWorkflowsDir = getWorkflowsDir;
exports.listJsonFiles = listJsonFiles;
exports.readJsonFile = readJsonFile;
exports.writeJsonFile = writeJsonFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Workspace paths and constants.
 */
exports.WORKSPACE_PATHS = {
    AGENTS_DIR: ".vscode/agents",
    WORKFLOWS_DIR: ".vscode/workflows",
    AGENT_SCHEMA: ".vscode/agents/.schema.json",
    WORKFLOW_SCHEMA: ".vscode/workflows/.schema.json",
};
/**
 * Detect workspace root by searching for .vscode directory.
 * Falls back to process.cwd() when not in a VS Code extension context.
 */
function detectWorkspaceRoot(startPath = ".") {
    try {
        return process.cwd();
    }
    catch {
        return startPath;
    }
}
/**
 * Resolve path relative to workspace root.
 */
function resolveWorkspacePath(relativePath, workspaceRoot) {
    return path.join(workspaceRoot ?? ".", relativePath);
}
/**
 * Get absolute path to agents directory.
 */
function getAgentsDir(workspaceRoot) {
    return resolveWorkspacePath(exports.WORKSPACE_PATHS.AGENTS_DIR, workspaceRoot);
}
/**
 * Get absolute path to workflows directory.
 */
function getWorkflowsDir(workspaceRoot) {
    return resolveWorkspacePath(exports.WORKSPACE_PATHS.WORKFLOWS_DIR, workspaceRoot);
}
/**
 * List all JSON files (non-recursively) in a directory.
 * Returns an empty array if the directory does not exist or is unreadable.
 */
function listJsonFiles(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
            .filter((e) => e.isFile() && e.name.endsWith(".json"))
            .map((e) => path.join(dirPath, e.name));
    }
    catch {
        return [];
    }
}
/**
 * Read and parse a JSON file synchronously.
 * Returns null if the file does not exist, is unreadable, or is invalid JSON.
 */
function readJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Write data as a formatted JSON file synchronously.
 * Returns true on success, false on failure.
 */
function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=workspace.js.map