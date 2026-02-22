import type {
  ITool,
  ToolId,
  ScanOptions,
  ScanResult,
  ScanStatus,
  Finding,
  ExportFormat,
  Severity,
} from '../types/index.js';
import { generateId, buildScanSummary } from '../utils/index.js';
import { NullTelemetry } from '../telemetry/index.js';
import { TOOL_MODEL_TIMEOUT_MS, TOOL_MODEL_BATCH_SIZE, TELEMETRY_RUN_ID_LENGTH } from '../settings/defaults.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** JSON export indentation */
const JSON_INDENT = 2;

// ─── Abstract Base ──────────────────────────────────────────────────────────

/**
 * Abstract base class for all analysis tools.
 *
 * Handles:
 * - Lifecycle management (pending → running → completed/failed/cancelled)
 * - Cancellation via AbortController
 * - Result building with automatic summary computation
 * - JSON/Markdown export formatting
 *
 * Subclasses implement `run()` — the actual analysis logic.
 */
export abstract class BaseTool implements ITool {
  abstract readonly id: ToolId;
  abstract readonly name: string;
  abstract readonly description: string;

  private abortController: AbortController | undefined;
  private currentStatus: ScanStatus = 'pending';

  /**
   * Execute the tool. Manages lifecycle around the subclass `run()` method.
   * Automatically emits telemetry events (start, complete, error).
   */
  async execute(options: ScanOptions): Promise<ScanResult> {
    this.abortController = new AbortController();
    this.currentStatus = 'running';
    const startedAt = new Date();
    const startedAtMs = startedAt.getTime();
    const runId = this.generateRunId();

    // Get telemetry instance, default to NullTelemetry
    const telemetry = options.telemetry ?? new NullTelemetry();

    // Emit tool.start event
    telemetry.emit({
      kind: 'tool.start',
      runId,
      toolId: this.id,
      triggeredBy: 'direct',
      timestamp: startedAtMs,
    });

    const mergedOptions: ScanOptions = {
      ...options,
      signal: this.abortController.signal,
    };

    try {
      const findings = await this.run(mergedOptions);
      this.currentStatus = 'completed';
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAtMs;
      const filesScanned = this.countScannedFiles(mergedOptions);

      // Emit tool.complete event
      telemetry.emit({
        kind: 'tool.complete',
        runId,
        toolId: this.id,
        durationMs,
        findingCount: findings.length,
        fileCount: filesScanned,
        timestamp: completedAt.getTime(),
      });

      return this.buildResult({
        status: 'completed',
        startedAt,
        completedAt,
        findings,
        filesScanned,
      });
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAtMs;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.abortController.signal.aborted) {
        this.currentStatus = 'cancelled';
        return this.buildResult({
          status: 'cancelled',
          startedAt,
          completedAt,
          findings: [],
          filesScanned: 0,
        });
      }

      this.currentStatus = 'failed';

      // Emit tool.error event
      telemetry.emit({
        kind: 'tool.error',
        runId,
        toolId: this.id,
        error: errorMessage,
        durationMs,
        timestamp: completedAt.getTime(),
      });

      return this.buildResult({
        status: 'failed',
        startedAt,
        completedAt,
        findings: [],
        error: errorMessage,
        filesScanned: 0,
      });
    } finally {
      this.abortController = undefined;
    }
  }

  /**
   * Cancel a running execution.
   */
  cancel(): void {
    this.abortController?.abort();
    this.currentStatus = 'cancelled';
  }

  /**
   * Get the current execution status.
   */
  getStatus(): ScanStatus {
    return this.currentStatus;
  }

  /**
   * Generate a unique run ID for this execution.
   * Format: alphanumeric identifier suitable for tracking across systems.
   */
  protected generateRunId(): string {
    // Generate a short base36 ID of the configured length
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < TELEMETRY_RUN_ID_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Export scan results to JSON or Markdown.
   */
  export(result: ScanResult, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return this.exportJson(result);
      case 'markdown':
        return this.exportMarkdown(result);
      default:
        throw new Error(`Unsupported export format: ${String(format)}`);
    }
  }

  // ─── Abstract: Subclass Implementation ──────────────────────────────────

  /**
   * The actual analysis logic. Subclasses implement this.
   *
   * @param options - Scan options with an active abort signal
   * @returns Array of findings. Lifecycle and error handling are managed by BaseTool.
   */
  protected abstract run(options: ScanOptions): Promise<Finding[]>;

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Create a Finding with auto-generated ID and this tool's ID pre-filled.
   */
  protected createFinding(
    partial: Omit<Finding, 'id' | 'toolId'>,
  ): Finding {
    return {
      id: generateId(),
      toolId: this.id,
      ...partial,
    };
  }

  /**
   * Create a standardized error finding for tool execution failures.
   */
  protected createErrorFinding(
    filePath: string,
    error: unknown,
    context?: string,
  ): Finding {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const title = context
      ? `${context} failed: ${filePath}`
      : `Analysis failed: ${filePath}`;
    
    return this.createFinding({
      title,
      description: `Error: ${errorMessage}`,
      location: { filePath, startLine: 0, endLine: 0 },
      severity: 'warning',
      metadata: {
        errorType: 'tool_execution_failure',
        errorMessage,
        context: context ?? 'unknown',
      },
    });
  }

  /**
   * Check if execution has been cancelled.
   * Call this periodically in long-running `run()` implementations.
   */
  protected isCancelled(options: ScanOptions): boolean {
    return options.signal?.aborted ?? false;
  }

  /**
   * Throw if cancelled. Use in loops for early exit.
   */
  protected throwIfCancelled(options: ScanOptions): void {
    if (this.isCancelled(options)) {
      throw new Error('Scan cancelled');
    }
  }

  /**
   * Wrap a model request with timeout handling.
   * Creates an AbortController that cancels after TOOL_MODEL_TIMEOUT_MS.
   * 
   * @param requestFn Function that takes an AbortSignal and returns a Promise
   * @param timeoutMs Timeout in milliseconds (defaults to TOOL_MODEL_TIMEOUT_MS)
   * @returns Promise that resolves with the result or rejects with timeout error
   */
  async sendRequestWithTimeout<T>(
    requestFn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number = TOOL_MODEL_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const result = await requestFn(controller.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (controller.signal.aborted) {
        throw new Error(`Model request timed out after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Process items in parallel batches to avoid overwhelming the system.
   * 
   * @param items Array of items to process
   * @param processor Async function to process each item
   * @param batchSize Number of items to process concurrently (default: TOOL_MODEL_BATCH_SIZE)
   * @returns Array of results in same order as items
   */
  protected async processInBatches<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    batchSize: number = TOOL_MODEL_BATCH_SIZE,
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item, batchIndex) => processor(item, i + batchIndex)),
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  // ─── Result Building ──────────────────────────────────────────────────

  private buildResult(params: {
    status: ScanStatus;
    startedAt: Date;
    completedAt: Date;
    findings: Finding[];
    error?: string;
    filesScanned: number;
  }): ScanResult {
    return {
      toolId: this.id,
      status: params.status,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      findings: params.findings,
      summary: buildScanSummary(params.findings, params.filesScanned),
      error: params.error,
    };
  }

  /**
   * Estimate the number of files scanned from the options.
   * Subclasses can override for more accurate counts.
   */
  protected countScannedFiles(_options: ScanOptions): number {
    // Default: 0. Subclasses update this based on actual scan.
    return 0;
  }

  // ─── Export Formatting ────────────────────────────────────────────────

  private exportJson(result: ScanResult): string {
    return JSON.stringify(
      {
        tool: this.id,
        status: result.status,
        startedAt: result.startedAt.toISOString(),
        completedAt: result.completedAt?.toISOString(),
        summary: result.summary,
        findings: result.findings.map((f) => ({
          ...f,
          location: {
            ...f.location,
          },
        })),
        error: result.error,
      },
      null,
      JSON_INDENT,
    );
  }

  private exportMarkdown(result: ScanResult): string {
    const lines: string[] = [];

    lines.push(`# ${this.name} — Results`);
    lines.push('');
    lines.push(`**Status**: ${result.status}`);
    lines.push(`**Started**: ${result.startedAt.toISOString()}`);
    if (result.completedAt) {
      lines.push(`**Completed**: ${result.completedAt.toISOString()}`);
    }
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Total findings**: ${String(result.summary.totalFindings)}`);
    lines.push(`- **Files scanned**: ${String(result.summary.filesScanned)}`);
    lines.push(`- **Files with findings**: ${String(result.summary.filesWithFindings)}`);

    const severities: Severity[] = ['error', 'warning', 'info', 'hint'];
    for (const sev of severities) {
      const count = result.summary.bySeverity[sev];
      if (count > 0) {
        lines.push(`- **${sev}**: ${String(count)}`);
      }
    }
    lines.push('');

    if (result.error) {
      lines.push(`## Error`);
      lines.push('');
      lines.push(`\`\`\`\n${result.error}\n\`\`\``);
      lines.push('');
    }

    // Findings
    if (result.findings.length > 0) {
      lines.push('## Findings');
      lines.push('');

      for (const finding of result.findings) {
        const icon = severityIcon(finding.severity);
        lines.push(
          `### ${icon} ${finding.title}`,
        );
        lines.push('');
        lines.push(finding.description);
        lines.push('');
        lines.push(
          `📍 \`${finding.location.filePath}:${String(finding.location.startLine)}\``,
        );

        if (finding.suggestedFix) {
          lines.push('');
          lines.push(`**Suggested fix**: ${finding.suggestedFix.description}`);
          lines.push('');
          lines.push('```');
          lines.push(finding.suggestedFix.replacement);
          lines.push('```');
        }

        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

function severityIcon(severity: Severity): string {
  const icons: Record<Severity, string> = {
    error: '[ERROR]',
    warning: '[WARN]',
    info: '[INFO]',
    hint: '[HINT]',
  };
  return icons[severity];
}
