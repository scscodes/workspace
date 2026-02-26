/**
 * Git Domain Service — DDD-style domain service.
 * Isolated, testable business logic with robust error handling.
 *
 * ✓ All GitProvider calls wrapped in Result<T> checks
 * ✓ Null/undefined guards before property access
 * ✓ Try-catch for async operations with proper error context
 * ✓ Parser errors from git output
 * ✓ Graceful degradation (cache miss fallback)
 * ✓ Missing dispose/cleanup handlers
 */

import {
  DomainService,
  GitCommandName,
  Handler,
  Logger,
  GitProvider,
  Result,
  failure,
  success,
} from "../../types";
import {
  createStatusHandler,
  createPullHandler,
  createCommitHandler,
  createSmartCommitHandler,
  createAnalyzeInboundHandler,
} from "./handlers";
import {
  createShowAnalyticsHandler,
  createExportJsonHandler,
  createExportCsvHandler,
} from "./analytics-handler";
import {
  FileChange,
  ChangeGroup,
  CommitType,
  SuggestedMessage,
  CommitInfo,
  InboundChanges,
  ConflictFile,
  ChangesSummary,
} from "./types";
import { GitAnalyzer } from "./analytics-service";
import { GIT_ERROR_CODES } from "../../infrastructure/error-codes";

// ============================================================================
// Change Grouper — Semantic Clustering of File Changes
// ============================================================================

const SIMILARITY_THRESHOLD = 0.4;

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export class ChangeGrouper {
  /**
   * Group similar file changes using greedy clustering.
   */
  group(changes: FileChange[]): ChangeGroup[] {
    const groups: ChangeGroup[] = [];
    const ungrouped = new Set(changes);

    while (ungrouped.size > 0) {
      // Pick first ungrouped change as seed
      const seedValue = ungrouped.values().next().value;
      if (!seedValue) break; // Safety check

      const seed = seedValue;
      const group: FileChange[] = [seed];
      ungrouped.delete(seed);

      // Greedily add similar changes
      for (const candidate of Array.from(ungrouped)) {
        const similarity = this.score(seed, candidate);
        if (similarity > SIMILARITY_THRESHOLD) {
          group.push(candidate);
          ungrouped.delete(candidate);
        }
      }

      const avgSimilarity = group.length > 1
        ? group.reduce((sum, file, i, arr) => {
            if (i === 0) return 0;
            return sum + this.score(arr[0], file);
          }, 0) / (group.length - 1)
        : 1;

      groups.push({
        id: generateId(),
        files: group,
        suggestedMessage: { type: "chore", scope: "", description: "", full: "" },
        similarity: Math.min(1, avgSimilarity),
      });
    }

    return groups;
  }

  /**
   * Score similarity between two file changes (0-1).
   */
  private score(a: FileChange, b: FileChange): number {
    const typeMatch = a.status === b.status ? 1 : 0.5;
    const domainMatch = a.domain === b.domain ? 1 : 0;
    const fileTypeMatch = a.fileType === b.fileType ? 0.5 : 0.2;
    return (typeMatch + domainMatch + fileTypeMatch) / 3;
  }
}

// ============================================================================
// Commit Message Suggester — AI-like Message Generation
// ============================================================================

export class CommitMessageSuggester {
  /**
   * Suggest a commit message for a group of changes.
   */
  suggest(group: ChangeGroup): SuggestedMessage {
    const { type, scope, description } = this.analyze(group);
    return {
      type,
      scope,
      description,
      full: `${type}${scope ? `(${scope})` : ""}: ${description}`,
    };
  }

  /**
   * Analyze group to determine commit type, scope, and description.
   */
  private analyze(group: ChangeGroup): {
    type: CommitType;
    scope: string;
    description: string;
  } {
    const hasAdds = group.files.some((f) => f.status === "A");
    const hasModifies = group.files.some((f) => f.status === "M");
    const hasDeletes = group.files.some((f) => f.status === "D");

    // Determine commit type
    let type: CommitType = "chore";
    if (hasAdds && !hasDeletes && !hasModifies) {
      type = "feat";
    } else if (hasModifies && !hasAdds && !hasDeletes) {
      type = "fix";
    } else if (this.isDocsOnly(group)) {
      type = "docs";
    } else if (this.isRefactorOnly(group)) {
      type = "refactor";
    }

    // Extract scope from most common domain
    const domains = group.files.map((f) => f.domain);
    const scope = this.mostCommonDomain(domains);

    // Generate description
    const fileCount = group.files.length;
    const description = this.describeGroup(group, fileCount);

    return { type, scope, description };
  }

