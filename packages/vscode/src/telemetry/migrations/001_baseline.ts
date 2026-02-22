import type Database from 'better-sqlite3';

/**
 * Baseline migration: creates the events table and indexes for telemetry storage.
 */
export const migration_001 = {
  version: 1,
  name: 'baseline',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT    NOT NULL,
        run_id      TEXT,
        tool_id     TEXT,
        workflow_id TEXT,
        payload     TEXT    NOT NULL,
        recorded_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_kind        ON events(kind);
      CREATE INDEX IF NOT EXISTS idx_events_run_id      ON events(run_id);
      CREATE INDEX IF NOT EXISTS idx_events_tool_id     ON events(tool_id);
      CREATE INDEX IF NOT EXISTS idx_events_recorded_at ON events(recorded_at);
    `);
  },
};
