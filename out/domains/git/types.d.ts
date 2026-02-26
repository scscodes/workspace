/**
 * Git Domain Types — Smart Commit Grouping, Batch Commits & Inbound Analysis
 */
/**
 * File change metadata extracted from git status/diff
 */
export interface FileChange {
    path: string;
    status: "A" | "M" | "D" | "R";
    domain: string;
    fileType: string;
    additions: number;
    deletions: number;
}
/**
 * Suggested commit message components
 */
export type CommitType = "feat" | "fix" | "chore" | "docs" | "refactor";
export interface SuggestedMessage {
    type: CommitType;
    scope: string;
    description: string;
    full: string;
}
/**
 * Grouped changes with suggested commit message and similarity score
 */
export interface ChangeGroup {
    id: string;
    files: FileChange[];
    suggestedMessage: SuggestedMessage;
    similarity: number;
}
/**
 * Commit tracking for rollback
 */
export interface CommitInfo {
    hash: string;
    message: string;
    files: string[];
    timestamp?: number;
}
/**
 * Result of smart commit operation
 */
export interface SmartCommitBatchResult {
    commits: CommitInfo[];
    totalFiles: number;
    totalGroups: number;
    duration?: number;
}
/**
 * Parameters for smartCommit command
 */
export interface SmartCommitParams {
    autoApprove?: boolean;
    branch?: string;
}
/**
 * Conflict file with status and severity
 */
export interface ConflictFile {
    path: string;
    localStatus: "M" | "D" | "A";
    remoteStatus: "M" | "D" | "A";
    severity: "high" | "medium" | "low";
    localChanges: number;
    remoteChanges: number;
}
/**
 * Summary of inbound changes with recommendations
 */
export interface ChangesSummary {
    description: string;
    conflicts: {
        high: number;
        medium: number;
        low: number;
    };
    fileTypes: Record<string, number>;
    recommendations: string[];
}
/**
 * Result of analyzing inbound changes from remote
 */
export interface InboundChanges {
    remote: string;
    branch: string;
    totalInbound: number;
    totalLocal: number;
    conflicts: ConflictFile[];
    summary: ChangesSummary;
    diffLink: string;
}
//# sourceMappingURL=types.d.ts.map