/**
 * Hygiene Analytics Service — walks workspace FS and generates file analytics.
 */

import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const micromatch = require("micromatch");

import {
  FileCategory,
  HygieneFileEntry,
  HygieneAnalyticsReport,
  HygieneAnalyticsSummary,
  HygieneCategoryStats,
  PruneConfig,
  PRUNE_DEFAULTS,
  TemporalBucket,
  TemporalData,
} from "./analytics-types";
import { HYGIENE_ANALYTICS_EXCLUDE_PATTERNS } from "../../constants";

// ============================================================================
// Category mapping
// ============================================================================

const MARKDOWN_EXTS  = new Set([".md", ".mdx"]);
const LOG_EXTS       = new Set([".log"]);
const CONFIG_EXTS    = new Set([".yml", ".yaml", ".json", ".toml", ".ini", ".env"]);
const BACKUP_EXTS    = new Set([".bak", ".orig", ".swp"]);
const TEMP_EXTS      = new Set([".tmp", ".temp"]);
const SOURCE_EXTS    = new Set([".ts", ".js", ".py", ".go", ".rs", ".java", ".rb", ".cs", ".tsx", ".jsx", ".sh", ".bash"]);
/** Compiled / generated artifact extensions */
const ARTIFACT_EXTS  = new Set([".class", ".pyc", ".pyo", ".o", ".obj", ".a", ".so"]);
/** Directory names that indicate build / cache output not covered by EXCLUDE_PATTERNS */
const ARTIFACT_DIRS  = new Set(["target", ".next", ".nuxt", ".parcel-cache"]);

/** Extensions for which we attempt line counting (text-based only) */
const LINE_COUNT_EXTS = new Set([
  ...MARKDOWN_EXTS, ...LOG_EXTS, ...CONFIG_EXTS, ...SOURCE_EXTS,
]);

/** Skip line counting for files over 5 MB to avoid blocking */
const MAX_LINECOUNT_BYTES = 5 * 1024 * 1024;

/**
 * Categorize a file by extension and relative path.
 * Artifact check runs first so that, e.g., a .js file inside a target/ dir
 * is classified as artifact rather than source.
 */
function categorize(ext: string, name: string, relPath: string): FileCategory {
  if (ARTIFACT_EXTS.has(ext)) return "artifact";
  const parts = relPath.split(/[/\\]/);
  if (parts.some((p) => ARTIFACT_DIRS.has(p))) return "artifact";
  if (MARKDOWN_EXTS.has(ext))                   return "markdown";
  if (LOG_EXTS.has(ext))                        return "log";
  if (CONFIG_EXTS.has(ext))                     return "config";
  if (BACKUP_EXTS.has(ext) || name.endsWith("~")) return "backup";
  if (TEMP_EXTS.has(ext))                       return "temp";
  if (SOURCE_EXTS.has(ext))                     return "source";
  return "other";
}

function countLines(filePath: string, ext: string, sizeBytes: number): number {
  if (!LINE_COUNT_EXTS.has(ext)) return -1;
  if (sizeBytes > MAX_LINECOUNT_BYTES) return -1;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return -1;
  }
}

function isPruneCandidate(
  ageDays: number,
  category: FileCategory,
  sizeBytes: number,
  lineCount: number,
  config: PruneConfig
): boolean {
  if (ageDays < config.minAgeDays) return false;
  const categoryMatch = config.categories.includes(category);
  const sizeMatch     = sizeBytes > config.maxSizeMB * 1_048_576;
  const lineMatch     = config.minLineCount > 0 && lineCount >= config.minLineCount;
  return categoryMatch || sizeMatch || lineMatch;
}

// ============================================================================
// Ignore pattern helpers (mirrors handlers.ts)
// ============================================================================

function readGitignorePatterns(workspaceRoot: string): string[] {
  try {
    const content = fs.readFileSync(path.join(workspaceRoot, ".gitignore"), "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => {
        const stripped = l.endsWith("/") ? l.slice(0, -1) : l;
        return stripped.startsWith("**/") ? stripped : `**/${stripped}`;
      });
  } catch {
    return [];
  }
}

function readMeridianIgnorePatterns(workspaceRoot: string): string[] {
  try {
    const content = fs.readFileSync(path.join(workspaceRoot, ".meridianignore"), "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => {
        const stripped = l.endsWith("/") ? l.slice(0, -1) : l;
        return stripped.startsWith("**/") ? stripped : `**/${stripped}`;
      });
  } catch {
    return [];
  }
}

// ============================================================================
// Temporal bucketing — 14 daily buckets
// ============================================================================

interface DayInfo {
  key:   string; // ISO date "2025-01-06"
  label: string; // display label "Jan 6"
  start: number; // ms since epoch (day 00:00 local)
  end:   number; // ms since epoch (next day 00:00 local, exclusive)
}

/** Return the last N calendar days, oldest first. */
function lastNDays(n: number): DayInfo[] {
  const result: DayInfo[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = n - 1; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const key   = dayStart.toISOString().slice(0, 10);
    const label = dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    result.push({ key, label, start: dayStart.getTime(), end: dayEnd.getTime() });
  }
  return result;
}

