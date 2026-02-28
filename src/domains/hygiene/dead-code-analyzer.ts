/**
 * Dead Code Analyzer — uses the TypeScript compiler API to surface unused
 * imports, locals, parameters, and type parameters across the workspace.
 *
 * Mirrors HygieneAnalyzer (analytics-service.ts): standalone class, direct FS
 * access, 5-minute in-memory cache, synchronous analyze() method.
 */

import * as ts from "typescript";
import * as path from "path";
import { DeadCodeItem, DeadCodeScan, Logger } from "../../types";
import { CACHE_SETTINGS, DEAD_CODE_DIAGNOSTIC_CODES, HYGIENE_SETTINGS } from "../../constants";

interface CachedScan {
  scan: DeadCodeScan;
  cachedAt: number;
}

export class DeadCodeAnalyzer {
  private cache = new Map<string, CachedScan>();

  constructor(private readonly logger: Logger) {}

  /**
   * Analyze workspace TypeScript files for dead code diagnostics.
   * Results are cached for 5 minutes per workspaceRoot.
   */
  analyze(workspaceRoot: string): DeadCodeScan {
    const cached = this.cache.get(workspaceRoot);
    if (cached && Date.now() - cached.cachedAt < CACHE_SETTINGS.DEAD_CODE_TTL_MS) {
      this.logger.debug("Dead code analyzer: cache hit", "DeadCodeAnalyzer");
      return cached.scan;
    }

    try {
      const scan = this.runScan(workspaceRoot);
      this.cache.set(workspaceRoot, { scan, cachedAt: Date.now() });
      this.logger.info(
        `Dead code scan complete: ${scan.items.length} issues in ${scan.fileCount} files (${scan.durationMs}ms)`,
        "DeadCodeAnalyzer"
      );
      return scan;
    } catch (err) {
      this.logger.warn("Dead code scan failed", "DeadCodeAnalyzer", {
        code: "DEAD_CODE_SCAN_ERROR",
        message: String(err),
      });
      return { items: [], tsconfigPath: null, durationMs: 0, fileCount: 0 };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  // --------------------------------------------------------------------------

  private runScan(workspaceRoot: string): DeadCodeScan {
    const startMs = Date.now();

    // 1. Resolve tsconfig — walk up from workspaceRoot
    const tsconfigPath =
      ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json") ?? null;

    let fileNames: string[];
    let compilerOptions: ts.CompilerOptions;

    if (tsconfigPath) {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      if (configFile.error) {
        throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
      }
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
      );
      fileNames = parsedConfig.fileNames;
      // Force dead-code flags on top of tsconfig options
      compilerOptions = {
        ...parsedConfig.options,
        noUnusedLocals: true,
        noUnusedParameters: true,
        skipLibCheck: true,
      };
    } else {
      // Fallback: collect TS/TSX files manually, skip heavy dirs
      fileNames = ts.sys.readDirectory(
        workspaceRoot,
        [".ts", ".tsx"],
        [...HYGIENE_SETTINGS.EXCLUDE_PATTERNS],
        ["**/*.ts", "**/*.tsx"]
      );
      compilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: false,
        noUnusedLocals: true,
        noUnusedParameters: true,
        skipLibCheck: true,
      };
    }

    // 2. Only files inside workspaceRoot; skip declaration files
    const relevantFiles = fileNames.filter(
      (f) => f.startsWith(workspaceRoot) && !f.endsWith(".d.ts")
    );

    // 3. Create program and collect diagnostics
    const program = ts.createProgram(relevantFiles, compilerOptions);
    const items: DeadCodeItem[] = [];

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = sourceFile.fileName;
      if (!filePath.startsWith(workspaceRoot) || filePath.endsWith(".d.ts")) {
        continue;
      }

      const diagnostics = program.getSemanticDiagnostics(sourceFile);
      for (const d of diagnostics) {
        if (!DEAD_CODE_DIAGNOSTIC_CODES.has(d.code)) continue;
        if (d.start === undefined || !d.file) continue;

        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        const message = ts.flattenDiagnosticMessageText(d.messageText, " ");

        items.push({
          filePath,
          line: line + 1,           // convert 0-based → 1-based
          character: character + 1, // convert 0-based → 1-based
          message,
          code: d.code,
          category: deriveCategory(d.code),
        });
      }
    }

    return {
      items,
      tsconfigPath,
      durationMs: Date.now() - startMs,
      fileCount: relevantFiles.length,
    };
  }
}

/**
 * Map TS diagnostic code → UI category.
 *   6192 — entire import statement unused → unusedImport
 *   6196, 6205 — type parameter unused → unusedTypeParam
 *   6133, 6198, 6199 — local / param / destructured unused → unusedLocal
 *     (individual import binding code 6133 is grouped with unusedLocal;
 *      the panel groups by file so both surfaces are visible)
 */
function deriveCategory(code: number): DeadCodeItem["category"] {
  if (code === 6192) return "unusedImport";
  if (code === 6196 || code === 6205) return "unusedTypeParam";
  return "unusedLocal";
}
