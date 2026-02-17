import type {
  ToolId,
  ScanOptions,
  Finding,
  BranchComparison,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { getRepoRoot } from '../../git/executor.js';
import {
  getCurrentBranch,
  getTrackingBranch,
  getAheadBehind,
  fetchRemote,
  getRemoteDiff,
  getRemoteDiffSummary,
  getRemoteLog,
} from '../../git/branch.js';
import { getLog } from '../../git/log.js';
import { TOOL_MAX_DIFF_LINES } from '../../settings/defaults.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_DIFF_LINES = TOOL_MAX_DIFF_LINES;

/** Default: fetch before comparing */
const DEFAULT_FETCH = true;

/** Default remote name */
const DEFAULT_REMOTE = 'origin';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Dependencies injected into the BranchDiffTool.
 */
export interface BranchDiffToolDeps {
  /** Working directory (repo root) */
  cwd: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Branch Diff tool.
 *
 * Compares the current local branch against its remote tracking branch.
 *
 * Flow:
 * 1. Optionally fetch remote to get latest state
 * 2. Determine current branch and tracking info
 * 3. Compute ahead/behind counts
 * 4. Get incoming/outgoing commit logs
 * 5. Get diff summary
 * 6. Return BranchComparison as findings with metadata
 */
export class BranchDiffTool extends BaseTool {
  readonly id: ToolId = 'branch-diff';
  readonly name = 'Branch Diff';
  readonly description = 'Compare local branch against its remote tracking branch.';

  private deps: BranchDiffToolDeps | undefined;

  /**
   * Set dependencies. Must be called before execute().
   */
  setDeps(deps: BranchDiffToolDeps): void {
    this.deps = deps;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('BranchDiffTool: Dependencies not set. Call setDeps() before execute().');
    }

    const { cwd } = this.deps;
    const findings: Finding[] = [];

    const shouldFetch = (options.args?.fetch as boolean | undefined) ?? DEFAULT_FETCH;
    const remote = (options.args?.remote as string | undefined) ?? DEFAULT_REMOTE;

    // Phase 1: Fetch remote
    this.throwIfCancelled(options);
    const repoRoot = await getRepoRoot(cwd);

    if (shouldFetch) {
      try {
        await fetchRemote(repoRoot, remote);
      } catch (err: unknown) {
        findings.push(
          this.createFinding({
            title: 'Fetch warning',
            description: `Could not fetch from remote "${remote}": ${err instanceof Error ? err.message : String(err)}`,
            location: { filePath: repoRoot, startLine: 0, endLine: 0 },
            severity: 'warning',
          }),
        );
      }
    }

    // Phase 2: Current branch + tracking info
    this.throwIfCancelled(options);
    const localBranch = await getCurrentBranch(repoRoot);

    if (localBranch === 'HEAD') {
      findings.push(
        this.createFinding({
          title: 'Detached HEAD',
          description: 'Cannot compare branches in detached HEAD state.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'warning',
        }),
      );
      return findings;
    }

    const trackingBranch = await getTrackingBranch(repoRoot);

    if (!trackingBranch) {
      findings.push(
        this.createFinding({
          title: 'No upstream configured',
          description: `Branch "${localBranch}" has no remote tracking branch. Set one with: git push -u ${remote} ${localBranch}`,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    // Phase 3: Ahead/behind
    this.throwIfCancelled(options);
    const aheadBehind = await getAheadBehind(repoRoot);

    if (!aheadBehind) {
      findings.push(
        this.createFinding({
          title: 'Cannot determine ahead/behind',
          description: 'Failed to compute ahead/behind counts against upstream.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'warning',
        }),
      );
      return findings;
    }

    // Phase 4: Commit logs
    this.throwIfCancelled(options);
    const [incomingCommits, outgoingCommits] = await Promise.all([
      getRemoteLog(repoRoot, 'incoming'),
      getRemoteLog(repoRoot, 'outgoing'),
    ]);

    // Phase 5: Diff summary
    this.throwIfCancelled(options);
    const diffSummary = await getRemoteDiffSummary(repoRoot);
    let fullDiff = '';
    if (aheadBehind.behind > 0 || aheadBehind.ahead > 0) {
      fullDiff = await getRemoteDiff(repoRoot);
      // Truncate large diffs
      const diffLines = fullDiff.split('\n');
      if (diffLines.length > MAX_DIFF_LINES) {
        fullDiff = diffLines.slice(0, MAX_DIFF_LINES).join('\n') +
          `\n... (truncated at ${String(MAX_DIFF_LINES)} lines)`;
      }
    }

    // Phase 6: Build comparison result
    const comparison: BranchComparison = {
      localBranch,
      remoteBranch: trackingBranch,
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      incomingCommits,
      outgoingCommits,
      diffSummary,
    };

    // Status summary finding
    const statusParts: string[] = [];
    if (aheadBehind.ahead > 0) {
      statusParts.push(`${String(aheadBehind.ahead)} commit(s) ahead`);
    }
    if (aheadBehind.behind > 0) {
      statusParts.push(`${String(aheadBehind.behind)} commit(s) behind`);
    }
    if (statusParts.length === 0) {
      statusParts.push('up to date');
    }

    // Build more informative description
    let description = `Branch is ${statusParts.join(', ')} with remote.`;
    
    // Add context when up to date - show recent commits for context
    if (aheadBehind.ahead === 0 && aheadBehind.behind === 0) {
      // Get the most recent commit on this branch for context
      try {
        const recentCommits = await getLog({
          cwd: repoRoot,
          maxCount: 1,
          includeFiles: false,
        });
        if (recentCommits.length > 0) {
          const lastCommit = recentCommits[0];
          const dateStr = lastCommit.timestamp.toLocaleDateString();
          description += ` Last commit: "${lastCommit.subject}" (${dateStr}).`;
        }
      } catch {
        // Ignore errors getting log - not critical
      }
    }

    findings.push(
      this.createFinding({
        title: `${localBranch} vs ${trackingBranch}`,
        description,
        location: { filePath: repoRoot, startLine: 0, endLine: 0 },
        severity: 'info',
        metadata: {
          comparison,
          fullDiff,
        },
      }),
    );

    // Incoming commit findings
    for (const commit of incomingCommits) {
      findings.push(
        this.createFinding({
          title: `Incoming: ${commit.subject}`,
          description: `${commit.hash.slice(0, 8)} by ${commit.authorName} (${commit.timestamp.toISOString()})`,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
    }

    // Outgoing commit findings
    for (const commit of outgoingCommits) {
      findings.push(
        this.createFinding({
          title: `Outgoing: ${commit.subject}`,
          description: `${commit.hash.slice(0, 8)} by ${commit.authorName} (${commit.timestamp.toISOString()})`,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
    }

    return findings;
  }
}
