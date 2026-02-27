"use strict";
/**
 * Hygiene Domain Handlers — workspace cleanup and analysis.
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
exports.createScanHandler = createScanHandler;
exports.createCleanupHandler = createCleanupHandler;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const micromatch = require("micromatch");
const types_1 = require("../../types");
const constants_1 = require("../../constants");
/**
 * Read and parse .gitignore patterns from the workspace root.
 * Returns an array of glob patterns safe to pass to micromatch.
 */
function readGitignorePatterns(workspaceRoot) {
    try {
        const gitignorePath = path.join(workspaceRoot, ".gitignore");
        const content = fs.readFileSync(gitignorePath, "utf-8");
        return content
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith("#"))
            .map(line => {
            // Strip trailing slash (directory marker), then always anchor with **/
            // so patterns match against absolute paths from micromatch.isMatch()
            const stripped = line.endsWith("/") ? line.slice(0, -1) : line;
            return stripped.startsWith("**/") ? stripped : `**/${stripped}`;
        });
    }
    catch {
        return [];
    }
}
function readMeridianIgnorePatterns(workspaceRoot) {
    try {
        const meridianIgnorePath = path.join(workspaceRoot, ".meridianignore");
        const content = fs.readFileSync(meridianIgnorePath, "utf-8");
        return content
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith("#"))
            .map(line => {
            const stripped = line.endsWith("/") ? line.slice(0, -1) : line;
            return stripped.startsWith("**/") ? stripped : `**/${stripped}`;
        });
    }
    catch {
        return [];
    }
}
function isExcluded(filePath, patterns) {
    return patterns.length > 0 && micromatch.isMatch(filePath, patterns);
}
// ============================================================================
// Scan Handler
// ============================================================================
/**
 * hygiene.scan — Analyze workspace for dead files, large files, and stale logs.
 * Uses WorkspaceProvider.findFiles() with patterns from HYGIENE_SETTINGS.
 * Large-file detection reads file content to measure byte length (no stat API available).
 */
