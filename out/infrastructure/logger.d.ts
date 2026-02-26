/**
 * Structured Logger — No console.log, explicit levels.
 */
import { Logger as LoggerInterface, AppError } from "../types";
export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR"
}
interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: string;
    data?: unknown;
}
export declare class Logger implements LoggerInterface {
    private entries;
    private maxEntries;
    constructor(maxEntries?: number);
    debug(message: string, context?: string, data?: unknown): void;
    info(message: string, context?: string, data?: unknown): void;
    warn(message: string, context?: string, error?: AppError): void;
    error(message: string, context?: string, error?: AppError): void;
    private log;
    /**
     * Export logs for debugging or telemetry.
     */
    exportLogs(level?: LogLevel): LogEntry[];
    /**
     * Clear log history.
     */
    clear(): void;
    /**
     * Get recent logs (last N entries).
     */
    recent(count?: number): LogEntry[];
}
export {};
//# sourceMappingURL=logger.d.ts.map