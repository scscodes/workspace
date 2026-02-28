/**
 * Hygiene Domain Handlers — workspace cleanup and analysis.
 */

import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const micromatch = require("micromatch");
import {
  Handler,
  CommandContext,
  success,
  failure,
  WorkspaceScan,
  DeadCodeScan,
  MarkdownFile,
  WorkspaceProvider,
  Logger,
} from "../../types";
import { HYGIENE_SETTINGS } from "../../constants";
import { DeadCodeAnalyzer } from "./dead-code-analyzer";

/**
 * Read and parse .gitignore patterns from the workspace root.
 * Returns an array of glob patterns safe to pass to micromatch.
 */
function readGitignorePatterns(workspaceRoot: string): string[] {
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
  } catch {
    return [];
  }
}

function readMeridianIgnorePatterns(workspaceRoot: string): string[] {
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
  } catch {
    return [];
  }
}

function isExcluded(filePath: string, patterns: string[]): boolean {
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
export function createScanHandler(
  workspaceProvider: WorkspaceProvider,
  logger: Logger,
  deadCodeAnalyzer: DeadCodeAnalyzer
): Handler<Record<string, never>, WorkspaceScan> {
  return async (ctx: CommandContext) => {
    try {
      logger.info("Scanning workspace for hygiene issues", "HygieneScanHandler");

      const workspaceRoot = ctx.workspaceFolders?.[0] ?? process.cwd();
      const gitignorePatterns = readGitignorePatterns(workspaceRoot);
      const meridianIgnorePatterns = readMeridianIgnorePatterns(workspaceRoot);
      const excludePatterns = [
        ...HYGIENE_SETTINGS.EXCLUDE_PATTERNS,
        ...gitignorePatterns,
        ...meridianIgnorePatterns,
      ];

      // --- Dead files: temp/backup patterns (sourced from HYGIENE_SETTINGS.TEMP_FILE_PATTERNS) ---
      const deadFiles: string[] = [];
      const deadPatterns = HYGIENE_SETTINGS.TEMP_FILE_PATTERNS.map((p) => `**/${p}`);

      for (const pattern of deadPatterns) {
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
      const logFiles: string[] = [];
      const logPatterns = HYGIENE_SETTINGS.LOG_FILE_PATTERNS.map((p) => `**/${p}`);

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
      const largeFiles: Array<{ path: string; sizeBytes: number }> = [];
      const allFilesResult = await workspaceProvider.findFiles("**/*");

      if (allFilesResult.kind === "ok") {
        for (const filePath of allFilesResult.value) {
          if (isExcluded(filePath, excludePatterns)) {
            continue;
          }
          const readResult = await workspaceProvider.readFile(filePath);
          if (readResult.kind === "ok") {
            const sizeBytes = Buffer.byteLength(readResult.value, "utf8");
            if (sizeBytes > HYGIENE_SETTINGS.MAX_FILE_SIZE_BYTES) {
              largeFiles.push({ path: filePath, sizeBytes });
            }
          }
        }
      }

      // --- Markdown files: collect all .md files with size + line count ---
      const markdownFiles: MarkdownFile[] = [];
      const mdResult = await workspaceProvider.findFiles("**/*.md");
      if (mdResult.kind === "ok") {
        for (const filePath of mdResult.value) {
          if (isExcluded(filePath, excludePatterns)) continue;
          const readResult = await workspaceProvider.readFile(filePath);
          if (readResult.kind === "ok") {
            const sizeBytes = Buffer.byteLength(readResult.value, "utf8");
            const lineCount = readResult.value.split("\n").length;
            markdownFiles.push({ path: filePath, sizeBytes, lineCount });
          }
        }
      }

      // --- Dead code: unused imports, locals, params (TS compiler diagnostics) ---
      let deadCode: DeadCodeScan;
      try {
        deadCode = deadCodeAnalyzer.analyze(workspaceRoot);
      } catch {
        deadCode = { items: [], tsconfigPath: null, durationMs: 0, fileCount: 0 };
      }

      const scan: WorkspaceScan = {
        deadFiles,
        largeFiles,
        logFiles,
        markdownFiles,
        deadCode,
      };

      logger.info(
        `Found ${scan.deadFiles.length} dead, ${scan.largeFiles.length} large, ${scan.logFiles.length} log, ${scan.markdownFiles.length} markdown, ${scan.deadCode.items.length} dead-code items`,
        "HygieneScanHandler"
      );

      return success(scan);
    } catch (err) {
      return failure({
        code: "HYGIENE_SCAN_ERROR",
        message: "Workspace scan failed",
        details: err,
        context: "hygiene.scan",
      });
    }
  };
}

// ============================================================================
// Cleanup Handler
// ============================================================================

export interface CleanupParams {
  dryRun?: boolean;
  files?: string[];
}

export interface CleanupResult {
  dryRun: boolean;
  files: string[];
  deleted: string[];
  failed: Array<{ path: string; reason: string }>;
}

/**
 * hygiene.cleanup — Remove specified files from the workspace.
 * Safety: requires an explicit file list; never deletes without one.
 * If dryRun=true, returns the list of files that WOULD be deleted without touching the FS.
 */
export function createCleanupHandler(
  workspaceProvider: WorkspaceProvider,
  logger: Logger
): Handler<CleanupParams, CleanupResult> {
  return async (_ctx: CommandContext, params: CleanupParams = {}) => {
    try {
      const { dryRun = false, files } = params;

      if (!files || files.length === 0) {
        return failure({
          code: "HYGIENE_CLEANUP_NO_FILES",
          message: "Cleanup requires an explicit file list; none provided",
          context: "hygiene.cleanup",
        });
      }

      const mode = dryRun ? "DRY RUN" : "EXECUTE";
      logger.info(
        `Starting cleanup (${mode}) for ${files.length} file(s)`,
        "HygieneCleanupHandler"
      );

      if (dryRun) {
        logger.info(
          `Dry-run complete: ${files.length} file(s) would be deleted`,
          "HygieneCleanupHandler"
        );
        return success({
          dryRun: true,
          files,
          deleted: [],
          failed: [],
        });
      }

      const deleted: string[] = [];
      const failed: Array<{ path: string; reason: string }> = [];

      for (const filePath of files) {
        const result = await workspaceProvider.deleteFile(filePath);
        if (result.kind === "ok") {
          deleted.push(filePath);
          logger.debug(`Deleted: ${filePath}`, "HygieneCleanupHandler");
        } else {
          failed.push({ path: filePath, reason: result.error.message });
          logger.warn(
            `Failed to delete: ${filePath} — ${result.error.message}`,
            "HygieneCleanupHandler",
            result.error
          );
        }
      }

      logger.info(
        `Cleanup complete: ${deleted.length} deleted, ${failed.length} failed`,
        "HygieneCleanupHandler"
      );

      return success({ dryRun: false, files, deleted, failed });
    } catch (err) {
      return failure({
        code: "HYGIENE_CLEANUP_ERROR",
        message: "Cleanup operation failed",
        details: err,
        context: "hygiene.cleanup",
      });
    }
  };
}
