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
   */
  async execute(options: ScanOptions): Promise<ScanResult> {
    this.abortController = new AbortController();
    this.currentStatus = 'running';
    const startedAt = new Date();

    const mergedOptions: ScanOptions = {
      ...options,
      signal: this.abortController.signal,
    };

    try {
      const findings = await this.run(mergedOptions);
      this.currentStatus = 'completed';

      return this.buildResult({
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        findings,
        filesScanned: this.countScannedFiles(mergedOptions),
      });
    } catch (error) {
      if (this.abortController.signal.aborted) {
        this.currentStatus = 'cancelled';
        return this.buildResult({
          status: 'cancelled',
          startedAt,
          completedAt: new Date(),
          findings: [],
          filesScanned: 0,
        });
      }

      this.currentStatus = 'failed';
      return this.buildResult({
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        findings: [],
        error: error instanceof Error ? error.message : String(error),
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
