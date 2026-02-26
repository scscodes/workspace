"use strict";
/**
 * Telemetry & Structured Logging Infrastructure
 *
 * Provides:
 * - Type-safe telemetry events (signal events only, not verbose logs)
 * - Structured event tracking (commands, cache, errors)
 * - Integration with Logger for signal-based reporting
 * - No breaking changes to existing Logger interface (additive only)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleTelemetrySink = exports.InMemoryTelemetrySink = exports.TelemetryTracker = void 0;
const constants_1 = require("../constants");
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
class TelemetryTracker {
    constructor(sink, sessionId) {
        this.commandFrequency = new Map();
        this.sink = sink;
        this.sessionId = sessionId || this.generateSessionId();
    }
    /**
     * Track command execution start.
     */
    trackCommandStarted(commandName) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.COMMAND_STARTED,
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
    trackCommandCompleted(commandName, duration, outcome = "success") {
        const frequency = (this.commandFrequency.get(commandName) || 0) + 1;
        this.commandFrequency.set(commandName, frequency);
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.COMMAND_COMPLETED,
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
    trackCommandFailed(commandName, duration, error) {
        const frequency = (this.commandFrequency.get(commandName) || 0) + 1;
        this.commandFrequency.set(commandName, frequency);
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.COMMAND_FAILED,
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
    trackCacheHit(cacheKey, itemSize) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.CACHE_HIT,
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
    trackCacheMiss(cacheKey) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.CACHE_MISS,
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
    trackError(error, recoverable = false, additionalContext) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.ERROR_OCCURRED,
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
    trackWorkflowStarted(workflowId) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.WORKFLOW_STARTED,
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
    trackWorkflowCompleted(workflowId, duration, stepId) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.WORKFLOW_COMPLETED,
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
    trackWorkflowFailed(workflowId, duration, error, stepId) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.WORKFLOW_FAILED,
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
    trackAgentInvoked(agentId, capability, duration, outcome) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.AGENT_INVOKED,
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
    trackUserAction(action, target, value) {
        const event = {
            kind: constants_1.TELEMETRY_EVENT_KINDS.USER_ACTION,
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
    getCommandFrequency(commandName) {
        return this.commandFrequency.get(commandName) || 0;
    }
    /**
     * Flush any pending events to the sink.
     */
    async flush() {
        if (this.sink.flush) {
            await this.sink.flush();
        }
    }
    /**
     * Private: emit an event to the sink.
     */
    emit(event) {
        try {
            this.sink.emit(event);
        }
        catch (err) {
            // Silently fail; don't let telemetry errors break the application
            console.error("Telemetry emit failed", err);
        }
    }
    /**
     * Generate a unique session ID.
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.TelemetryTracker = TelemetryTracker;
/**
 * In-memory telemetry sink (for testing and development).
 * Stores events in a circular buffer.
 */
class InMemoryTelemetrySink {
    constructor(maxEvents = 1000) {
        this.events = [];
        this.maxEvents = maxEvents;
    }
    emit(event) {
        this.events.push(event);
        // Prevent unbounded growth
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
    }
    /**
     * Get all stored events.
     */
    getEvents() {
        return [...this.events];
    }
    /**
     * Get events filtered by kind.
     */
    getEventsByKind(kind) {
        return this.events.filter((e) => e.kind === kind);
    }
    /**
     * Clear all stored events.
     */
    clear() {
        this.events = [];
    }
    /**
     * Get summary statistics.
     */
    getSummary() {
        const eventsByKind = {};
        const sessionIds = new Set();
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
    async flush() {
        // No-op for in-memory sink
    }
}
exports.InMemoryTelemetrySink = InMemoryTelemetrySink;
/**
 * Console telemetry sink (for development/debugging).
 * Logs important events to console.
 */
class ConsoleTelemetrySink {
    constructor(silent = false) {
        this.silent = silent;
    }
    emit(event) {
        if (this.silent) {
            return;
        }
        // Only log important events, not all noise
        const importantKinds = [
            constants_1.TELEMETRY_EVENT_KINDS.COMMAND_STARTED,
            constants_1.TELEMETRY_EVENT_KINDS.COMMAND_FAILED,
            constants_1.TELEMETRY_EVENT_KINDS.ERROR_OCCURRED,
            constants_1.TELEMETRY_EVENT_KINDS.WORKFLOW_FAILED,
        ];
        if (importantKinds.includes(event.kind)) {
            console.log(`[TELEMETRY:${event.kind}]`, event.payload);
        }
    }
    async flush() {
        // No-op for console sink
    }
}
exports.ConsoleTelemetrySink = ConsoleTelemetrySink;
//# sourceMappingURL=telemetry.js.map