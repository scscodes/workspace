/**
 * Centralized, typed constants for the entire application.
 * No magic strings or numbers; all thresholds, names, and patterns are explicit.
 *
 * Organized by domain for clarity.
 */
export declare const COMMAND_NAMES: {
    readonly GIT: {
        readonly STATUS: "git.status";
        readonly PULL: "git.pull";
        readonly COMMIT: "git.commit";
        readonly SMART_COMMIT: "git.smartCommit";
        readonly ANALYZE_INBOUND: "git.analyzeInbound";
        readonly SHOW_ANALYTICS: "git.showAnalytics";
        readonly EXPORT_JSON: "git.exportJson";
        readonly EXPORT_CSV: "git.exportCsv";
    };
    readonly HYGIENE: {
        readonly SCAN: "hygiene.scan";
        readonly CLEANUP: "hygiene.cleanup";
    };
    readonly CHAT: {
        readonly CONTEXT: "chat.context";
        readonly DELEGATE: "chat.delegate";
    };
    readonly WORKFLOW: {
        readonly LIST: "workflow.list";
        readonly RUN: "workflow.run";
    };
    readonly AGENT: {
        readonly LIST: "agent.list";
    };
};
export declare const ERROR_CODES: {
    readonly CONFIG_INIT_ERROR: "CONFIG_INIT_ERROR";
    readonly CONFIG_SET_ERROR: "CONFIG_SET_ERROR";
    readonly CONFIG_VALIDATION_ERROR: "CONFIG_VALIDATION_ERROR";
    readonly CONFIG_MISSING_REQUIRED: "CONFIG_MISSING_REQUIRED";
    readonly GIT_OPERATION_FAILED: "GIT_OPERATION_FAILED";
    readonly GIT_CLONE_FAILED: "GIT_CLONE_FAILED";
    readonly GIT_NO_CHANGES: "GIT_NO_CHANGES";
    readonly GIT_CONFLICT: "GIT_CONFLICT";
    readonly WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND";
    readonly FILE_READ_ERROR: "FILE_READ_ERROR";
    readonly FILE_WRITE_ERROR: "FILE_WRITE_ERROR";
    readonly FILE_DELETE_ERROR: "FILE_DELETE_ERROR";
    readonly WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND";
    readonly WORKFLOW_EXECUTION_ERROR: "WORKFLOW_EXECUTION_ERROR";
    readonly WORKFLOW_STEP_FAILED: "WORKFLOW_STEP_FAILED";
    readonly AGENT_NOT_FOUND: "AGENT_NOT_FOUND";
    readonly AGENT_CAPABILITY_MISSING: "AGENT_CAPABILITY_MISSING";
    readonly HANDLER_NOT_FOUND: "HANDLER_NOT_FOUND";
    readonly HANDLER_EXECUTION_ERROR: "HANDLER_EXECUTION_ERROR";
    readonly OPERATION_TIMEOUT: "OPERATION_TIMEOUT";
    readonly OPERATION_CANCELLED: "OPERATION_CANCELLED";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
export declare const SIMILARITY_THRESHOLDS: {
    /** Minimum Levenshtein similarity (0.0 to 1.0) for grouping related file changes */
    readonly CHANGE_GROUPING: 0.4;
    /** Minimum similarity for commit message suggestions */
    readonly MESSAGE_SUGGESTION: 0.5;
    /** Similarity threshold for file path clustering */
    readonly PATH_CLUSTERING: 0.35;
};
export declare const CACHE_SETTINGS: {
    /** Maximum number of log entries to keep in memory */
    readonly MAX_LOG_ENTRIES: 1000;
    /** Log cache TTL in milliseconds (30 minutes) */
    readonly LOG_TTL_MS: number;
    /** Maximum number of cached workflow definitions */
    readonly MAX_WORKFLOW_CACHE: 100;
    /** Workflow cache TTL in milliseconds (1 hour) */
    readonly WORKFLOW_CACHE_TTL_MS: number;
    /** Maximum number of cached agent definitions */
    readonly MAX_AGENT_CACHE: 50;
    /** Agent cache TTL in milliseconds (1 hour) */
    readonly AGENT_CACHE_TTL_MS: number;
    /** Git status cache TTL in milliseconds (5 minutes) */
    readonly GIT_STATUS_TTL_MS: number;
};
export declare const GIT_DEFAULTS: {
    /** Default remote name */
    readonly DEFAULT_REMOTE: "origin";
    /** Default main branch */
    readonly DEFAULT_BRANCH: "main";
    /** Fallback branch if main doesn't exist */
    readonly FALLBACK_BRANCH: "master";
    /** Default depth for shallow clones (0 = full clone) */
    readonly CLONE_DEPTH: 0;
    /** Whether to auto-fetch before operations */
    readonly AUTO_FETCH: false;
    /** Whether to clean branches after merge */
    readonly AUTO_BRANCH_CLEAN: true;
    /** Commit message minimum length (characters) */
    readonly MIN_MESSAGE_LENGTH: 5;
    /** Commit message maximum length (characters) */
    readonly MAX_MESSAGE_LENGTH: 72;
    /** Maximum number of inbound changes to process */
    readonly MAX_INBOUND_CHANGES: 100;
    /** Git operation timeout in milliseconds */
    readonly OPERATION_TIMEOUT_MS: number;
};
export declare const HYGIENE_SETTINGS: {
    /** Whether hygiene checks are enabled */
    readonly ENABLED: true;
    /** Scan interval in minutes */
    readonly SCAN_INTERVAL_MINUTES: 60;
    /** Maximum file size to check in bytes (10 MB) */
    readonly MAX_FILE_SIZE_BYTES: number;
    /** File patterns to exclude from hygiene checks */
    readonly EXCLUDE_PATTERNS: readonly ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.vscode/**", "**/out/**"];
    /** Log file patterns to detect */
    readonly LOG_FILE_PATTERNS: readonly ["*.log", "debug.log", "*-error.log"];
    /** Temporary file patterns */
    readonly TEMP_FILE_PATTERNS: readonly ["*.tmp", "*.temp", "*.bak", "*~"];
};
export declare const CHAT_SETTINGS: {
    /** Default LLM model for chat operations */
    readonly DEFAULT_MODEL: "gpt-4";
    /** Alternative models */
    readonly AVAILABLE_MODELS: readonly ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"];
    /** Lines of context to include from active file */
    readonly CONTEXT_LINES: 50;
    /** Maximum context size in characters */
    readonly MAX_CONTEXT_CHARS: 4000;
    /** Chat message timeout in milliseconds */
    readonly RESPONSE_TIMEOUT_MS: number;
    /** Maximum number of messages to keep in conversation */
    readonly MAX_CONVERSATION_DEPTH: 10;
};
export declare const LOG_SETTINGS: {
    /** Default log level */
    readonly DEFAULT_LEVEL: "info";
    /** Available log levels */
    readonly LEVELS: readonly ["debug", "info", "warn", "error"];
    /** Maximum entries per log level */
    readonly MAX_ENTRIES_PER_LEVEL: 250;
    /** Whether to include timestamps in logs */
    readonly INCLUDE_TIMESTAMPS: true;
    /** Whether to include context in logs */
    readonly INCLUDE_CONTEXT: true;
};
export declare const LOG_CONTEXT: {
    readonly GIT_SERVICE: "GitService";
    readonly GIT_STATUS_HANDLER: "GitStatusHandler";
    readonly GIT_COMMIT_HANDLER: "GitCommitHandler";
    readonly GIT_SMART_COMMIT_HANDLER: "GitSmartCommitHandler";
    readonly GIT_ANALYTICS_SERVICE: "GitAnalyticsService";
    readonly CHANGE_GROUPER: "ChangeGrouper";
    readonly MESSAGE_SUGGESTER: "MessageSuggester";
    readonly HYGIENE_SERVICE: "HygieneService";
    readonly HYGIENE_SCANNER: "HygieneScanner";
    readonly CHAT_SERVICE: "ChatService";
    readonly CHAT_CONTEXT_HANDLER: "ChatContextHandler";
    readonly WORKFLOW_SERVICE: "WorkflowService";
    readonly WORKFLOW_ENGINE: "WorkflowEngine";
    readonly WORKFLOW_STEP_RUNNER: "StepRunner";
    readonly AGENT_SERVICE: "AgentService";
    readonly AGENT_REGISTRY: "AgentRegistry";
    readonly LOGGER: "Logger";
    readonly CONFIG: "Config";
    readonly TELEMETRY: "Telemetry";
    readonly ROUTER: "CommandRouter";
    readonly MIDDLEWARE: "Middleware";
    readonly PERMISSION_CHECKER: "PermissionChecker";
    readonly AUDIT_LOG: "AuditLog";
};
export declare const FILE_PATTERNS: {
    readonly TYPESCRIPT: "**/*.ts";
    readonly TYPESCRIPT_BUILD: "**/*.js";
    readonly CONFIG_FILES: readonly ["tsconfig.json", "package.json", "*.config.js"];
    readonly DOCS: "**/*.md";
    readonly TESTS: "**/*.test.ts";
    readonly TEST_SPEC: "**/*.spec.ts";
    readonly EXCLUDED_DIRS: readonly ["node_modules", ".git", "dist", "build", "out", ".vscode", ".idea"];
};
export declare const PERFORMANCE_BOUNDS: {
    /** Maximum handler execution time in milliseconds */
    readonly MAX_HANDLER_TIME_MS: number;
    /** Maximum workflow execution time in milliseconds */
    readonly MAX_WORKFLOW_TIME_MS: number;
    /** Maximum number of concurrent operations */
    readonly MAX_CONCURRENT_OPS: 5;
    /** Timeout for external API calls in milliseconds */
    readonly API_TIMEOUT_MS: number;
    /** Debounce delay for file system events in milliseconds */
    readonly FS_EVENT_DEBOUNCE_MS: 500;
    /** Batch size for processing large file lists */
    readonly BATCH_SIZE: 50;
    /** Maximum retries for transient failures */
    readonly MAX_RETRIES: 3;
    /** Base retry delay in milliseconds (exponential backoff) */
    readonly RETRY_BASE_DELAY_MS: 1000;
};
export declare const TELEMETRY_EVENT_KINDS: {
    readonly COMMAND_STARTED: "COMMAND_STARTED";
    readonly COMMAND_COMPLETED: "COMMAND_COMPLETED";
    readonly COMMAND_FAILED: "COMMAND_FAILED";
    readonly CACHE_HIT: "CACHE_HIT";
    readonly CACHE_MISS: "CACHE_MISS";
    readonly ERROR_OCCURRED: "ERROR_OCCURRED";
    readonly WORKFLOW_STARTED: "WORKFLOW_STARTED";
    readonly WORKFLOW_COMPLETED: "WORKFLOW_COMPLETED";
    readonly WORKFLOW_FAILED: "WORKFLOW_FAILED";
    readonly AGENT_INVOKED: "AGENT_INVOKED";
    readonly USER_ACTION: "USER_ACTION";
};
export declare const WORKFLOW_SETTINGS: {
    /** Default timeout for workflow execution in milliseconds */
    readonly EXECUTION_TIMEOUT_MS: number;
    /** Default timeout per step in milliseconds */
    readonly STEP_TIMEOUT_MS: number;
    /** Maximum number of sequential steps allowed in a workflow */
    readonly MAX_STEPS: 50;
    /** Whether to continue on step failure */
    readonly CONTINUE_ON_FAILURE: false;
};
export declare const AGENT_SETTINGS: {
    /** Maximum number of capabilities per agent */
    readonly MAX_CAPABILITIES_PER_AGENT: 20;
    /** Whether to allow dynamic agent registration */
    readonly ALLOW_DYNAMIC_REGISTRATION: true;
    /** Agent discovery timeout in milliseconds */
    readonly DISCOVERY_TIMEOUT_MS: number;
};
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type CommandName = typeof COMMAND_NAMES[keyof typeof COMMAND_NAMES][keyof typeof COMMAND_NAMES[keyof typeof COMMAND_NAMES]];
export type LogLevel = typeof LOG_SETTINGS.LEVELS[number];
export type TelemetryEventKind = typeof TELEMETRY_EVENT_KINDS[keyof typeof TELEMETRY_EVENT_KINDS];
//# sourceMappingURL=constants.d.ts.map