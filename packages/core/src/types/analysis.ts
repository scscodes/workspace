import type { CodeLocation, Severity, ExportFormat } from './common.js';
import type { ITelemetry } from '../telemetry/index.js';

/**
 * Identifier for each analysis tool. Used as the single source of truth
 * for tool registration, command routing, and result attribution.
 */
export type ToolId = 'dead-code' | 'lint' | 'comments' | 'commit' | 'tldr' | 'branch-diff' | 'diff-resolve' | 'pr-review' | 'decompose';

/**
 * Controls whether the model can invoke a tool autonomously during the
 * agentic loop, or whether the tool requires explicit user invocation.
 *
 * - 'autonomous': Model can invoke freely (read-only, non-destructive tools)
 * - 'restricted': Requires user slash command or explicit confirmation
 *                 (destructive / proposal-based tools)
 */
export type ToolInvocationMode = 'autonomous' | 'restricted';

/**
 * Lifecycle status of a scan/tool execution.
 */
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * A single finding from any analysis tool.
 * Uniform structure — all tools produce these, all UI surfaces consume them.
 */
export interface Finding {
  /** Unique identifier (generated via utils/generateId) */
  id: string;
  /** Which tool produced this finding */
  toolId: ToolId;
  /** Short title for display */
  title: string;
  /** Detailed explanation */
  description: string;
  /** Source code location (for jump-to-source) */
  location: CodeLocation;
  /** Severity level */
  severity: Severity;
  /** Suggested fix (optional — not all findings have one) */
  suggestedFix?: SuggestedFix;
  /** Tool-specific metadata (e.g. dead code type, lint rule ID) */
  metadata?: Record<string, unknown>;
}

/**
 * A suggested code fix for a finding.
 */
export interface SuggestedFix {
  /** What the fix does */
  description: string;
  /** Replacement text */
  replacement: string;
  /** Where to apply the replacement */
  location: CodeLocation;
}

/**
 * Result of running a scan. Immutable once completed.
 */
export interface ScanResult {
  /** Which tool produced these results */
  toolId: ToolId;
  /** Current lifecycle status */
  status: ScanStatus;
  /** When the scan started */
  startedAt: Date;
  /** When the scan completed (undefined while running) */
  completedAt?: Date;
  /** All findings */
  findings: Finding[];
  /** Aggregate statistics */
  summary: ScanSummary;
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Aggregate statistics for a scan result.
 */
export interface ScanSummary {
  totalFindings: number;
  bySeverity: Record<Severity, number>;
  filesScanned: number;
  filesWithFindings: number;
}

/**
 * Options for running a scan.
 */
export interface ScanOptions {
  /** Specific files/directories to scan. Empty array = entire workspace. */
  paths?: string[];
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Arbitrary tool-specific arguments from the agent loop (e.g. commit action, message) */
  args?: Record<string, unknown>;
  /** Optional telemetry emitter for recording tool execution events */
  telemetry?: ITelemetry;
}

/**
 * Interface that all analysis tools must implement.
 *
 * Each tool is registered in TOOL_REGISTRY (tools/index.ts) and exposed
 * via chat commands, sidebar buttons, and command palette.
 */
export interface ITool {
  readonly id: ToolId;
  readonly name: string;
  readonly description: string;

  /** Run the analysis */
  execute(options: ScanOptions): Promise<ScanResult>;

  /** Cancel a running execution */
  cancel(): void;

  /** Export results to a given format */
  export(result: ScanResult, format: ExportFormat): string;
}
