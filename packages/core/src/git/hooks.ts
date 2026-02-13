import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HookCheckResult } from '../types/index.js';
import { execGitStrict } from './executor.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Standard git hooks we check for */
const KNOWN_HOOKS = ['pre-commit', 'commit-msg', 'prepare-commit-msg'] as const;

/** Timeout for hook dry-runs — hooks can be slow (linters, tests) */
const HOOK_TIMEOUT_MS = 60_000;

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Check which hooks are installed and optionally dry-run them.
 *
 * @param cwd - Repository root
 * @param dryRun - If true, attempt to execute hooks to detect failures before committing
 */
export async function checkHooks(
  cwd: string,
  dryRun: boolean,
): Promise<HookCheckResult[]> {
  const hooksDir = await getHooksDir(cwd);
  const results: HookCheckResult[] = [];

  for (const hookName of KNOWN_HOOKS) {
    const hookPath = join(hooksDir, hookName);
    const exists = existsSync(hookPath);

    const result: HookCheckResult = {
      hookName,
      exists,
    };

    if (exists && dryRun && hookName === 'pre-commit') {
      // Only dry-run pre-commit hooks — commit-msg needs a message file
      const dryRunResult = await runHookDryRun(cwd, hookPath);
      result.dryRunPassed = dryRunResult.passed;
      result.output = dryRunResult.output;
    }

    results.push(result);
  }

  return results;
}

/**
 * Get the hooks directory for the repo.
 * Respects core.hooksPath configuration.
 */
async function getHooksDir(cwd: string): Promise<string> {
  try {
    const configuredPath = await execGitStrict({
      cwd,
      args: ['config', '--get', 'core.hooksPath'],
    });
    const trimmed = configuredPath.trim();
    if (trimmed) return trimmed;
  } catch {
    // Not configured — use default
  }

  // Default: .git/hooks
  const gitDir = (
    await execGitStrict({ cwd, args: ['rev-parse', '--git-dir'] })
  ).trim();

  return join(cwd, gitDir, 'hooks');
}

/**
 * Attempt to run a hook script and capture the result.
 * Used for pre-commit dry-runs.
 */
async function runHookDryRun(
  cwd: string,
  hookPath: string,
): Promise<{ passed: boolean; output: string }> {
  const { execFile: execFileCb } = await import('node:child_process');

  return new Promise((resolve) => {
    execFileCb(
      hookPath,
      [],
      { cwd, timeout: HOOK_TIMEOUT_MS },
      (error, stdout, stderr) => {
        const output = `${String(stdout)}\n${String(stderr)}`.trim();
        resolve({
          passed: !error,
          output,
        });
      },
    );
  });
}
