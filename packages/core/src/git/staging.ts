import type { ChangedFile } from '../types/index.js';
import { execGitStrict } from './executor.js';

/**
 * Stage specific files for commit.
 *
 * @param cwd - Repository working directory
 * @param files - Files to stage (by path)
 */
export async function stageFiles(cwd: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await execGitStrict({ cwd, args: ['add', '--', ...files] });
}

/**
 * Stage all changed files (equivalent to `git add -A`).
 */
export async function stageAll(cwd: string): Promise<void> {
  await execGitStrict({ cwd, args: ['add', '-A'] });
}

/**
 * Unstage specific files (move from staged back to working tree).
 */
export async function unstageFiles(cwd: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await execGitStrict({ cwd, args: ['restore', '--staged', '--', ...files] });
}

/**
 * Create a commit with the given message.
 *
 * @param cwd - Repository working directory
 * @param message - Commit message
 * @returns The commit hash of the new commit
 */
export async function createCommit(cwd: string, message: string): Promise<string> {
  await execGitStrict({ cwd, args: ['commit', '-m', message] });
  const hash = await execGitStrict({ cwd, args: ['rev-parse', 'HEAD'] });
  return hash.trim();
}

/**
 * Get a diff summary for the given files (or all staged changes).
 * Used to provide context to the model for commit message generation.
 *
 * @param cwd - Repository working directory
 * @param staged - If true, show staged changes. If false, show unstaged.
 * @param files - Optional: limit to specific files
 */
export async function getDiffSummary(
  cwd: string,
  staged: boolean,
  files?: string[],
): Promise<string> {
  const args = ['diff', '--stat'];
  if (staged) args.push('--cached');
  if (files && files.length > 0) args.push('--', ...files);

  return execGitStrict({ cwd, args });
}

/**
 * Get the full diff for staged changes.
 * Provides detailed context for commit message generation.
 *
 * @param cwd - Repository working directory
 * @param maxLines - Truncate output after this many lines (for large diffs)
 */
export async function getStagedDiff(cwd: string, maxLines?: number): Promise<string> {
  const output = await execGitStrict({ cwd, args: ['diff', '--cached'] });

  if (maxLines && output.split('\n').length > maxLines) {
    const lines = output.split('\n').slice(0, maxLines);
    lines.push(`\n... (truncated at ${String(maxLines)} lines)`);
    return lines.join('\n');
  }

  return output;
}

/**
 * Auto-stage changed files and return what was staged.
 *
 * Strategy:
 * 1. If specific files are provided, stage those
 * 2. Otherwise, stage all changed files
 * 3. Return the list of what was staged
 */
export async function autoStage(
  cwd: string,
  changedFiles: ChangedFile[],
  specificFiles?: string[],
): Promise<string[]> {
  const toStage = specificFiles ?? changedFiles.map((f) => f.filePath);

  if (toStage.length === 0) return [];

  await stageFiles(cwd, toStage);
  return toStage;
}
