import { execGitStrict } from './executor.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A parsed git log entry.
 */
export interface GitLogEntry {
  /** Full commit hash */
  hash: string;
  /** Author name */
  authorName: string;
  /** Author email */
  authorEmail: string;
  /** Commit timestamp */
  timestamp: Date;
  /** First line of commit message */
  subject: string;
  /** Files changed in this commit */
  files?: string[];
}

/**
 * Options for fetching git log.
 */
export interface GitLogOptions {
  /** Repository working directory */
  cwd: string;
  /** Max number of commits to return */
  maxCount?: number;
  /** Only include commits after this date */
  since?: Date | string;
  /** Only include commits before this date */
  until?: Date | string;
  /** Limit to specific file or directory paths */
  paths?: string[];
  /** Include list of changed files per commit */
  includeFiles?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Delimiter between fields in --format output. Using ASCII Unit Separator. */
const FIELD_DELIMITER = '\x1f';

/** Delimiter between records. Using ASCII Record Separator. */
const RECORD_DELIMITER = '\x1e';

/** Default max commits to fetch */
const DEFAULT_MAX_COUNT = 50;

/** Number of expected fields in our format string */
const EXPECTED_FIELD_COUNT = 5;

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Fetch and parse git log entries.
 *
 * Uses a custom format with ASCII delimiters to avoid issues with
 * special characters in commit messages or author names.
 */
export async function getLog(options: GitLogOptions): Promise<GitLogEntry[]> {
  const { cwd, maxCount = DEFAULT_MAX_COUNT, since, until, paths, includeFiles } = options;

  const format = [
    '%H', // hash
    '%an', // author name
    '%ae', // author email
    '%at', // author timestamp (unix)
    '%s', // subject
  ].join(FIELD_DELIMITER);

  const args = ['log', `--format=${RECORD_DELIMITER}${format}`, `-n`, String(maxCount)];

  if (includeFiles) {
    args.push('--name-only');
  }

  if (since) {
    args.push(`--since=${since instanceof Date ? since.toISOString() : since}`);
  }

  if (until) {
    args.push(`--until=${until instanceof Date ? until.toISOString() : until}`);
  }

  // -- separates paths from options
  if (paths && paths.length > 0) {
    args.push('--', ...paths);
  }

  const output = await execGitStrict({ cwd, args });
  if (!output.trim()) return [];

  return parseLogOutput(output, includeFiles ?? false);
}

/**
 * Parse raw git log output into structured entries.
 *
 * @internal Exported for testing.
 */
export function parseLogOutput(output: string, includeFiles: boolean): GitLogEntry[] {
  const records = output.split(RECORD_DELIMITER).filter((r) => r.trim().length > 0);
  const entries: GitLogEntry[] = [];

  for (const record of records) {
    const entry = parseLogRecord(record.trim(), includeFiles);
    if (entry) entries.push(entry);
  }

  return entries;
}

function parseLogRecord(record: string, includeFiles: boolean): GitLogEntry | null {
  // When --name-only is used, files appear on separate lines after the format line
  const lines = record.split('\n');
  const formatLine = lines[0];
  if (!formatLine) return null;

  const fields = formatLine.split(FIELD_DELIMITER);
  if (fields.length < EXPECTED_FIELD_COUNT) return null;

  const [hash, authorName, authorEmail, timestampStr, subject] = fields;

  const timestampSeconds = parseInt(timestampStr, 10);
  if (isNaN(timestampSeconds)) return null;

  const entry: GitLogEntry = {
    hash,
    authorName,
    authorEmail,
    timestamp: new Date(timestampSeconds * 1000),
    subject,
  };

  if (includeFiles) {
    // Files are on subsequent non-empty lines
    entry.files = lines.slice(1).filter((l) => l.trim().length > 0);
  }

  return entry;
}

/**
 * Count total commits in the repo (or for specific paths).
 */
export async function getCommitCount(
  cwd: string,
  paths?: string[],
): Promise<number> {
  const args = ['rev-list', '--count', 'HEAD'];
  if (paths && paths.length > 0) {
    args.push('--', ...paths);
  }

  const output = await execGitStrict({ cwd, args });
  return parseInt(output.trim(), 10) || 0;
}