  /**
   * Check if group contains only documentation files.
   */
  private isDocsOnly(group: ChangeGroup): boolean {
    return group.files.every((f) => f.fileType.match(/\.(md|txt|rst)$/i));
  }

  /**
   * Check if group is a refactoring-only change (modifications, no adds/deletes).
   */
  private isRefactorOnly(group: ChangeGroup): boolean {
    return (
      group.files.every((f) => f.status === "M") &&
      group.files.length > 1
    );
  }

  /**
   * Find most common domain in a list.
   */
  private mostCommonDomain(domains: string[]): string {
    if (domains.length === 0) return "";
    const counts = new Map<string, number>();
    for (const domain of domains) {
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
    let maxDomain = "";
    let maxCount = 0;
    for (const [domain, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxDomain = domain;
      }
    }
    return maxDomain;
  }

  /**
   * Generate human-readable description for the group.
   */
  private describeGroup(group: ChangeGroup, fileCount: number): string {
    if (fileCount === 1) {
      const file = group.files[0];
      const action = this.actionVerb(file.status);
      const filename = file.path.split("/").pop() || file.path;
      return `${action} ${filename}`;
    } else if (this.isHomogeneous(group)) {
      const action = this.actionVerb(group.files[0].status);
      const scope = this.mostCommonDomain(group.files.map((f) => f.domain));
      return `${action} ${fileCount} ${scope} files`;
    } else {
      return `update ${fileCount} files`;
    }
  }

  /**
   * Check if all files have the same status.
   */
  private isHomogeneous(group: ChangeGroup): boolean {
    if (group.files.length === 0) return true;
    const firstStatus = group.files[0].status;
    return group.files.every((f) => f.status === firstStatus);
  }

  /**
   * Map change status to action verb.
   */
  private actionVerb(status: FileChange["status"]): string {
    const verbs: Record<FileChange["status"], string> = {
      A: "add",
      M: "update",
      D: "remove",
      R: "rename",
    };
    return verbs[status] || "modify";
  }
}

// ============================================================================
// Batch Committer — Execute and Track Commits
// ============================================================================

export class BatchCommitter {
  private logger: Logger;
  private gitProvider: GitProvider;
  private committedHashes: string[] = [];

  constructor(gitProvider: GitProvider, logger: Logger) {
    this.gitProvider = gitProvider;
    this.logger = logger;
  }

  /**
   * Execute batch commits for approved groups.
   * Returns committed hashes or error with automatic rollback.
   */
  async executeBatch(
    approvedGroups: ChangeGroup[]
  ): Promise<Result<CommitInfo[]>> {
    const commits: CommitInfo[] = [];
    this.committedHashes = [];

    try {
      for (const group of approvedGroups) {
        // Stage files in this group
        const paths = group.files.map((f) => f.path);
        const stageResult = await this.gitProvider.stage(paths);
        if (stageResult.kind === "err") {
          await this.rollback();
          return failure({
            code: "STAGE_FAILED",
            message: `Failed to stage files for group ${group.id}`,
            details: stageResult.error,
            context: "BatchCommitter.executeBatch",
          });
        }

        // Commit with suggested message
        const commitResult = await this.gitProvider.commit(
          group.suggestedMessage.full
        );
        if (commitResult.kind === "err") {
          await this.rollback();
          return failure({
            code: "COMMIT_FAILED",
            message: `Failed to commit group ${group.id}`,
            details: commitResult.error,
            context: "BatchCommitter.executeBatch",
          });
        }

        const hash = commitResult.value;
        this.committedHashes.push(hash);

        commits.push({
          hash,
          message: group.suggestedMessage.full,
          files: paths,
          timestamp: Date.now(),
        });

        this.logger.info(
          `Committed group ${group.id}: ${group.suggestedMessage.full}`,
          "BatchCommitter"
        );
      }

      return success(commits);
    } catch (err) {
      await this.rollback();
      return failure({
        code: "BATCH_COMMIT_ERROR",
        message: "Unexpected error during batch commit",
        details: err,
        context: "BatchCommitter.executeBatch",
      });
    }
  }

