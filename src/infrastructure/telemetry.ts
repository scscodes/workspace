/**
 * Telemetry & Structured Logging Infrastructure
 * 
 * Provides:
 * - Type-safe telemetry events (signal events only, not verbose logs)
 * - Structured event tracking (commands, cache, errors)
 * - Integration with Logger for signal-based reporting
 * - No breaking changes to existing Logger interface (additive only)
 */

import { Logger, AppError } from "../types";
import {
  TELEMETRY_EVENT_KINDS,
  CommandName,
  ErrorCode,
} from "../constants";

// ============================================================================
// Telemetry Event Types
// ============================================================================

/**
 * Event kind discriminator for type-safe event dispatch.
 * Only signal events that represent state changes or important milestones,
 * NOT verbose debug logs.
 */
export type TelemetryEventKind =
  | typeof TELEMETRY_EVENT_KINDS.COMMAND_STARTED
  | typeof TELEMETRY_EVENT_KINDS.COMMAND_COMPLETED
  | typeof TELEMETRY_EVENT_KINDS.COMMAND_FAILED
  | typeof TELEMETRY_EVENT_KINDS.CACHE_HIT
  | typeof TELEMETRY_EVENT_KINDS.CACHE_MISS
  | typeof TELEMETRY_EVENT_KINDS.ERROR_OCCURRED
  | typeof TELEMETRY_EVENT_KINDS.WORKFLOW_STARTED
  | typeof TELEMETRY_EVENT_KINDS.WORKFLOW_COMPLETED
  | typeof TELEMETRY_EVENT_KINDS.WORKFLOW_FAILED
  | typeof TELEMETRY_EVENT_KINDS.AGENT_INVOKED
  | typeof TELEMETRY_EVENT_KINDS.USER_ACTION;

/**
 * Command execution event payload.
 */
export interface CommandEventPayload {
  commandName: CommandName | string;
  duration?: number; // milliseconds
  outcome?: "success" | "failure" | "timeout" | "cancelled";
  error?: {
    code: ErrorCode | string;
    message: string;
  };
  frequency?: number; // how many times this command has been executed in this session
}

/**
 * Cache operation event payload.
 */
export interface CacheEventPayload {
  cacheKey: string;
  hitRate?: number; // 0.0 to 1.0
  itemSize?: number; // bytes
  evictionReason?: string;
}

/**
 * Error event payload.
 */
export interface ErrorEventPayload {
  errorCode: ErrorCode | string;
  errorMessage: string;
  errorType?: string;
  stack?: string;
  context?: string;
  recoverable: boolean;
}

/**
 * Workflow event payload.
 */
export interface WorkflowEventPayload {
  workflowId: string;
  stepId?: string;
  duration?: number; // milliseconds
  outcome?: "success" | "failure";
  error?: {
    code: ErrorCode | string;
    message: string;
  };
}

/**
 * Agent event payload.
 */
export interface AgentEventPayload {
  agentId: string;
  capability: CommandName | string;
  duration?: number; // milliseconds
  outcome?: "success" | "failure";
}

/**
 * User action event payload (e.g., UI interactions).
 */
export interface UserActionEventPayload {
  action: string;
  target?: string;
  value?: string | number | boolean;
}

/**
 * Discriminated union of all telemetry event payloads.
 */
export type TelemetryEventPayload =
  | CommandEventPayload
  | CacheEventPayload
  | ErrorEventPayload
  | WorkflowEventPayload
  | AgentEventPayload
  | UserActionEventPayload
  | Record<string, unknown>;

/**
 * A single telemetry event: kind + structured payload.
 * This is what gets emitted and tracked.
 */
export interface TelemetryEvent {
  kind: TelemetryEventKind;
  payload: TelemetryEventPayload;
  timestamp: number; // Unix timestamp in milliseconds
  sessionId?: string; // Session identifier for correlation
}

/**
 * Telemetry sink: receives events from the telemetry tracker.
 */
