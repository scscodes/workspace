import type Database from 'better-sqlite3';
import { migration_001 } from './001_baseline.js';

/**
 * A migration object with version, name, and up function.
 */
interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * All migrations, in order.
 */
const ALL_MIGRATIONS: Migration[] = [migration_001];

/**
 * Run all pending migrations against the database.
 * Tracks applied migrations in a schema_migrations table.
 * Idempotent: safe to run multiple times.
 */
export function runMigrations(db: Database.Database): void {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      version    INTEGER NOT NULL UNIQUE,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  // Get the highest applied version
  const maxVersionStmt = db.prepare(
    'SELECT MAX(version) as max_version FROM schema_migrations',
  );
  const result = maxVersionStmt.get() as { max_version: number | null };
  const maxApplied = result.max_version ?? 0;

  // Run pending migrations
  for (const migration of ALL_MIGRATIONS) {
    if (migration.version > maxApplied) {
      try {
        // Run the migration
        migration.up(db);

        // Record that it was applied
        const insertStmt = db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        );
        insertStmt.run(migration.version, migration.name, Date.now());
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${errorMsg}`,
        );
      }
    }
  }
}
