"use strict";
/**
 * Structured Logger — No console.log, explicit levels.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(maxEntries = 1000) {
        this.entries = [];
        this.maxEntries = maxEntries;
    }
    debug(message, context, data) {
        this.log(LogLevel.DEBUG, message, context, data);
    }
    info(message, context, data) {
        this.log(LogLevel.INFO, message, context, data);
    }
    warn(message, context, error) {
        this.log(LogLevel.WARN, message, context, error);
    }
    error(message, context, error) {
        this.log(LogLevel.ERROR, message, context, error);
    }
    log(level, message, context, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context,
            data,
        };
        this.entries.push(entry);
        // Prevent unbounded growth
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
        // For production, this could write to a file or external logging service
        // For now, just maintain in-memory buffer
    }
    /**
     * Export logs for debugging or telemetry.
     */
    exportLogs(level) {
        if (!level) {
            return [...this.entries];
        }
        return this.entries.filter((e) => e.level === level);
    }
    /**
     * Clear log history.
     */
    clear() {
        this.entries = [];
    }
    /**
     * Get recent logs (last N entries).
     */
    recent(count = 100) {
        return this.entries.slice(-count);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map