/**
 * Core type definitions for the DDD-based command router.
 * No external dependencies; explicit types, no magic.
 */

// ============================================================================
// Result Monad — Either<Error, Success>
// ============================================================================

export type Result<T> =
  | { kind: "ok"; value: T }
  | { kind: "err"; error: AppError };

export function success<T>(value: T): Result<T> {
  return { kind: "ok", value };
}

export function failure<T>(error: AppError): Result<T> {
  return { kind: "err", error };
}

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  context?: string;
}

// ============================================================================
// Command Routing & Handlers
// ============================================================================

export interface CommandContext {
  extensionPath: string;
  workspaceFolders: string[];
  activeFilePath?: string;
}

export interface Command<P = unknown> {
  name: CommandName;
  params: P;
}

// Discriminated union of all commands (extensible per domain)
export type CommandName =
  | GitCommandName
  | HygieneCommandName
  | ChatCommandName
  | WorkflowCommandName
  | AgentCommandName;

export type GitCommandName =
  | "git.status"
  | "git.pull"
  | "git.commit"
  | "git.smartCommit"
  | "git.analyzeInbound"
  | "git.showAnalytics"
  | "git.exportJson"
  | "git.exportCsv";
export type HygieneCommandName = "hygiene.scan" | "hygiene.cleanup" | "hygiene.showAnalytics";
export type ChatCommandName = "chat.context" | "chat.delegate";
export type WorkflowCommandName = "workflow.list" | "workflow.run";
export type AgentCommandName = "agent.list";

// ============================================================================
// Handler Interface (Aiogram-style Router Pattern)
// ============================================================================

export type Handler<P = unknown, R = unknown> = (
  ctx: CommandContext,
  params: P
) => Promise<Result<R>>;

export interface HandlerRegistry {
  [name: string]: Handler<any, any>;
}

export type DomainHandlers = {
  [K in CommandName]: Handler<any, any>;
};

// ============================================================================
// Domain Service Interface
// ============================================================================

export interface DomainService {
  name: string;
  handlers: Partial<HandlerRegistry>;
  initialize?(): Promise<Result<void>>;
  teardown?(): Promise<void>;
}

// ============================================================================
// Infrastructure Providers
// ============================================================================

export interface Logger {
  debug(message: string, context?: string, data?: unknown): void;
  info(message: string, context?: string, data?: unknown): void;
  warn(message: string, context?: string, error?: AppError): void;
  error(message: string, context?: string, error?: AppError): void;
}

export interface GitProvider {
  status(branch?: string): Promise<Result<GitStatus>>;
  pull(branch?: string): Promise<Result<GitPullResult>>;
  commit(message: string, branch?: string): Promise<Result<string>>; // Returns commit hash
  getChanges(): Promise<Result<GitStageChange[]>>;
  getDiff(paths?: string[]): Promise<Result<string>>;
  stage(paths: string[]): Promise<Result<void>>;
  reset(paths: string[] | { mode: string; ref: string }): Promise<Result<void>>;
  getAllChanges(): Promise<Result<GitFileChange[]>>; // Get staged + unstaged changes
  fetch(remote?: string): Promise<Result<void>>; // Fetch from remote without pulling
  getRemoteUrl(remote?: string): Promise<Result<string>>; // Get remote URL for generating diff links
  getCurrentBranch(): Promise<Result<string>>; // Get current branch name
  diff(revision: string, options?: string[]): Promise<Result<string>>; // Advanced diff with options
  getRecentCommits(count: number): Promise<Result<RecentCommit[]>>;
}

export interface WorkspaceProvider {
  findFiles(pattern: string): Promise<Result<string[]>>;
  readFile(path: string): Promise<Result<string>>;
  deleteFile(path: string): Promise<Result<void>>;
}

export interface ConfigProvider {
  get<T>(key: string, defaultValue?: T): T | undefined;
  set<T>(key: string, value: T): Promise<Result<void>>;
}

// ============================================================================
// Domain Models & Responses
// ============================================================================

export interface GitStatus {
  branch: string;
  isDirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface GitPullResult {
  success: boolean;
  branch: string;
  message: string;
}

export interface GitStageChange {
  path: string;
  status: "added" | "modified" | "deleted";
}

export interface GitFileChange {
  path: string;
  status: "A" | "M" | "D" | "R"; // Add, Modify, Delete, Rename
  additions: number;
  deletions: number;
}

export interface RecentCommit {
  shortHash: string;
  message: string;
  author: string;
  insertions: number;
  deletions: number;
}

export interface SmartCommitResult {
  success: boolean;
  commits: Array<{
    hash: string;
    message: string;
    files: string[];
  }>;
  totalFiles: number;
  totalGroups: number;
  message?: string;
}

export interface MarkdownFile {
  path: string;
  sizeBytes: number;
  lineCount: number;
}

export interface WorkspaceScan {
  deadFiles: string[];
  largeFiles: Array<{ path: string; sizeBytes: number }>;
  logFiles: string[];
  markdownFiles: MarkdownFile[];
}

export interface ChatContext {
  activeFile?: string;
  gitBranch?: string;
  gitStatus?: GitStatus;
}

// ============================================================================
// Cross-Cutting Concerns
// ============================================================================

export interface Permission {
  resource: string;
  action: "read" | "write" | "execute";
  allowed: boolean;
}

export interface MiddlewareContext {
  commandName: CommandName;
  userId?: string;
  startTime: number;
  permissions: Permission[];
}

export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

// ============================================================================
// Workflow Types
// ============================================================================

export interface WorkflowStep {
  id: string;
  command: CommandName;
  params: Record<string, unknown>;
  onSuccess?: string; // Next step id or "exit"
  onFailure?: string; // Next step id or "exit"
  conditions?: WorkflowCondition[];
}

export interface WorkflowCondition {
  type: "success" | "failure" | "output" | "env";
  key?: string; // For output/env conditions
  value?: unknown;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version?: string;
  steps: WorkflowStep[];
  triggers?: string[]; // Event names that trigger this workflow
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentDefinition {
  id: string;
  description?: string;
  version?: string;
  capabilities: CommandName[]; // Commands this agent can execute
  workflowTriggers?: string[]; // Workflows this agent can trigger
  metadata?: Record<string, unknown>;
}
