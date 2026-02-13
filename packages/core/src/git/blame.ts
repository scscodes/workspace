import { execGitStrict } from './executor.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Blame information for a range of lines.
 */
export interface BlameRange {
  /** Commit hash that last modified these lines */
  hash: string;
  /** Author of the last modification */
  authorName: string;
  /** When the lines were last modified */
  timestamp: Date;
  /** 1-based start line */
  startLine: number;
  /** Number of lines in this range */
  lineCount: number;
  /** Age of this range in days (from now) */
  ageDays: number;
}

/**
 * Options for blame analysis.
 */
export interface BlameOptions {
  /** Repository working directory */
  cwd: string;
  /** File path (relative to cwd) */
  filePath: string;
  /** Optional: only blame specific line range (1-based, inclusive) */
  startLine?: number;
  /** Optional: end of line range (1-based, inclusive) */
  endLine?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Get blame information for a file, grouped into ranges by commit.
 *
 * Uses `git blame --porcelain` for reliable machine-readable output.
 */
export async function getBlame(options: BlameOptions): Promise<BlameRange[]> {
  const { cwd, filePath, startLine, endLine } = options;
  const args = ['blame', '--porcelain'];

  if (startLine !== undefined && endLine !== undefined) {
    args.push(`-L${String(startLine)},${String(endLine)}`);
  }

  args.push('--', filePath);

  const output = await execGitStrict({ cwd, args });
  return parseBlameOutput(output);
}

/**
 * Get the average age (in days) of all lines in a file.
 * Useful for quick staleness assessment.
 */
export async function getFileAge(cwd: string, filePath: string): Promise<number> {
  const ranges = await getBlame({ cwd, filePath });
  if (ranges.length === 0) return 0;

  let totalWeightedAge = 0;
  let totalLines = 0;

  for (const range of ranges) {
    totalWeightedAge += range.ageDays * range.lineCount;
    totalLines += range.lineCount;
  }

  return totalLines > 0 ? totalWeightedAge / totalLines : 0;
}

/**
 * Parse `git blame --porcelain` output into BlameRange entries.
 *
 * Porcelain format:
 *   <hash> <orig-line> <final-line> [<num-lines>]
 *   author <name>
 *   author-mail <email>
 *   author-time <timestamp>
 *   author-tz <tz>
 *   ...
 *   \t<line-content>
 *
 * The first occurrence of a hash includes full details.
 * Subsequent occurrences may be abbreviated.
 *
 * @internal Exported for testing.
 */
export function parseBlameOutput(output: string): BlameRange[] {
  const now = Date.now();
  const lines = output.split('\n');
  const ranges: BlameRange[] = [];

  // Cache commit info as we encounter it
  const commitCache = new Map<string, { authorName: string; timestamp: Date }>();

  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const hash = headerMatch[1];
    const finalLine = parseInt(headerMatch[3], 10);
    const lineCount = headerMatch[4] ? parseInt(headerMatch[4], 10) : 1;

    // Parse commit details (following lines until we hit the content line starting with \t)
    let authorName = '';
    let authorTime = 0;
    i++;

    while (i < lines.length && !lines[i].startsWith('\t')) {
      const line = lines[i];
      if (line.startsWith('author ')) {
        authorName = line.slice('author '.length);
      } else if (line.startsWith('author-time ')) {
        authorTime = parseInt(line.slice('author-time '.length), 10);
      }
      i++;
    }

    // Skip the content line (starts with \t)
    if (i < lines.length && lines[i].startsWith('\t')) {
      i++;
    }

    // Use cached info if this commit appeared before but details were abbreviated
    if (!authorName && commitCache.has(hash)) {
      const cached = commitCache.get(hash)!;
      authorName = cached.authorName;
      authorTime = Math.floor(cached.timestamp.getTime() / 1000);
    }

    const timestamp = new Date(authorTime * 1000);

    // Cache for future abbreviated references
    if (authorName && !commitCache.has(hash)) {
      commitCache.set(hash, { authorName, timestamp });
    }

    const ageDays = Math.floor((now - timestamp.getTime()) / MS_PER_DAY);

    ranges.push({
      hash,
      authorName,
      timestamp,
      startLine: finalLine,
      lineCount,
      ageDays,
    });
  }

  return mergeAdjacentRanges(ranges);
}

/**
 * Merge adjacent blame ranges from the same commit.
 * git blame --porcelain outputs one entry per line-group, but adjacent
 * single lines from the same commit should be consolidated.
 */
function mergeAdjacentRanges(ranges: BlameRange[]): BlameRange[] {
  if (ranges.length === 0) return [];

  const merged: BlameRange[] = [ranges[0]];

  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = ranges[i];

    if (
      curr.hash === prev.hash &&
      curr.startLine === prev.startLine + prev.lineCount
    ) {
      // Extend the previous range
      prev.lineCount += curr.lineCount;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}
