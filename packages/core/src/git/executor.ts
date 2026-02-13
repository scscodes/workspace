import { execFile as execFileCb } from 'node:child_process';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default timeout for git commands (ms) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Max output buffer size (bytes) — 10MB handles large repos */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitExecOptions {
  /** Working directory (typically the repo root) */
  cwd: string;
  /** Git subcommand and arguments (e.g. ['status', '--porcelain=v1']) */
  args: string[];
  /** Timeout in ms. Defaults to 30s. */
  timeout?: number;
  /** Environment variable overrides */
  env?: Record<string, string>;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ─── Execution ──────────────────────────────────────────────────────────────

/**
 * Execute a git command and return the result.
 *
 * Non-zero exit codes are returned (not thrown) — callers decide
 * whether a non-zero exit is an error for their use case.
 *
 * @throws Error if git is not installed, the command times out,
 *         or the process is killed by signal.
 */
export async function execGit(options: GitExecOptions): Promise<GitExecResult> {
  const { cwd, args, timeout = DEFAULT_TIMEOUT_MS, env } = options;

  return new Promise<GitExecResult>((resolve, reject) => {
    execFileCb(
      'git',
      args,
      {
        cwd,
        timeout,
        maxBuffer: MAX_BUFFER_BYTES,
        env: env ? { ...process.env, ...env } : undefined,
      },
      (error, stdout, stderr) => {
        // Process not found
        if (error && 'code' in error && error.code === 'ENOENT') {
          reject(new Error('Git is not installed or not in PATH.'));
          return;
        }

        // Timed out or killed
        if (error && 'killed' in error && error.killed) {
          reject(
            new Error(
              `Git command timed out after ${String(timeout)}ms: git ${args.join(' ')}`,
            ),
          );
          return;
        }

        // Normal completion (including non-zero exit)
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : 0;

        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          exitCode: error ? exitCode || 1 : 0,
        });
      },
    );
  });
}

/**
 * Convenience: execute a git command and throw if it exits non-zero.
 */
export async function execGitStrict(options: GitExecOptions): Promise<string> {
  const result = await execGit(options);
  if (result.exitCode !== 0) {
    throw new Error(
      `Git command failed (exit ${String(result.exitCode)}): git ${options.args.join(' ')}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

/**
 * Check if a directory is inside a git repository.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await execGit({
    cwd,
    args: ['rev-parse', '--is-inside-work-tree'],
  });
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

/**
 * Get the root directory of the git repository containing `cwd`.
 */
export async function getRepoRoot(cwd: string): Promise<string> {
  return (await execGitStrict({ cwd, args: ['rev-parse', '--show-toplevel'] })).trim();
}
