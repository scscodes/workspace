import type { ChangedFile } from '../types/index.js';
import { execGitStrict } from './executor.js';

// ─── Porcelain v1 Status Codes ──────────────────────────────────────────────
// Format: XY PATH (or XY ORIG -> PATH for renames)
// X = staging status, Y = working tree status
//
// Key combinations:
//   '??' → untracked
//   '!!' → ignored (we skip these)
//   ' M' → modified in working tree only
//   'M ' → modified and staged
//   'MM' → staged + further working tree modifications
//   'A ' → added (new, staged)
//   'AM' → added + modified since staging
//   'D ' → deleted (staged)
//   ' D' → deleted in working tree only
//   'R ' → renamed (staged)
//   'RM' → renamed + modified since staging

/** Map git status codes to our ChangedFile status */
function parseFileStatus(x: string, y: string): ChangedFile['status'] {
  if (x === '?' && y === '?') return 'untracked';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'R') return 'renamed';
  return 'modified';
}

/** Determine if the file has staged changes based on the X column */
function isStaged(x: string): boolean {
  // If X is not ' ' and not '?', the file has staged changes
  return x !== ' ' && x !== '?';
}

/**
 * Get all changed files in the working tree.
 *
 * @param cwd - Repository working directory
 * @returns Array of changed files with status and staging info
 */
export async function getChangedFiles(cwd: string): Promise<ChangedFile[]> {
  const output = await execGitStrict({
    cwd,
    args: ['status', '--porcelain=v1'],
  });

  if (!output.trim()) return [];

  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => parsePorcelainLine(line))
    .filter((f): f is ChangedFile => f !== null);
}

/**
 * Get only staged files.
 */
export async function getStagedFiles(cwd: string): Promise<ChangedFile[]> {
  const all = await getChangedFiles(cwd);
  return all.filter((f) => f.staged);
}

/**
 * Get only unstaged/untracked files.
 */
export async function getUnstagedFiles(cwd: string): Promise<ChangedFile[]> {
  const all = await getChangedFiles(cwd);
  return all.filter((f) => !f.staged);
}

/**
 * Parse a single line of `git status --porcelain=v1` output.
 *
 * @internal Exported for testing.
 */
export function parsePorcelainLine(line: string): ChangedFile | null {
  if (line.length < 4) return null; // Minimum: "XY f" (2 status + space + 1 char path)

  const x = line[0];
  const y = line[1];
  // Skip ignored files
  if (x === '!' && y === '!') return null;

  // Path starts at position 3. Renames have "ORIG -> NEW" format.
  let filePath = line.slice(3);

  // Handle renames: "R  old_name -> new_name"
  const renameArrow = ' -> ';
  if (x === 'R' && filePath.includes(renameArrow)) {
    filePath = filePath.split(renameArrow).pop() ?? filePath;
  }

  return {
    filePath,
    status: parseFileStatus(x, y),
    staged: isStaged(x),
  };
}