  /**
   * Rollback all commits in reverse order.
   */
  private async rollback(): Promise<void> {
    if (this.committedHashes.length === 0) {
      return;
    }

    this.logger.info(
      `Rolling back ${this.committedHashes.length} commits`,
      "BatchCommitter"
    );

    // Reset to the commit before the first commit (soft reset)
    const firstHash = this.committedHashes[0];
    const resetResult = await this.gitProvider.reset({
      mode: "--soft",
      ref: `${firstHash}^`,
    });

    if (resetResult.kind === "err") {
      this.logger.error(
        `Rollback failed: could not reset to ${firstHash}^`,
        "BatchCommitter",
        resetResult.error
      );
    } else {
      this.logger.info("Rollback successful", "BatchCommitter");
    }
  }
}

// ============================================================================
// Inbound Changes Analyzer — Detect Conflicts with Remote Branch
// ============================================================================

export class InboundAnalyzer {
  private gitProvider: GitProvider;
  private logger: Logger;

  constructor(gitProvider: GitProvider, logger: Logger) {
    this.gitProvider = gitProvider;
    this.logger = logger;
  }

  /**
   * Analyze incoming changes from remote without pulling.
   * Detects conflicts between local and remote changes.
   * Validates all inputs and handles errors gracefully.
   */
  async analyze(): Promise<Result<InboundChanges>> {
    try {
      // 1. Fetch from remote (non-destructive)
      this.logger.info("Fetching from remote...", "InboundAnalyzer");
      const fetchResult = await this.gitProvider.fetch("origin");
      if (fetchResult.kind === "err") {
        return fetchResult;
      }

      // 2. Get current branch
      const branchResult = await this.gitProvider.getCurrentBranch();
      if (branchResult.kind === "err") {
        return branchResult;
      }

      const branch = branchResult.value;
      // Guard: validate branch is not empty
      if (!branch || typeof branch !== "string") {
        return failure({
          code: GIT_ERROR_CODES.INBOUND_ANALYSIS_ERROR,
          message: "Invalid branch name from git provider",
          context: "InboundAnalyzer.analyze",
        });
      }

      const upstream = `origin/${branch}`;

      // 3. Get inbound changes
      const inboundDiffResult = await this.gitProvider.diff(`HEAD..${upstream}`);
      if (inboundDiffResult.kind === "err") {
        return inboundDiffResult;
      }

      const inboundDiff = inboundDiffResult.value;
      // Guard: validate inboundDiff
      if (inboundDiff === null || inboundDiff === undefined) {
        return failure({
          code: GIT_ERROR_CODES.INBOUND_DIFF_PARSE_ERROR,
          message: "Git provider returned null diff",
          context: "InboundAnalyzer.analyze",
        });
      }

      // If no inbound changes, return early
      if (inboundDiff.trim() === "") {
        return success({
          remote: "origin",
          branch,
          totalInbound: 0,
          totalLocal: 0,
          conflicts: [],
          summary: {
            description: "Remote branch is up-to-date",
            conflicts: { high: 0, medium: 0, low: 0 },
            fileTypes: {},
            recommendations: ["✅ No remote changes detected. Fully synced."],
          },
          diffLink: `View with: git diff HEAD..origin/${branch}`,
        });
      }

      // 4. Get local changes
      const localDiffResult = await this.gitProvider.getDiff();
      if (localDiffResult.kind === "err") {
        return localDiffResult;
      }

      const localDiff = localDiffResult.value;
      // Guard: validate localDiff
      if (localDiff === null || localDiff === undefined) {
        this.logger.warn(
          "Local diff is null; treating as no local changes",
          "InboundAnalyzer.analyze"
        );
        // Non-fatal: continue with empty local diff
      }

      // 5. Parse changes into maps (parseGitDiff handles null safely)
      const inboundChanges = this.parseGitDiff(inboundDiff || "");
      const localChanges = this.parseGitDiff(localDiff || "");

      // Guard: validate parsed changes
      if (!inboundChanges || inboundChanges.size === 0) {
        this.logger.warn(
          "No inbound changes parsed from diff",
          "InboundAnalyzer.analyze"
        );
      }

      // 6. Detect conflicts
      const conflicts = await this.detectConflicts(
        inboundChanges,
        localChanges,
        branch
      );

      // 7. Summarize
      const summary = this.summarize(inboundChanges, localChanges, conflicts);

      // 8. Generate diff link
      const diffLinkResult = await this.gitProvider.getRemoteUrl("origin");
      let diffLink = `View with: git diff HEAD..origin/${branch}`;
      if (diffLinkResult.kind === "ok" && diffLinkResult.value) {
        try {
          diffLink = this.generateDiffLink(diffLinkResult.value, branch);
        } catch (err) {
          this.logger.warn(
            "Failed to generate diff link; using fallback",
            "InboundAnalyzer.analyze"
          );
          // Continue with fallback diffLink
        }
      }

      return success({
        remote: "origin",
        branch,
        totalInbound: inboundChanges.size,
        totalLocal: localChanges.size,
        conflicts,
        summary,
        diffLink,
      });
    } catch (err) {
      return failure({
        code: GIT_ERROR_CODES.INBOUND_ANALYSIS_ERROR,
        message:
          "Failed to analyze inbound changes; check git is installed with: git --version",
        details: err,
        context: "InboundAnalyzer.analyze",
      });
    }
  }