function buildTemporalData(files: HygieneFileEntry[]): TemporalData {
  const days = lastNDays(14);
  const totalByDay: Record<string, number>                = {};
  const pruneByDay: Record<string, number>                = {};
  const extByDay:   Record<string, Record<string, number>> = {};
  const extTotals:  Record<string, number>                = {};

  for (const d of days) {
    totalByDay[d.key] = 0;
    pruneByDay[d.key] = 0;
    extByDay[d.key]   = {};
  }

  for (const f of files) {
    const fileMs = f.lastModified.getTime();
    for (const d of days) {
      if (fileMs >= d.start && fileMs < d.end) {
        totalByDay[d.key]++;
        if (f.isPruneCandidate) pruneByDay[d.key]++;
        const ext = f.extension || "(none)";
        extTotals[ext]        = (extTotals[ext] || 0) + 1;
        extByDay[d.key][ext]  = (extByDay[d.key][ext] || 0) + 1;
        break;
      }
    }
  }

  const topExtensions = Object.entries(extTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ext]) => ext);

  const buckets: TemporalBucket[] = days.map((d) => ({
    label:      d.label,
    total:      totalByDay[d.key],
    pruneCount: pruneByDay[d.key],
    byExtension: Object.fromEntries(
      topExtensions.map((ext) => [ext, extByDay[d.key][ext] || 0])
    ),
  }));

  return { buckets, topExtensions };
}

// ============================================================================
// Cache
// ============================================================================

interface CachedReport {
  report:    HygieneAnalyticsReport;
  cachedAt:  number;
  configKey: string;
}

function pruneConfigKey(config: PruneConfig): string {
  return JSON.stringify(config);
}

// ============================================================================
// Analyzer
// ============================================================================

export class HygieneAnalyzer {
  private cache: Map<string, CachedReport> = new Map();
  private cacheTTLMs = 10 * 60 * 1000; // 10 minutes

  /**
   * Analyze workspace files and return a full report.
   * Cached per workspaceRoot+pruneConfig for 10 minutes.
   */
  analyze(workspaceRoot: string, config: PruneConfig = PRUNE_DEFAULTS): HygieneAnalyticsReport {
    const cfgKey = pruneConfigKey(config);
    const cached = this.cache.get(workspaceRoot);
    if (
      cached &&
      cached.configKey === cfgKey &&
      Date.now() - cached.cachedAt < this.cacheTTLMs
    ) {
      return cached.report;
    }

    // Analytics uses a lighter exclusion set: artifact dirs (dist/, build/, out/,
    // coverage/, .cache/, .next/) are intentionally included so they can be
    // surfaced as prune candidates. Gitignore is not applied here because it
    // reflects what you don't want to commit, which is exactly what analytics
    // wants to surface. Only .meridianignore allows explicit user overrides.
    const excludePatterns = [
      ...HYGIENE_ANALYTICS_EXCLUDE_PATTERNS,
      ...readMeridianIgnorePatterns(workspaceRoot),
    ];

    const files = this.walkDir(workspaceRoot, workspaceRoot, excludePatterns, config);

    const summary       = this.buildSummary(files);
    const pruneCandiates = files.filter((f) => f.isPruneCandidate);
    const largestFiles  = [...files].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 20);
    const oldestFiles   = [...files].sort((a, b) => b.ageDays - a.ageDays).slice(0, 20);
    const temporalData  = buildTemporalData(files);

    const report: HygieneAnalyticsReport = {
      generatedAt: new Date(),
      workspaceRoot,
      summary,
      files,
      pruneCandiates,
      largestFiles,
      oldestFiles,
      temporalData,
      pruneConfig: config,
    };

    this.cache.set(workspaceRoot, { report, cachedAt: Date.now(), configKey: cfgKey });
    return report;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // --------------------------------------------------------------------------

  private walkDir(
    dir: string,
    workspaceRoot: string,
    excludePatterns: string[],
    config: PruneConfig
  ): HygieneFileEntry[] {
    const entries: HygieneFileEntry[] = [];

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return entries;
    }

    for (const dirent of dirEntries) {
      const fullPath = path.join(dir, dirent.name);
      const relPath  = path.relative(workspaceRoot, fullPath);

      if (
        micromatch.isMatch(fullPath, excludePatterns) ||
        micromatch.isMatch(relPath,  excludePatterns)
      ) {
        continue;
      }

      if (dirent.isDirectory()) {
        entries.push(...this.walkDir(fullPath, workspaceRoot, excludePatterns, config));
      } else if (dirent.isFile()) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }

        const ext       = path.extname(dirent.name).toLowerCase();
        const ageDays   = Math.floor((Date.now() - stat.mtimeMs) / 86_400_000);
        const category  = categorize(ext, dirent.name, relPath);
        const lineCount = countLines(fullPath, ext, stat.size);

        entries.push({
          path: relPath,
          name: dirent.name,
          extension: ext,
          category,
          sizeBytes:    stat.size,
          lastModified: stat.mtime,
          ageDays,
          lineCount,
          isPruneCandidate: isPruneCandidate(ageDays, category, stat.size, lineCount, config),
        });
      }
    }

    return entries;
  }

  private buildSummary(files: HygieneFileEntry[]): HygieneAnalyticsSummary {
    const byCategory: Partial<Record<FileCategory, HygieneCategoryStats>> = {};

    for (const f of files) {
      if (!byCategory[f.category]) {
        byCategory[f.category] = { count: 0, sizeBytes: 0 };
      }
      byCategory[f.category]!.count++;
      byCategory[f.category]!.sizeBytes += f.sizeBytes;
    }

    const pruneFiles = files.filter((f) => f.isPruneCandidate);

    return {
      totalFiles:              files.length,
      totalSizeBytes:          files.reduce((s, f) => s + f.sizeBytes, 0),
      pruneCount:              pruneFiles.length,
      pruneEstimateSizeBytes:  pruneFiles.reduce((s, f) => s + f.sizeBytes, 0),
      byCategory,
    };
  }
}
