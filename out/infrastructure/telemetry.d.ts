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
import { TELEMETRY_EVENT_KINDS, CommandName, ErrorCode } from "../constants";
/**
 * Event kind discriminator for type-safe event dispatch.
 * Only signal events that represent state changes or important milestones,
 * NOT verbose debug logs.
 */
export type TelemetryEventKind = typeof TELEMETRY_EVENT_KINDS.COMMAND_STARTED | typeof TELEMETRY_EVENT_KINDS.COMMAND_COMPLETED | typeof TELEMETRY_EVENT_KINDS.COMMAND_FAILED | typeof TELEMETRY_EVENT_KINDS.CACHE_HIT | typeof TELEMETRY_EVENT_KINDS.CACHE_MISS | typeof TELEMETRY_EVENT_KINDS.ERROR_OCCURRED | typeof TELEMETRY_EVENT_KINDS.WORKFLOW_STARTED | typeof TELEMETRY_EVENT_KINDS.WORKFLOW_COMPLETED | typeof TELEMETRY_EVENT_KINDS.WORKFLOW_FAILED | typeof TELEMETRY_EVENT_KINDS.AGENT_INVOKED | typeof TELEMETRY_EVENT_KINDS.USER_ACTION;
/**
 * Command execution event payload.
 */
export interface CommandEventPayload {
    commandName: CommandName | string;
    duration?: number;
    outcome?: "success" | "failure" | "timeout" | "cancelled";
    error?: {
        code: ErrorCode | string;
        message: string;
    };
    frequency?: number;
}
/**
 * Cache operation event payload.
 */
export interface CacheEventPayload {
    cacheKey: string;
    hitRate?: number;
    itemSize?: number;
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
    duration?: number;
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
    duration?: number;
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
export type TelemetryEventPayload = CommandEventPayload | CacheEventPayload | ErrorEventPayload | WorkflowEventPayload | AgentEventPayload | UserActionEventPayload | Record<string, unknown>;
/**
 * A single telemetry event: kind + structured payload.
 * This is what gets emitted and tracked.
 */
export interface TelemetryEvent {
    kind: TelemetryEventKind;
    payload: TelemetryEventPayload;
    timestamp: number;
    sessionId?: string;
}
/**
 * Telemetry sink: receives events from the telemetry tracker.
 */
export interface TelemetrySink {
    emit(event: TelemetryEvent): void | Promise<void>;
    flush?(): Promise<void>;
}
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
export declare class TelemetryTracker {
    private sink;
    private sessionId;
    private commandFrequency;
    constructor(sink: TelemetrySink, sessionId?: string);
    /**
     * Track command execution start.
     */
    trackCommandStarted(commandName: CommandName | string): void;
    /**
     * Track command execution completion.
     */
    trackCommandCompleted(commandName: CommandName | string, duration: number, outcome?: "success" | "failure" | "timeout" | "cancelled"): void;
    /**
     * Track command execution failure.
     */
    trackCommandFailed(commandName: CommandName | string, duration: number, error: AppError): void;
    /**
     * Track cache hit.
     */
    trackCacheHit(cacheKey: string, itemSize?: number): void;
    /**
     * Track cache miss.
     */
    trackCacheMiss(cacheKey: string): void;
    /**
     * Track error occurrence.
     */
    trackError(error: AppError, recoverable?: boolean, additionalContext?: string): void;
    /**
     * Track workflow execution start.
     */
    trackWorkflowStarted(workflowId: string): void;
    /**
     * Track workflow execution completion.
     */
    trackWorkflowCompleted(workflowId: string, duration: number, stepId?: string): void;
    /**
     * Track workflow execution failure.
     */
    trackWorkflowFailed(workflowId: string, duration: number, error: AppError, stepId?: string): void;
    /**
     * Track agent invocation.
     */
    trackAgentInvoked(agentId: string, capability: CommandName | string, duration?: number, outcome?: "success" | "failure"): void;
    /**
     * Track user action (e.g., UI interaction).
     */
    trackUserAction(action: string, target?: string, value?: string | number | boolean): void;
    /**
     * Get command execution frequency for a given command.
     */
    getCommandFrequency(commandName: string): number;
    /**
     * Flush any pending events to the sink.
     */
    flush(): Promise<void>;
    /**
     * Private: emit an event to the sink.
     */
    private emit;
    /**
     * Generate a unique session ID.
     */
    private generateSessionId;
}
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
    trackCommand?(commandName: CommandName | string, startTime: number, outcome?: "success" | "failure"): void;
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
export declare class InMemoryTelemetrySink implements TelemetrySink {
    private events;
    private maxEvents;
    constructor(maxEvents?: number);
    emit(event: TelemetryEvent): void;
    /**
     * Get all stored events.
     */
    getEvents(): TelemetryEvent[];
    /**
     * Get events filtered by kind.
     */
    getEventsByKind(kind: TelemetryEventKind): TelemetryEvent[];
    /**
     * Clear all stored events.
     */
    clear(): void;
    /**
     * Get summary statistics.
     */
    getSummary(): {
        totalEvents: number;
        eventsByKind: Record<TelemetryEventKind, number>;
        sessionIds: string[];
    };
    flush(): Promise<void>;
}
/**
 * Console telemetry sink (for development/debugging).
 * Logs important events to console.
 */
export declare class ConsoleTelemetrySink implements TelemetrySink {
    private silent;
    constructor(silent?: boolean);
    emit(event: TelemetryEvent): void;
    flush(): Promise<void>;
}
//# sourceMappingURL=telemetry.d.ts.map