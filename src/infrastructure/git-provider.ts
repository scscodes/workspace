/**
 * Real GitProvider implementation using child_process.execFile (async).
 * All methods return Result<T> monad; errors are handled gracefully.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import {
  GitProvider,
  GitStatus,
  GitPullResult,
  GitStageChange,
  GitFileChange,
  RecentCommit,
  Result,
  success,
  failure,
  AppError,
} from "../types";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;

function gitError(op: string, err: unknown): AppError {
  const message =
    err instanceof Error ? err.message : String(err);
  return {
    code: "GIT_OPERATION_FAILED",
    message: `git ${op} failed: ${message}`,
    context: "GitProvider",
    details: err,
  };
}

async function git(
  args: string[],
  cwd: string
): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return success(stdout.trimEnd());
  } catch (err) {
    return failure(gitError(args[0] ?? "unknown", err));
  }
}

class RealGitProvider implements GitProvider {
  constructor(private readonly workspaceRoot: string) {}

  async status(_branch?: string): Promise<Result<GitStatus>> {
    const branchResult = await this.getCurrentBranch();
    if (branchResult.kind === "err") return branchResult;

    const porcelainResult = await git(
      ["status", "--porcelain=v1"],
      this.workspaceRoot
    );
    if (porcelainResult.kind === "err") return porcelainResult;

    const lines = porcelainResult.value
      .split("\n")
      .filter((l) => l.length > 0);

    let staged = 0;
    let unstaged = 0;
    let untracked = 0;

    for (const line of lines) {
      const x = line[0] ?? " "; // index (staged) status
      const y = line[1] ?? " "; // worktree (unstaged) status
      if (x === "?") {
        untracked++;
      } else {
        if (x !== " ") staged++;
        if (y !== " " && y !== "?") unstaged++;
      }
    }

    return success({
      branch: branchResult.value,
      isDirty: lines.length > 0,
      staged,
      unstaged,
      untracked,
    });
  }

  async pull(branch?: string): Promise<Result<GitPullResult>> {
    const targetBranch = branch ?? "HEAD";
    const result = await git(["pull"], this.workspaceRoot);
    if (result.kind === "err") return result;

    const branchResult = await this.getCurrentBranch();
    const resolvedBranch =
      branchResult.kind === "ok" ? branchResult.value : targetBranch;

    return success({
      success: true,
      branch: resolvedBranch,
      message: result.value || "Already up to date.",
    });
  }

  async commit(
    message: string,
    _branch?: string
  ): Promise<Result<string>> {
    const result = await git(
      ["commit", "-m", message],
      this.workspaceRoot
    );
    if (result.kind === "err") return result;

    // Parse the commit hash from the output line, e.g. "[main abc1234] message"
    const match = /\[.*? ([0-9a-f]+)\]/.exec(result.value);
    const hash = match?.[1] ?? result.value.split("\n")[0] ?? "";
    return success(hash);
  }

  async getChanges(): Promise<Result<GitStageChange[]>> {
    const result = await git(
      ["diff", "--cached", "--name-status"],
      this.workspaceRoot
    );
    if (result.kind === "err") return result;

    const changes: GitStageChange[] = [];
    for (const line of result.value.split("\n").filter(Boolean)) {
      const [code, ...rest] = line.split("\t");
      const filePath = rest.join("\t").trim();
      if (!filePath) continue;

      let status: GitStageChange["status"] = "modified";
      if (code === "A") status = "added";
      else if (code === "D") status = "deleted";

      changes.push({ path: filePath, status });
    }
    return success(changes);
  }

  async getDiff(paths?: string[]): Promise<Result<string>> {
    const args = ["diff", "--cached"];
    if (paths && paths.length > 0) {
      args.push("--", ...paths);
    }
    return git(args, this.workspaceRoot);
  }

  async stage(paths: string[]): Promise<Result<void>> {
    if (paths.length === 0) return success(undefined);
    const result = await git(["add", "--", ...paths], this.workspaceRoot);
    if (result.kind === "err") return result;
    return success(undefined);
  }

  async reset(
    paths: string[] | { mode: string; ref: string }
  ): Promise<Result<void>> {
    let args: string[];
    if (Array.isArray(paths)) {
      if (paths.length === 0) return success(undefined);
      args = ["reset", "HEAD", "--", ...paths];
    } else {
      args = ["reset", `--${paths.mode}`, paths.ref];
    }
    const result = await git(args, this.workspaceRoot);
    if (result.kind === "err") return result;
    return success(undefined);
  }

  async getAllChanges(): Promise<Result<GitFileChange[]>> {
    // --numstat gives: additions<TAB>deletions<TAB>path for each changed file
    const stagedResult = await git(
      ["diff", "--cached", "--numstat"],
      this.workspaceRoot
    );
    if (stagedResult.kind === "err") return stagedResult;

    const unstagedResult = await git(
      ["diff", "--numstat"],
      this.workspaceRoot
    );
    if (unstagedResult.kind === "err") return unstagedResult;

    // Also get status codes per file (staged + unstaged)
    const statusResult = await git(
      ["status", "--porcelain=v1"],
      this.workspaceRoot
    );
    if (statusResult.kind === "err") return statusResult;

    // Build a status map from porcelain output
    const statusMap = new Map<string, GitFileChange["status"]>();
    for (const line of statusResult.value.split("\n").filter(Boolean)) {
      const x = line[0] ?? " ";
      const y = line[1] ?? " ";
      const filePath = line.slice(3).trim().split(" -> ").pop() ?? "";
      const code = x !== " " ? x : y;
      let s: GitFileChange["status"] = "M";
      if (code === "A") s = "A";
      else if (code === "D") s = "D";
      else if (code === "R") s = "R";
      statusMap.set(filePath, s);
    }

    const changes = new Map<
      string,
      { path: string; status: GitFileChange["status"]; additions: number; deletions: number }
    >();

    const parseNumstat = (raw: string): void => {
      for (const line of raw.split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const additions = parseInt(parts[0] ?? "0", 10);
        const deletions = parseInt(parts[1] ?? "0", 10);
        const filePath = (parts[2] ?? "").trim();
        if (!filePath) continue;

        const existing = changes.get(filePath);
        if (existing) {
          existing.additions += isNaN(additions) ? 0 : additions;
          existing.deletions += isNaN(deletions) ? 0 : deletions;
        } else {
          changes.set(filePath, {
            path: filePath,
            status: statusMap.get(filePath) ?? "M",
            additions: isNaN(additions) ? 0 : additions,
            deletions: isNaN(deletions) ? 0 : deletions,
          });
        }
      }
    };

    parseNumstat(stagedResult.value);
    parseNumstat(unstagedResult.value);

    return success(Array.from(changes.values()));
  }

  async fetch(remote?: string): Promise<Result<void>> {
    const args = ["fetch", remote ?? "origin"];
    const result = await git(args, this.workspaceRoot);
    if (result.kind === "err") return result;
    return success(undefined);
  }

  async getRemoteUrl(remote?: string): Promise<Result<string>> {
    const result = await git(
      ["remote", "get-url", remote ?? "origin"],
      this.workspaceRoot
    );
    return result;
  }

  async getCurrentBranch(): Promise<Result<string>> {
    const result = await git(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      this.workspaceRoot
    );
    return result;
  }

  async diff(
    revision: string,
    options?: string[]
  ): Promise<Result<string>> {
    const args = ["diff", ...(options ?? []), revision];
    return git(args, this.workspaceRoot);
  }

  async getRecentCommits(count: number): Promise<Result<RecentCommit[]>> {
    // Get commit headers: shortHash|subject|author
    const logResult = await git(
      ["log", `-${count}`, "--pretty=format:%h|%s|%an", "--numstat"],
      this.workspaceRoot
    );
    if (logResult.kind === "err") return logResult;

    const commits: RecentCommit[] = [];
    let current: Partial<RecentCommit> | null = null;
    let ins = 0;
    let del = 0;

    for (const line of logResult.value.split("\n")) {
      if (!line.trim()) {
        // Blank line separates commits — save current if pending
        if (current?.shortHash) {
          commits.push({ ...current, insertions: ins, deletions: del } as RecentCommit);
          current = null;
          ins = 0;
          del = 0;
        }
        continue;
      }

      if (line.includes("|") && !line.match(/^\d+\t/)) {
        // Header line: shortHash|subject|author
        const parts = line.split("|");
        current = { shortHash: parts[0], message: parts[1], author: parts[2] };
        ins = 0;
        del = 0;
      } else if (current && line.match(/^\d+\t|^-\t/)) {
        // Numstat line: insertions\tdeletions\tpath
        const parts = line.split("\t");
        ins += parseInt(parts[0] ?? "0", 10) || 0;
        del += parseInt(parts[1] ?? "0", 10) || 0;
      }
    }
    // Flush last commit (no trailing blank line)
    if (current?.shortHash) {
      commits.push({ ...current, insertions: ins, deletions: del } as RecentCommit);
    }

    return success(commits);
  }
}

/**
 * Factory: creates a real GitProvider for the given workspace root.
 */
export function createGitProvider(workspaceRoot: string): GitProvider {
  return new RealGitProvider(workspaceRoot);
}
