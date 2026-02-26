/**
 * Structured Logger — No console.log, explicit levels.
 */

import { Logger as LoggerInterface, AppError } from "../types";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

export class Logger implements LoggerInterface {
  private entries: LogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  debug(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  warn(message: string, context?: string, error?: AppError): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, context?: string, error?: AppError): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    data?: unknown
  ): void {
    const entry: LogEntry = {
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
  exportLogs(level?: LogLevel): LogEntry[] {
    if (!level) {
      return [...this.entries];
    }
    return this.entries.filter((e) => e.level === level);
  }

  /**
   * Clear log history.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get recent logs (last N entries).
   */
  recent(count: number = 100): LogEntry[] {
    return this.entries.slice(-count);
  }
}
