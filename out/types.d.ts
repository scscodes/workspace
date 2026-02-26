/**
 * Core type definitions for the DDD-based command router.
 * No external dependencies; explicit types, no magic.
 */
export type Result<T> = {
    kind: "ok";
    value: T;
} | {
    kind: "err";
    error: AppError;
};
export declare function success<T>(value: T): Result<T>;
export declare function failure<T>(error: AppError): Result<T>;
export interface AppError {
    code: string;
    message: string;
    details?: unknown;
    context?: string;
}
export interface CommandContext {
    extensionPath: string;
    workspaceFolders: string[];
    activeFilePath?: string;
}
export interface Command<P = unknown> {
    name: CommandName;
    params: P;
}
export type CommandName = GitCommandName | HygieneCommandName | ChatCommandName | WorkflowCommandName | AgentCommandName;
export type GitCommandName = "git.status" | "git.pull" | "git.commit" | "git.smartCommit" | "git.analyzeInbound" | "git.showAnalytics" | "git.exportJson" | "git.exportCsv";
export type HygieneCommandName = "hygiene.scan" | "hygiene.cleanup";
export type ChatCommandName = "chat.context" | "chat.delegate";
export type WorkflowCommandName = "workflow.list" | "workflow.run";
export type AgentCommandName = "agent.list";
export type Handler<P = unknown, R = unknown> = (ctx: CommandContext, params: P) => Promise<Result<R>>;
export interface HandlerRegistry {
    [name: string]: Handler<any, any>;
}
export type DomainHandlers = {
    [K in CommandName]: Handler<any, any>;
};
export interface DomainService {
    name: string;
    handlers: Partial<HandlerRegistry>;
    initialize?(): Promise<Result<void>>;
    teardown?(): Promise<void>;
}
export interface Logger {
    debug(message: string, context?: string, data?: unknown): void;
    info(message: string, context?: string, data?: unknown): void;
    warn(message: string, context?: string, error?: AppError): void;
    error(message: string, context?: string, error?: AppError): void;
}
export interface GitProvider {
    status(branch?: string): Promise<Result<GitStatus>>;
    pull(branch?: string): Promise<Result<GitPullResult>>;
    commit(message: string, branch?: string): Promise<Result<string>>;
    getChanges(): Promise<Result<GitStageChange[]>>;
    getDiff(paths?: string[]): Promise<Result<string>>;
    stage(paths: string[]): Promise<Result<void>>;
    reset(paths: string[] | {
        mode: string;
        ref: string;
    }): Promise<Result<void>>;
    getAllChanges(): Promise<Result<GitFileChange[]>>;
    fetch(remote?: string): Promise<Result<void>>;
    getRemoteUrl(remote?: string): Promise<Result<string>>;
    getCurrentBranch(): Promise<Result<string>>;
    diff(revision: string, options?: string[]): Promise<Result<string>>;
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
    status: "A" | "M" | "D" | "R";
    additions: number;
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
export interface WorkspaceScan {
    deadFiles: string[];
    largeFiles: Array<{
        path: string;
        sizeBytes: number;
    }>;
    logFiles: string[];
}
export interface ChatContext {
    activeFile?: string;
    gitBranch?: string;
    gitStatus?: GitStatus;
}
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
export type Middleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;
export interface WorkflowStep {
    id: string;
    command: CommandName;
    params: Record<string, unknown>;
    onSuccess?: string;
    onFailure?: string;
    conditions?: WorkflowCondition[];
}
export interface WorkflowCondition {
    type: "success" | "failure" | "output" | "env";
    key?: string;
    value?: unknown;
}
export interface WorkflowDefinition {
    name: string;
    description?: string;
    version?: string;
    steps: WorkflowStep[];
    triggers?: string[];
}
export interface AgentDefinition {
    id: string;
    description?: string;
    version?: string;
    capabilities: CommandName[];
    workflowTriggers?: string[];
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map