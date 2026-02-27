/**
 * Hygiene Analytics Types — Data model for workspace file analytics reporting.
 */

export type FileCategory =
  | "markdown"
  | "log"
  | "config"
  | "backup"
  | "temp"
  | "source"
  | "artifact"
  | "other";

// ============================================================================
// Prune Configuration — user-tweakable via meridian.hygiene.prune.* settings
// ============================================================================

export interface PruneConfig {
  /** Minimum file age in days before it can be a prune candidate */
  minAgeDays: number;
  /** Flag large files older than minAgeDays if they exceed this size (MB) */
  maxSizeMB: number;
  /** Flag files with >= this many lines (0 = disabled) */
  minLineCount: number;
  /** File categories that are auto-flagged when older than minAgeDays */
  categories: FileCategory[];
}

export const PRUNE_DEFAULTS: PruneConfig = {
  minAgeDays: 30,
  maxSizeMB: 1,
  minLineCount: 0,
  categories: ["backup", "temp", "log", "artifact"],
};

// ============================================================================
// File Entry
// ============================================================================

export interface HygieneFileEntry {
  path: string;
  name: string;
  extension: string;
  category: FileCategory;
  sizeBytes: number;
  lastModified: Date;
  ageDays: number;
  /** Number of lines. -1 if binary, skipped, or file too large to count. */
  lineCount: number;
  isPruneCandidate: boolean;
}

// ============================================================================
// Summary
// ============================================================================

export interface HygieneCategoryStats {
  count: number;
  sizeBytes: number;
}

export interface HygieneAnalyticsSummary {
  totalFiles: number;
  totalSizeBytes: number;
  pruneCount: number;
  pruneEstimateSizeBytes: number;
  byCategory: Partial<Record<FileCategory, HygieneCategoryStats>>;
}

// ============================================================================
// Temporal Data — file modification activity bucketed by month
// ============================================================================

export interface TemporalBucket {
  /** Day label: "Feb 27" */
  label: string;
  /** Total files last-modified on this day */
  total: number;
  /** Per-extension counts for top extensions */
  byExtension: Record<string, number>;
  /** Number of prune candidates last-modified on this day */
  pruneCount: number;
}

export interface TemporalData {
  /** Daily buckets, oldest → newest, up to 14 days */
  buckets: TemporalBucket[];
  /** Top 2–3 extensions by total file count across all buckets */
  topExtensions: string[];
}

// ============================================================================
// Report
// ============================================================================

export interface HygieneAnalyticsReport {
  generatedAt: Date;
  workspaceRoot: string;
  summary: HygieneAnalyticsSummary;
  /** All scanned non-excluded files */
  files: HygieneFileEntry[];
  /** Files satisfying active prune criteria */
  pruneCandiates: HygieneFileEntry[];
  /** Top 20 by sizeBytes */
  largestFiles: HygieneFileEntry[];
  /** Top 20 by ageDays */
  oldestFiles: HygieneFileEntry[];
  /** Monthly modification activity time series */
  temporalData: TemporalData;
  /** Active prune config used for this report (displayed in UI) */
  pruneConfig: PruneConfig;
}