export interface TelemetrySink {
  emit(event: TelemetryEvent): void | Promise<void>;
  flush?(): Promise<void>;
}

// ============================================================================
// Telemetry Tracker
// ============================================================================

/**
 * Tracks telemetry events across the application.
 * Emits only signal events (state changes, errors, milestones).
 * Does NOT emit verbose debug logs.
 *
 * Usage:
 *   telemetry.trackCommandStarted('git.status');
 *   // ... operation ...
 *   telemetry.trackCommandCompleted('git.status', 125, 'success');
 */
export class TelemetryTracker {
  private sink: TelemetrySink;
  private sessionId: string;
  private commandFrequency: Map<string, number> = new Map();

  constructor(sink: TelemetrySink, sessionId?: string) {
    this.sink = sink;
    this.sessionId = sessionId || this.generateSessionId();
  }

  /**
   * Track command execution start.
   */
  trackCommandStarted(commandName: CommandName | string): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.COMMAND_STARTED,
      payload: {
        commandName,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track command execution completion.
   */
  trackCommandCompleted(
    commandName: CommandName | string,
    duration: number,
    outcome: "success" | "failure" | "timeout" | "cancelled" = "success"
  ): void {
    const frequency =
      (this.commandFrequency.get(commandName) || 0) + 1;
    this.commandFrequency.set(commandName, frequency);

    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.COMMAND_COMPLETED,
      payload: {
        commandName,
        duration,
        outcome,
        frequency,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track command execution failure.
   */
  trackCommandFailed(
    commandName: CommandName | string,
    duration: number,
    error: AppError
  ): void {
    const frequency =
      (this.commandFrequency.get(commandName) || 0) + 1;
    this.commandFrequency.set(commandName, frequency);

    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.COMMAND_FAILED,
      payload: {
        commandName,
        duration,
        outcome: "failure",
        error: {
          code: error.code,
          message: error.message,
        },
        frequency,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track cache hit.
   */
  trackCacheHit(cacheKey: string, itemSize?: number): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.CACHE_HIT,
      payload: {
        cacheKey,
        itemSize,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track cache miss.
   */
  trackCacheMiss(cacheKey: string): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.CACHE_MISS,
      payload: {
        cacheKey,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track error occurrence.
   */
  trackError(
    error: AppError,
    recoverable: boolean = false,
    additionalContext?: string
  ): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.ERROR_OCCURRED,
      payload: {
        errorCode: error.code,
        errorMessage: error.message,
        recoverable,
        context: additionalContext || error.context,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track workflow execution start.
   */
  trackWorkflowStarted(workflowId: string): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.WORKFLOW_STARTED,
      payload: {
        workflowId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track workflow execution completion.
   */
  trackWorkflowCompleted(
    workflowId: string,
    duration: number,
    stepId?: string
  ): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.WORKFLOW_COMPLETED,
      payload: {
        workflowId,
        stepId,
        duration,
        outcome: "success",
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track workflow execution failure.
   */
  trackWorkflowFailed(
    workflowId: string,
    duration: number,
    error: AppError,
    stepId?: string
  ): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.WORKFLOW_FAILED,
      payload: {
        workflowId,
        stepId,
        duration,
        outcome: "failure",
        error: {
          code: error.code,
          message: error.message,
        },
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track agent invocation.
   */
  trackAgentInvoked(
    agentId: string,
    capability: CommandName | string,
    duration?: number,
    outcome?: "success" | "failure"
  ): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.AGENT_INVOKED,
      payload: {
        agentId,
        capability,
        duration,
        outcome,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Track user action (e.g., UI interaction).
   */
  trackUserAction(
    action: string,
    target?: string,
    value?: string | number | boolean
  ): void {
    const event: TelemetryEvent = {
      kind: TELEMETRY_EVENT_KINDS.USER_ACTION,
      payload: {
        action,
        target,
        value,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.emit(event);
  }

  /**
   * Get command execution frequency for a given command.
   */
  getCommandFrequency(commandName: string): number {
    return this.commandFrequency.get(commandName) || 0;
  }

  /**
   * Flush any pending events to the sink.
   */
  async flush(): Promise<void> {
    if (this.sink.flush) {
      await this.sink.flush();
    }
  }

  /**
   * Private: emit an event to the sink.
   */
  private emit(event: TelemetryEvent): void {
    try {
      this.sink.emit(event);
    } catch (err) {
      // Silently fail; don't let telemetry errors break the application
      console.error("Telemetry emit failed", err);
    }
  }

  /**
   * Generate a unique session ID.
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Logger Telemetry Integration (Additive)
// ============================================================================

/**
 * Extend the Logger interface with telemetry tracking methods.
 * This is additive — no breaking changes to existing Logger.
 *
 * Usage in domain services:
 *   logger.trackCommand('git.status', startTime);
 *   logger.trackError(error, true); // recoverable error
 */
export interface LoggerWithTelemetry extends Logger {
  /**
   * Associate a telemetry tracker with this logger.
   * Enables additive telemetry tracking without breaking existing Logger interface.
   */
  setTelemetry?(telemetry: TelemetryTracker): void;

  /**
   * Track a command execution.
   * Helper method for common command tracking pattern.
   */
  trackCommand?(
    commandName: CommandName | string,
    startTime: number,
    outcome?: "success" | "failure"
  ): void;

  /**
   * Track an error with telemetry.
   */
  trackError?(error: AppError, recoverable?: boolean): void;

  /**
   * Track a cache operation.
   */
  trackCache?(key: string, hit: boolean): void;
}

/**
 * In-memory telemetry sink (for testing and development).
 * Stores events in a circular buffer.
 */
export class InMemoryTelemetrySink implements TelemetrySink {
  private events: TelemetryEvent[] = [];
  private maxEvents: number;

  constructor(maxEvents: number = 1000) {
    this.maxEvents = maxEvents;
  }

  emit(event: TelemetryEvent): void {
    this.events.push(event);

    // Prevent unbounded growth
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * Get all stored events.
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by kind.
   */
  getEventsByKind(kind: TelemetryEventKind): TelemetryEvent[] {
    return this.events.filter((e) => e.kind === kind);
  }

  /**
   * Clear all stored events.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    totalEvents: number;
    eventsByKind: Record<TelemetryEventKind, number>;
    sessionIds: string[];
  } {
    const eventsByKind: Record<TelemetryEventKind, number> = {} as any;
    const sessionIds = new Set<string>();

    for (const event of this.events) {
      eventsByKind[event.kind] = (eventsByKind[event.kind] || 0) + 1;
      if (event.sessionId) {
        sessionIds.add(event.sessionId);
      }
    }

    return {
      totalEvents: this.events.length,
      eventsByKind,
      sessionIds: Array.from(sessionIds),
    };
  }

  async flush(): Promise<void> {
    // No-op for in-memory sink
  }
}

/**
 * Console telemetry sink (for development/debugging).
 * Logs important events to console.
 */
export class ConsoleTelemetrySink implements TelemetrySink {
  private silent: boolean;

  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  emit(event: TelemetryEvent): void {
    if (this.silent) {
      return;
    }

    // Only log important events, not all noise
    const importantKinds = [
      TELEMETRY_EVENT_KINDS.COMMAND_STARTED,
      TELEMETRY_EVENT_KINDS.COMMAND_FAILED,
      TELEMETRY_EVENT_KINDS.ERROR_OCCURRED,
      TELEMETRY_EVENT_KINDS.WORKFLOW_FAILED,
    ];

    if (importantKinds.includes(event.kind as any)) {
      console.log(`[TELEMETRY:${event.kind}]`, event.payload);
    }
  }

  async flush(): Promise<void> {
    // No-op for console sink
  }
}