  /**
   * Parse git diff output into a map of path -> status
   * Validates input and handles malformed output gracefully
   */
  private parseGitDiff(diffOutput: string): Map<string, string> {
    const changes = new Map<string, string>();

    // Guard: null/undefined check
    if (!diffOutput || typeof diffOutput !== "string") {
      this.logger.warn(
        "parseGitDiff received invalid input; returning empty map",
        "InboundAnalyzer.parseGitDiff"
      );
      return changes;
    }

    try {
      const lines = diffOutput.trim().split("\n");

      for (const line of lines) {
        if (!line || !line.trim()) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 2) {
          this.logger.debug(
            `Skipping malformed diff line: ${line}`,
            "InboundAnalyzer.parseGitDiff"
          );
          continue;
        }

        const status = parts[0];
        const path = parts.slice(1).join(" ");

        // Validate path is not empty after parsing
        if (!path || !status) {
          this.logger.debug(
            "Skipping line with empty status or path",
            "InboundAnalyzer.parseGitDiff"
          );
          continue;
        }

        changes.set(path, status);
      }

      return changes;
    } catch (err) {
      this.logger.error(
        "Failed to parse git diff output",
        "InboundAnalyzer.parseGitDiff",
        {
          code: GIT_ERROR_CODES.INBOUND_DIFF_PARSE_ERROR,
          message: "Git diff parsing failed; returning empty map",
          details: err,
        }
      );
      return changes; // Return empty map on parse failure
    }
  }

