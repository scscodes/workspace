import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { SqliteTelemetry } from './store.js';
import { runMigrations } from './migrations/index.js';
import type { TelemetryEvent } from '@aidev/core';

describe('SqliteTelemetry Store', () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    // Create a temporary in-memory database for testing
    db = new Database(':memory:');
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Already closed
    }
  });

  describe('Migration Runner', () => {
    it('should create the events table on first run', () => {
      runMigrations(db);

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='events'",
        )
        .all();

      expect(tables.length).toBe(1);
    });

    it('should be idempotent (run twice without error)', () => {
      expect(() => {
        runMigrations(db);
        runMigrations(db);
      }).not.toThrow();

      const migrations = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as {
        count: number;
      };

      expect(migrations.count).toBe(1);
    });

    it('should create indexes', () => {
      runMigrations(db);

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'",
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('idx_events_kind');
      expect(indexNames).toContain('idx_events_run_id');
      expect(indexNames).toContain('idx_events_tool_id');
      expect(indexNames).toContain('idx_events_recorded_at');
    });
  });

  describe('SqliteTelemetry emit()', () => {
    beforeEach(() => {
      runMigrations(db);
    });

    it('should insert a tool.start event', () => {
      const store = new (class extends SqliteTelemetry {
        constructor() {
          super(':memory:');
          // Override db to use our test instance
          (this as any).db = db;
          (this as any).closed = false;
        }
      })();

      const event: TelemetryEvent = {
        kind: 'tool.start',
        runId: 'run-1',
        toolId: 'dead-code',
        triggeredBy: 'direct',
        timestamp: 1234567890,
      };

      store.emit(event);

      const rows = db.prepare('SELECT * FROM events WHERE kind = ?').all('tool.start') as Array<any>;
      expect(rows.length).toBe(1);
      expect(rows[0].run_id).toBe('run-1');
      expect(rows[0].tool_id).toBe('dead-code');
    });

    it('should insert a tool.complete event with full payload', () => {
      const store = new (class extends SqliteTelemetry {
        constructor() {
          super(':memory:');
          (this as any).db = db;
          (this as any).closed = false;
        }
      })();

      const event: TelemetryEvent = {
        kind: 'tool.complete',
        runId: 'run-1',
        toolId: 'lint',
        durationMs: 500,
        findingCount: 5,
        fileCount: 10,
        timestamp: 1234567890,
      };

      store.emit(event);

      const rows = db.prepare('SELECT * FROM events WHERE kind = ?').all('tool.complete') as Array<any>;
      expect(rows.length).toBe(1);

      const payload = JSON.parse(rows[0].payload) as TelemetryEvent;
      expect(payload.kind).toBe('tool.complete');
      expect((payload as any).durationMs).toBe(500);
      expect((payload as any).findingCount).toBe(5);
      expect((payload as any).fileCount).toBe(10);
    });

    it('should never throw even if db is closed', () => {
      db.close();
      const store = new (class extends SqliteTelemetry {
        constructor() {
          super(':memory:');
          (this as any).db = db;
          (this as any).closed = true;
        }
      })();

      const event: TelemetryEvent = {
        kind: 'tool.start',
        runId: 'run-1',
        toolId: 'comments',
        triggeredBy: 'workflow',
        timestamp: 1234567890,
      };

      expect(() => store.emit(event)).not.toThrow();
    });

    it('should store payload as valid JSON', () => {
      const store = new (class extends SqliteTelemetry {
        constructor() {
          super(':memory:');
          (this as any).db = db;
          (this as any).closed = false;
        }
      })();

      const event: TelemetryEvent = {
        kind: 'speculative.hit',
        toolId: 'lint',
        savedMs: 250,
        timestamp: 1234567890,
      };

      store.emit(event);

      const rows = db.prepare('SELECT payload FROM events').all() as Array<{ payload: string }>;
      expect(() => JSON.parse(rows[0].payload)).not.toThrow();
    });

    it('should insert a workflow.complete event', () => {
      const store = new (class extends SqliteTelemetry {
        constructor() {
          super(':memory:');
          (this as any).db = db;
          (this as any).closed = false;
        }
      })();

      const event: TelemetryEvent = {
        kind: 'workflow.complete',
        runId: 'wf-1',
        workflowId: 'code-review',
        durationMs: 1000,
        parallelMs: 500,
        timestamp: 1234567890,
      };

      store.emit(event);

      const rows = db.prepare('SELECT * FROM events WHERE kind = ?').all('workflow.complete') as Array<any>;
      expect(rows.length).toBe(1);
      expect(rows[0].workflow_id).toBe('code-review');
    });

    it('should handle multiple events in sequence', () => {
      const store = new (class extends SqliteTelemetry {
        constructor() {
          super(':memory:');
          (this as any).db = db;
          (this as any).closed = false;
        }
      })();

      const event1: TelemetryEvent = {
        kind: 'tool.start',
        runId: 'run-1',
        toolId: 'dead-code',
        triggeredBy: 'slash',
        timestamp: 1000,
      };

      const event2: TelemetryEvent = {
        kind: 'tool.complete',
        runId: 'run-1',
        toolId: 'dead-code',
        durationMs: 100,
        findingCount: 2,
        fileCount: 5,
        timestamp: 1100,
      };

      store.emit(event1);
      store.emit(event2);

      const rows = db.prepare('SELECT * FROM events ORDER BY recorded_at').all() as Array<any>;
      expect(rows.length).toBe(2);
      expect(rows[0].kind).toBe('tool.start');
      expect(rows[1].kind).toBe('tool.complete');
    });
  });
});
