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
import { DomainService, GitCommandName, Handler, Logger, GitProvider, Result } from "../../types";
import { FileChange, ChangeGroup, SuggestedMessage, CommitInfo, InboundChanges } from "./types";
import { GitAnalyzer } from "./analytics-service";
export declare class ChangeGrouper {
    /**
     * Group similar file changes using greedy clustering.
     */
    group(changes: FileChange[]): ChangeGroup[];
    /**
     * Score similarity between two file changes (0-1).
     */
    private score;
}
export declare class CommitMessageSuggester {
    /**
     * Suggest a commit message for a group of changes.
     */
    suggest(group: ChangeGroup): SuggestedMessage;
    /**
     * Analyze group to determine commit type, scope, and description.
     */
    private analyze;
    /**
     * Check if group contains only documentation files.
     */
    private isDocsOnly;
    /**
     * Check if group is a refactoring-only change (modifications, no adds/deletes).
     */
    private isRefactorOnly;
    /**
     * Find most common domain in a list.
     */
    private mostCommonDomain;
    /**
     * Generate human-readable description for the group.
     */
    private describeGroup;
    /**
     * Check if all files have the same status.
     */
    private isHomogeneous;
    /**
     * Map change status to action verb.
     */
    private actionVerb;
}
export declare class BatchCommitter {
    private logger;
    private gitProvider;
    private committedHashes;
    constructor(gitProvider: GitProvider, logger: Logger);
    /**
     * Execute batch commits for approved groups.
     * Returns committed hashes or error with automatic rollback.
     */
    executeBatch(approvedGroups: ChangeGroup[]): Promise<Result<CommitInfo[]>>;
    /**
     * Rollback all commits in reverse order.
     */
    private rollback;
}
export declare class InboundAnalyzer {
    private gitProvider;
    private logger;
    constructor(gitProvider: GitProvider, logger: Logger);
    /**
     * Analyze incoming changes from remote without pulling.
     * Detects conflicts between local and remote changes.
     * Validates all inputs and handles errors gracefully.
     */
    analyze(): Promise<Result<InboundChanges>>;
    /**
     * Parse git diff output into a map of path -> status
     * Validates input and handles malformed output gracefully
     */
    private parseGitDiff;
    /**
     * Detect conflicts between inbound and local changes
     * Guards against null/undefined and errors in sub-operations
     */
    private detectConflicts;
    /**
     * Estimate change count for a file (simplified)
     * In a real implementation, this would call git diff --stat
     */
    private estimateChanges;
    /**
     * Summarize changes with recommendations
     * Guards against null/undefined inputs
     */
    private summarize;
    /**
     * Generate recommendations based on conflicts
     */
    private recommendations;
    /**
     * Generate a diff link for the remote changes
     * Handles various git hosting platforms and falls back gracefully
     */
    private generateDiffLink;
}
/**
 * Git domain commands.
 */
export declare const GIT_COMMANDS: GitCommandName[];
export declare class GitDomainService implements DomainService {
    readonly name = "git";
    handlers: Partial<Record<GitCommandName, Handler>>;
    private gitProvider;
    private logger;
    changeGrouper: ChangeGrouper;
    messageSuggester: CommitMessageSuggester;
    batchCommitter: BatchCommitter;
    inboundAnalyzer: InboundAnalyzer;
    analyzer: GitAnalyzer;
    constructor(gitProvider: GitProvider, logger: Logger);
    /**
     * Initialize domain — verify git is available, check repo state.
     */
    initialize(): Promise<Result<void>>;
    /**
     * Cleanup — no resources to release, but log completion.
     */
    teardown(): Promise<void>;
}
/**
 * Factory function — creates and returns git domain service.
 */
export declare function createGitDomain(gitProvider: GitProvider, logger: Logger): GitDomainService;
//# sourceMappingURL=service.d.ts.map