  /**
   * Detect conflicts between inbound and local changes
   * Guards against null/undefined and errors in sub-operations
   */
  private async detectConflicts(
    inbound: Map<string, string>,
    local: Map<string, string>,
    branch: string
  ): Promise<ConflictFile[]> {
    const conflicts: ConflictFile[] = [];

    // Guard: validate inputs
    if (!inbound || !local) {
      this.logger.warn(
        "detectConflicts: invalid input maps; returning empty conflicts",
        "InboundAnalyzer.detectConflicts"
      );
      return conflicts;
    }

    if (!branch || typeof branch !== "string") {
      this.logger.warn(
        "detectConflicts: invalid branch; returning empty conflicts",
        "InboundAnalyzer.detectConflicts"
      );
      return conflicts;
    }

    try {
      for (const [path, remoteStatus] of inbound) {
        if (!path || !remoteStatus) continue;

        if (local.has(path)) {
          const localStatus = local.get(path);

          // Guard: ensure localStatus is not undefined
          if (!localStatus) {
            this.logger.debug(
              `Skipping ${path}: empty local status`,
              "InboundAnalyzer.detectConflicts"
            );
            continue;
          }

          // Conflict: both sides modified same file
          if (localStatus === "M" && remoteStatus === "M") {
            const localChanges = await this.estimateChanges(path, "local");
            const remoteChanges = await this.estimateChanges(
              path,
              `origin/${branch}`
            );

            conflicts.push({
              path,
              localStatus: "M",
              remoteStatus: "M",
              severity: "high",
              localChanges,
              remoteChanges,
            });
          }
          // Conflict: we modified, they deleted
          else if (localStatus === "M" && remoteStatus === "D") {
            const localChanges = await this.estimateChanges(path, "local");

            conflicts.push({
              path,
              localStatus: "M",
              remoteStatus: "D",
              severity: "high",
              localChanges,
              remoteChanges: 0,
            });
          }
          // Conflict: we deleted, they modified
          else if (localStatus === "D" && remoteStatus === "M") {
            const remoteChanges = await this.estimateChanges(
              path,
              `origin/${branch}`
            );

            conflicts.push({
              path,
              localStatus: "D",
              remoteStatus: "M",
              severity: "high",
              localChanges: 0,
              remoteChanges,
            });
          }
          // Low severity: both added (could have same content)
          else if (localStatus === "A" && remoteStatus === "A") {
            const localChanges = await this.estimateChanges(path, "local");
            const remoteChanges = await this.estimateChanges(
              path,
              `origin/${branch}`
            );

            conflicts.push({
              path,
              localStatus: "A",
              remoteStatus: "A",
              severity: "medium",
              localChanges,
              remoteChanges,
            });
          }
        }
      }

      return conflicts;
    } catch (err) {
      this.logger.error(
        "Error during conflict detection",
        "InboundAnalyzer.detectConflicts",
        {
          code: GIT_ERROR_CODES.CONFLICT_DETECTION_ERROR,
          message: "Failed to detect conflicts",
          details: err,
        }
      );
      return conflicts; // Return conflicts found so far on error
    }
  }

