import { describe, it, expect } from 'vitest';
import { NullTelemetry } from './null.js';
import type { TelemetryEvent } from './types.js';

describe('NullTelemetry', () => {
  const telemetry = new NullTelemetry();

  it('should never throw on emit()', () => {
    expect(() => {
      telemetry.emit({
        kind: 'tool.start',
        runId: 'test-run',
        toolId: 'dead-code',
        triggeredBy: 'direct',
        timestamp: Date.now(),
      });
    }).not.toThrow();
  });

  it('should handle tool.start event', () => {
    const event: TelemetryEvent = {
      kind: 'tool.start',
      runId: 'run-1',
      toolId: 'lint',
      triggeredBy: 'slash',
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle tool.complete event', () => {
    const event: TelemetryEvent = {
      kind: 'tool.complete',
      runId: 'run-1',
      toolId: 'comments',
      durationMs: 500,
      findingCount: 3,
      fileCount: 10,
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle tool.error event', () => {
    const event: TelemetryEvent = {
      kind: 'tool.error',
      runId: 'run-1',
      toolId: 'commit',
      error: 'File not found',
      durationMs: 100,
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle workflow.start event', () => {
    const event: TelemetryEvent = {
      kind: 'workflow.start',
      runId: 'wf-1',
      workflowId: 'code-review',
      matchedInput: 'review my code',
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle workflow.complete event', () => {
    const event: TelemetryEvent = {
      kind: 'workflow.complete',
      runId: 'wf-1',
      workflowId: 'code-review',
      durationMs: 1000,
      parallelMs: 500,
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle finding.acted event', () => {
    const event: TelemetryEvent = {
      kind: 'finding.acted',
      findingId: 'finding-123',
      toolId: 'dead-code',
      action: 'accepted',
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle speculative.hit event', () => {
    const event: TelemetryEvent = {
      kind: 'speculative.hit',
      toolId: 'lint',
      savedMs: 250,
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle speculative.miss event', () => {
    const event: TelemetryEvent = {
      kind: 'speculative.miss',
      toolId: 'dead-code',
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should handle decompose.complete event', () => {
    const event: TelemetryEvent = {
      kind: 'decompose.complete',
      runId: 'decomp-1',
      subtaskCount: 3,
      findingsBefore: 10,
      findingsAfter: 8,
      durationMs: 2000,
      timestamp: 1234567890,
    };
    expect(() => telemetry.emit(event)).not.toThrow();
  });

  it('should never throw on dispose()', () => {
    expect(() => telemetry.dispose()).not.toThrow();
  });
});