function createScanHandler(workspaceProvider, logger) {
    return async (ctx) => {
        try {
            logger.info("Scanning workspace for hygiene issues", "HygieneScanHandler");
            const workspaceRoot = ctx.workspaceFolders?.[0] ?? process.cwd();
            const gitignorePatterns = readGitignorePatterns(workspaceRoot);
            const meridianIgnorePatterns = readMeridianIgnorePatterns(workspaceRoot);
            const excludePatterns = [
                ...constants_1.HYGIENE_SETTINGS.EXCLUDE_PATTERNS,
                ...gitignorePatterns,
                ...meridianIgnorePatterns,
            ];
            // --- Dead files: temp/backup patterns ---
            const deadFiles = [];
            const deadPatterns = [
                "**/*.bak",
                "**/*.tmp",
                "**/*.temp",
                "**/*.orig",
                "**/*.swp",
                "**/*~",
                ...constants_1.HYGIENE_SETTINGS.TEMP_FILE_PATTERNS.map((p) => `**/${p}`),
            ];
            // Deduplicate patterns before scanning
            const uniqueDeadPatterns = [...new Set(deadPatterns)];
            for (const pattern of uniqueDeadPatterns) {
                const result = await workspaceProvider.findFiles(pattern);
                if (result.kind === "ok") {
                    for (const f of result.value) {
                        if (!deadFiles.includes(f) && !isExcluded(f, excludePatterns)) {
                            deadFiles.push(f);
                        }
                    }
                }
            }
            // --- Log files ---
            const logFiles = [];
            const logPatterns = constants_1.HYGIENE_SETTINGS.LOG_FILE_PATTERNS.map((p) => `**/${p}`);
            for (const pattern of logPatterns) {
                const result = await workspaceProvider.findFiles(pattern);
                if (result.kind === "ok") {
                    for (const f of result.value) {
                        if (!logFiles.includes(f) && !isExcluded(f, excludePatterns)) {
                            logFiles.push(f);
                        }
                    }
                }
            }
            // --- Large files: read content to measure size, skip excluded paths ---
            const largeFiles = [];
            const allFilesResult = await workspaceProvider.findFiles("**/*");
            if (allFilesResult.kind === "ok") {
                for (const filePath of allFilesResult.value) {
                    if (isExcluded(filePath, excludePatterns)) {
                        continue;
                    }
                    const readResult = await workspaceProvider.readFile(filePath);
                    if (readResult.kind === "ok") {
                        const sizeBytes = Buffer.byteLength(readResult.value, "utf8");
                        if (sizeBytes > constants_1.HYGIENE_SETTINGS.MAX_FILE_SIZE_BYTES) {
                            largeFiles.push({ path: filePath, sizeBytes });
                        }
                    }
                }
            }
            // --- Markdown files: collect all .md files with size + line count ---
            const markdownFiles = [];
            const mdResult = await workspaceProvider.findFiles("**/*.md");
            if (mdResult.kind === "ok") {
                for (const filePath of mdResult.value) {
                    if (isExcluded(filePath, excludePatterns))
                        continue;
                    const readResult = await workspaceProvider.readFile(filePath);
                    if (readResult.kind === "ok") {
                        const sizeBytes = Buffer.byteLength(readResult.value, "utf8");
                        const lineCount = readResult.value.split("\n").length;
                        markdownFiles.push({ path: filePath, sizeBytes, lineCount });
                    }
                }
            }
            const scan = {
                deadFiles,
                largeFiles,
                logFiles,
                markdownFiles,
            };
            logger.info(`Found ${scan.deadFiles.length} dead, ${scan.largeFiles.length} large, ${scan.logFiles.length} log, ${scan.markdownFiles.length} markdown files`, "HygieneScanHandler");
            return (0, types_1.success)(scan);
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "HYGIENE_SCAN_ERROR",
                message: "Workspace scan failed",
                details: err,
                context: "hygiene.scan",
            });
        }
    };
}
/**
 * hygiene.cleanup — Remove specified files from the workspace.
 * Safety: requires an explicit file list; never deletes without one.
 * If dryRun=true, returns the list of files that WOULD be deleted without touching the FS.
 */
function createCleanupHandler(workspaceProvider, logger) {
    return async (_ctx, params = {}) => {
        try {
            const { dryRun = false, files } = params;
            if (!files || files.length === 0) {
                return (0, types_1.failure)({
                    code: "HYGIENE_CLEANUP_NO_FILES",
                    message: "Cleanup requires an explicit file list; none provided",
                    context: "hygiene.cleanup",
                });
            }
            const mode = dryRun ? "DRY RUN" : "EXECUTE";
            logger.info(`Starting cleanup (${mode}) for ${files.length} file(s)`, "HygieneCleanupHandler");
            if (dryRun) {
                logger.info(`Dry-run complete: ${files.length} file(s) would be deleted`, "HygieneCleanupHandler");
                return (0, types_1.success)({
                    dryRun: true,
                    files,
                    deleted: [],
                    failed: [],
                });
            }
            const deleted = [];
            const failed = [];
            for (const filePath of files) {
                const result = await workspaceProvider.deleteFile(filePath);
                if (result.kind === "ok") {
                    deleted.push(filePath);
                    logger.debug(`Deleted: ${filePath}`, "HygieneCleanupHandler");
                }
                else {
                    failed.push({ path: filePath, reason: result.error.message });
                    logger.warn(`Failed to delete: ${filePath} — ${result.error.message}`, "HygieneCleanupHandler", result.error);
                }
            }
            logger.info(`Cleanup complete: ${deleted.length} deleted, ${failed.length} failed`, "HygieneCleanupHandler");
            return (0, types_1.success)({ dryRun: false, files, deleted, failed });
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "HYGIENE_CLEANUP_ERROR",
                message: "Cleanup operation failed",
                details: err,
                context: "hygiene.cleanup",
            });
        }
    };
}
//# sourceMappingURL=handlers.js.map