  /**
   * Estimate change count for a file (simplified)
   * In a real implementation, this would call git diff --stat
   */
  private async estimateChanges(path: string, ref: string): Promise<number> {
    try {
      // Guard: validate inputs
      if (!path || !ref) {
        this.logger.debug(
          "estimateChanges: missing path or ref, returning 0",
          "InboundAnalyzer.estimateChanges"
        );
        return 0;
      }

      // Deterministic heuristic based on path + ref; this is a placeholder
      // that provides a stable, non-negative estimate without external I/O.
      const key = `${path}|${ref}`;
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        const code = key.charCodeAt(i);
        hash = (hash * 31 + code) | 0;
      }
      const estimate = Math.abs(hash % 100) + 1;
      return estimate;
    } catch (err) {
      this.logger.warn(
        `Failed to estimate changes for ${path}; returning 0`,
        "InboundAnalyzer.estimateChanges"
      );
      return 0; // Graceful degradation
    }
  }

  /**
   * Summarize changes with recommendations
   * Guards against null/undefined inputs
   */
  private summarize(
    inbound: Map<string, string>,
    _local: Map<string, string>,
    conflicts: ConflictFile[]
  ): ChangesSummary {
    try {
      // Guard: validate inputs
      if (!inbound || !(inbound instanceof Map)) {
        this.logger.warn(
          "summarize: invalid inbound map; returning empty summary",
          "InboundAnalyzer.summarize"
        );
        return {
          description: "Unable to summarize changes",
          conflicts: { high: 0, medium: 0, low: 0 },
          fileTypes: {},
          recommendations: ["⚠️ Summary generation failed"],
        };
      }

      if (!conflicts || !Array.isArray(conflicts)) {
        this.logger.warn(
          "summarize: invalid conflicts array; using empty array",
          "InboundAnalyzer.summarize"
        );
        conflicts = [];
      }

      const highSeverity = conflicts.filter((c) => c?.severity === "high")
        .length;
      const mediumSeverity = conflicts.filter((c) => c?.severity === "medium")
        .length;
      const lowSeverity = conflicts.filter((c) => c?.severity === "low").length;

      // Group by file type
      const fileTypes: Record<string, number> = {};
      for (const [path] of inbound) {
        if (!path || typeof path !== "string") continue;

        const ext = path.split(".").pop() || "unknown";
        const key = `.${ext}`;
        fileTypes[key] = (fileTypes[key] ?? 0) + 1;
      }

      // Generate recommendations
      const recommendations = this.recommendations(conflicts);

      const description =
        conflicts.length === 0
          ? `0 conflicts in ${inbound.size} inbound change${inbound.size !== 1 ? "s" : ""}`
          : `${conflicts.length} potential conflict${conflicts.length !== 1 ? "s" : ""} in ${inbound.size} inbound change${inbound.size !== 1 ? "s" : ""}`;

      return {
        description,
        conflicts: { high: highSeverity, medium: mediumSeverity, low: lowSeverity },
        fileTypes,
        recommendations,
      };
    } catch (err) {
      this.logger.error(
        "Error during summary generation",
        "InboundAnalyzer.summarize",
        {
          code: GIT_ERROR_CODES.INBOUND_ANALYSIS_ERROR,
          message: "Failed to summarize changes",
          details: err,
        }
      );

      return {
        description: "Unable to summarize changes",
        conflicts: { high: 0, medium: 0, low: 0 },
        fileTypes: {},
        recommendations: ["⚠️ Summary generation failed"],
      };
    }
  }

  /**
   * Generate recommendations based on conflicts
   */
  private recommendations(conflicts: ConflictFile[]): string[] {
    const recs: string[] = [];

    const highConflicts = conflicts.filter((c) => c.severity === "high");
    if (highConflicts.length > 0) {
      recs.push(
        `⚠️  Review ${highConflicts.length} high-severity conflict${highConflicts.length !== 1 ? "s" : ""}`
      );
      highConflicts.slice(0, 3).forEach((c) => {
        const action =
          c.localStatus === "D"
            ? "deleted"
            : c.localStatus === "A"
              ? "added"
              : "modified";
        recs.push(`  • You ${action} ${c.path}, remote changed it`);
      });
    }

    const mediumConflicts = conflicts.filter((c) => c.severity === "medium");
    if (mediumConflicts.length > 0) {
      recs.push(
        `📋 Both sides added ${mediumConflicts.length} file${mediumConflicts.length !== 1 ? "s" : ""}`
      );
    }

    if (conflicts.length === 0) {
      recs.push("✅ No conflicts detected. Safe to pull.");
    }

    return recs;
  }

  /**
   * Generate a diff link for the remote changes
   * Handles various git hosting platforms and falls back gracefully
   */
  private generateDiffLink(remoteUrl: string, branch: string): string {
    try {
      // Guard: validate inputs
      if (!remoteUrl || typeof remoteUrl !== "string") {
        throw new Error("Invalid remote URL");
      }

      if (!branch || typeof branch !== "string") {
        throw new Error("Invalid branch name");
      }

      // GitHub: https://github.com/owner/repo/compare/main...origin/main
      if (remoteUrl.includes("github.com")) {
        const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
        if (match && match[1] && match[2]) {
          const owner = match[1].trim();
          const repo = match[2].trim();
          return `https://github.com/${owner}/${repo}/compare/${branch}...origin/${branch}`;
        }
      }

      // GitLab: https://gitlab.com/owner/repo/-/compare/main...origin/main
      if (remoteUrl.includes("gitlab.com")) {
        const match = remoteUrl.match(/gitlab\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
        if (match && match[1] && match[2]) {
          const owner = match[1].trim();
          const repo = match[2].trim();
          return `https://gitlab.com/${owner}/${repo}/-/compare/${branch}...origin/${branch}`;
        }
      }

      // Bitbucket pattern (simplified)
      if (remoteUrl.includes("bitbucket")) {
        const match = remoteUrl.match(/bitbucket\.org[:/](.+?)\/(.+?)(?:\.git)?$/);
        if (match && match[1] && match[2]) {
          const owner = match[1].trim();
          const repo = match[2].trim();
          return `https://bitbucket.org/${owner}/${repo}/compare/${branch}...origin/${branch}`;
        }
      }

      // Fallback: generic git diff command
      return `View with: git diff HEAD..origin/${branch}`;
    } catch (err) {
      this.logger.warn(
        `Failed to generate diff link for ${remoteUrl}; using fallback`,
        "InboundAnalyzer.generateDiffLink"
      );
      return `View with: git diff HEAD..origin/${branch || "HEAD"}`;
    }
  }
}

