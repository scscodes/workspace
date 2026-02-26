/**
 * Git Domain Handlers — one example per operation pattern.
 * Includes enhanced smartCommit with change grouping and batch commits.
 */
import { Handler, GitStatus, Logger, GitProvider } from "../../types";
import { SmartCommitParams, SmartCommitBatchResult, InboundChanges } from "./types";
import { ChangeGrouper, CommitMessageSuggester, BatchCommitter, InboundAnalyzer } from "./service";
/**
 * Example: git.status — Read-only operation.
 * Returns current branch and dirty state.
 */
export declare function createStatusHandler(gitProvider: GitProvider, logger: Logger): Handler<any, GitStatus>;
/**
 * Example: git.pull — Mutation operation.
 * Demonstrates error handling for conflicts, network issues.
 */
export declare function createPullHandler(gitProvider: GitProvider, logger: Logger): Handler<any, void>;
/**
 * Example: git.commit — Mutation with message parameter.
 * Demonstrates parameter validation.
 */
export declare function createCommitHandler(gitProvider: GitProvider, logger: Logger): Handler<any, void>;
/**
 * Example: git.smartCommit — Interactive staged commit with validation.
 * Demonstrates complex workflow: stage → diff → validate message → commit.
 */
export declare function createSmartCommitHandler(gitProvider: GitProvider, logger: Logger, changeGrouper: ChangeGrouper, messageSuggester: CommitMessageSuggester, batchCommitter: BatchCommitter): Handler<SmartCommitParams, SmartCommitBatchResult>;
/**
 * Example: git.analyzeInbound — Analyze remote changes without pulling.
 * Detects conflicts between local and remote modifications.
 */
export declare function createAnalyzeInboundHandler(inboundAnalyzer: InboundAnalyzer, logger: Logger): Handler<any, InboundChanges>;
//# sourceMappingURL=handlers.d.ts.map