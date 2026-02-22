import type { ToolId } from '../types/index.js';

/**
 * A discriminated union of all telemetry events emitted by the system.
 * Each event kind has a specific shape with relevant metadata.
 */
export type TelemetryEvent =
  | {
      kind: 'tool.start';
      runId: string;
      toolId: ToolId;
      triggeredBy: 'slash' | 'workflow' | 'decompose' | 'direct';
      timestamp: number;
    }
  | {
      kind: 'tool.complete';
      runId: string;
      toolId: ToolId;
      durationMs: number;
      findingCount: number;
      fileCount: number;
      timestamp: number;
    }
  | {
      kind: 'tool.error';
      runId: string;
      toolId: ToolId;
      error: string;
      durationMs: number;
      timestamp: number;
    }
  | {
      kind: 'workflow.start';
      runId: string;
      workflowId: string;
      matchedInput: string;
      timestamp: number;
    }
  | {
      kind: 'workflow.complete';
      runId: string;
      workflowId: string;
      durationMs: number;
      parallelMs: number;
      timestamp: number;
    }
  | {
      kind: 'finding.acted';
      findingId: string;
      toolId: ToolId;
      action: 'accepted' | 'dismissed';
      timestamp: number;
    }
  | {
      kind: 'speculative.hit';
      toolId: ToolId;
      savedMs: number;
      timestamp: number;
    }
  | {
      kind: 'speculative.miss';
      toolId: ToolId;
      timestamp: number;
    }
  | {
      kind: 'decompose.complete';
      runId: string;
      subtaskCount: number;
      findingsBefore: number;
      findingsAfter: number;
      durationMs: number;
      timestamp: number;
    };

/**
 * Interface for telemetry emission.
 * Implementations must never throw — failures should be logged internally.
 */
export interface ITelemetry {
  /**
   * Emit a telemetry event.
   * Fire-and-forget: this method must never throw.
   * Implementations wrap in try/catch and log errors internally.
   */
  emit(event: TelemetryEvent): void;

  /**
   * Dispose of the telemetry instance (e.g., close databases, flush buffers).
   */
  dispose(): void;
}
