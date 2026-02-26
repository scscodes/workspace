/**
 * Git Domain Types — Smart Commit Grouping, Batch Commits & Inbound Analysis
 */

/**
 * File change metadata extracted from git status/diff
 */
export interface FileChange {
  path: string;
  status: "A" | "M" | "D" | "R"; // Add, Modify, Delete, Rename
  domain: string; // Extracted from path (e.g., "git", "infrastructure", "workflow")
  fileType: string; // File extension (e.g., ".ts", ".md", ".json")
  additions: number;
  deletions: number;
}

/**
 * Suggested commit message components
 */
export type CommitType = "feat" | "fix" | "chore" | "docs" | "refactor";

export interface SuggestedMessage {
  type: CommitType;
  scope: string; // Domain/module scope (e.g., "git", "infrastructure")
  description: string; // Human-readable description
  full: string; // Complete message: "type(scope): description"
}

/**
 * Grouped changes with suggested commit message and similarity score
 */
export interface ChangeGroup {
  id: string;
  files: FileChange[];
  suggestedMessage: SuggestedMessage;
  similarity: number; // 0-1, confidence in grouping
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
  autoApprove?: boolean; // Skip user approval UI
  branch?: string;
}

// ============================================================================
// Inbound Changes Analysis Types
// ============================================================================

/**
 * Conflict file with status and severity
 */
export interface ConflictFile {
  path: string;
  localStatus: "M" | "D" | "A"; // What we did
  remoteStatus: "M" | "D" | "A"; // What remote did
  severity: "high" | "medium" | "low";
  localChanges: number; // Our additions/deletions
  remoteChanges: number; // Their additions/deletions
}

/**
 * Summary of inbound changes with recommendations
 */
export interface ChangesSummary {
  description: string; // "3 conflicts in 8 inbound changes"
  conflicts: {
    high: number;
    medium: number;
    low: number;
  };
  fileTypes: Record<string, number>; // ".ts": 5, ".md": 2
  recommendations: string[]; // ["Review conflict in git-provider.ts", ...]
}

/**
 * Result of analyzing inbound changes from remote
 */
export interface InboundChanges {
  remote: string; // "origin"
  branch: string; // "main"
  totalInbound: number; // Files changed remotely
  totalLocal: number; // Files changed locally
  conflicts: ConflictFile[]; // Overlapping changes
  summary: ChangesSummary;
  diffLink: string; // Clickable link to view diff
}