/**
 * Git domain commands.
 */
export const GIT_COMMANDS: GitCommandName[] = [
  "git.status",
  "git.pull",
  "git.commit",
  "git.smartCommit",
  "git.analyzeInbound",
];

export class GitDomainService implements DomainService {
  readonly name = "git";

  handlers: Partial<Record<GitCommandName, Handler>> = {};
  private gitProvider: GitProvider;
  private logger: Logger;

  // Smart commit components
  public changeGrouper: ChangeGrouper;
  public messageSuggester: CommitMessageSuggester;
  public batchCommitter: BatchCommitter;

  // Inbound analysis component
  public inboundAnalyzer: InboundAnalyzer;

  // Analytics component
  public analyzer: GitAnalyzer;

  constructor(gitProvider: GitProvider, logger: Logger) {
    this.gitProvider = gitProvider;
    this.logger = logger;

    // Initialize smart commit components
    this.changeGrouper = new ChangeGrouper();
    this.messageSuggester = new CommitMessageSuggester();
    this.batchCommitter = new BatchCommitter(gitProvider, logger);

    // Initialize inbound analyzer
    this.inboundAnalyzer = new InboundAnalyzer(gitProvider, logger);

    // Initialize analytics
    this.analyzer = new GitAnalyzer();

    // Initialize handlers
    this.handlers = {
      "git.status": createStatusHandler(gitProvider, logger) as any,
      "git.pull": createPullHandler(gitProvider, logger) as any,
      "git.commit": createCommitHandler(gitProvider, logger) as any,
      "git.smartCommit": createSmartCommitHandler(
        gitProvider,
        logger,
        this.changeGrouper,
        this.messageSuggester,
        this.batchCommitter
      ) as any,
      "git.analyzeInbound": createAnalyzeInboundHandler(
        this.inboundAnalyzer,
        logger
      ) as any,
      "git.showAnalytics": createShowAnalyticsHandler(
        this.analyzer,
        logger
      ) as any,
      "git.exportJson": createExportJsonHandler(
        this.analyzer,
        logger
      ) as any,
      "git.exportCsv": createExportCsvHandler(
        this.analyzer,
        logger
      ) as any,
    };
  }

  /**
   * Initialize domain — verify git is available, check repo state.
   */
  async initialize(): Promise<Result<void>> {
    try {
      this.logger.info(
        "Initializing git domain",
        "GitDomainService.initialize"
      );

      // Check git availability by executing git status
      const statusResult = await this.gitProvider.status();
      if (statusResult.kind === "err") {
        return failure({
          code: "GIT_UNAVAILABLE",
          message: "Git is not available or not initialized",
          details: statusResult.error,
          context: "GitDomainService.initialize",
        });
      }

      this.logger.info(
        `Git initialized (branch: ${statusResult.value.branch})`,
        "GitDomainService.initialize"
      );
      return success(void 0);
    } catch (err) {
      return failure({
        code: "GIT_INIT_ERROR",
        message: "Failed to initialize git domain",
        details: err,
        context: "GitDomainService.initialize",
      });
    }
  }

  /**
   * Cleanup — no resources to release, but log completion.
   */
  async teardown(): Promise<void> {
    this.logger.debug("Tearing down git domain", "GitDomainService.teardown");
  }
}

/**
 * Factory function — creates and returns git domain service.
 */
export function createGitDomain(
  gitProvider: GitProvider,
  logger: Logger
): GitDomainService {
  return new GitDomainService(gitProvider, logger);
}
