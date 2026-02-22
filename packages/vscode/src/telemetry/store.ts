import type Database from 'better-sqlite3';
import databaseModule from 'better-sqlite3';
import type { TelemetryEvent, ITelemetry } from '@aidev/core';
import { NullTelemetry } from '@aidev/core';
import { runMigrations } from './migrations/index.js';

const Database = databaseModule;

/**
 * SQLite-based telemetry implementation.
 * Stores events in a local database for analysis and debugging.
 * Never throws — all errors are logged internally.
 */
export class SqliteTelemetry implements ITelemetry {
  private db: Database.Database | undefined;
  private closed = false;

  constructor(dbPath: string) {
    try {
      // Open or create the SQLite database
      this.db = new Database(dbPath);
      
      // Run migrations
      runMigrations(this.db);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Telemetry] Failed to initialize SQLite store: ${errorMsg}`);
      // Continue with closed state — emit() will no-op
      this.closed = true;
    }
  }

  /**
   * Emit a telemetry event. Never throws.
   */
  emit(event: TelemetryEvent): void {
    if (this.closed || !this.db) {
      return;
    }

    try {
      // Extract optional fields from the event
      const runId = this.extractField(event, 'runId');
      const toolId = this.extractField(event, 'toolId');
      const workflowId = this.extractField(event, 'workflowId');

      // Serialize the entire event as JSON
      const payload = JSON.stringify(event);

      // Insert into the events table
      const stmt = this.db.prepare(
        `INSERT INTO events (kind, run_id, tool_id, workflow_id, payload, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      stmt.run(event.kind, runId, toolId, workflowId, payload, Date.now());
    } catch (error) {
      // Never throw — just log
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Telemetry] Failed to emit event: ${errorMsg}`);
    }
  }

  /**
   * Dispose of the telemetry instance (close the database).
   */
  dispose(): void {
    if (!this.closed && this.db) {
      try {
        this.db.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Telemetry] Error closing database: ${errorMsg}`);
      }
      this.closed = true;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Extract a field from an event object if it exists.
   * Returns undefined if the field doesn't exist or is undefined.
   */
  private extractField(
    obj: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const value = obj[field];
    if (value === undefined || value === null) {
      return undefined;
    }
    return String(value);
  }
}
