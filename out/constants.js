"use strict";
/**
 * Centralized, typed constants for the entire application.
 * No magic strings or numbers; all thresholds, names, and patterns are explicit.
 *
 * Organized by domain for clarity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_SETTINGS = exports.WORKFLOW_SETTINGS = exports.TELEMETRY_EVENT_KINDS = exports.PERFORMANCE_BOUNDS = exports.FILE_PATTERNS = exports.LOG_CONTEXT = exports.LOG_SETTINGS = exports.CHAT_SETTINGS = exports.HYGIENE_SETTINGS = exports.GIT_DEFAULTS = exports.CACHE_SETTINGS = exports.SIMILARITY_THRESHOLDS = exports.ERROR_CODES = exports.COMMAND_NAMES = void 0;
// ============================================================================
// Command Names
// ============================================================================
exports.COMMAND_NAMES = {
    // Git domain
    GIT: {
        STATUS: "git.status",
        PULL: "git.pull",
        COMMIT: "git.commit",
        SMART_COMMIT: "git.smartCommit",
        ANALYZE_INBOUND: "git.analyzeInbound",
        SHOW_ANALYTICS: "git.showAnalytics",
        EXPORT_JSON: "git.exportJson",
        EXPORT_CSV: "git.exportCsv",
    },
    // Hygiene domain
    HYGIENE: {
        SCAN: "hygiene.scan",
        CLEANUP: "hygiene.cleanup",
    },
    // Chat domain
    CHAT: {
        CONTEXT: "chat.context",
        DELEGATE: "chat.delegate",
    },
    // Workflow domain
    WORKFLOW: {
        LIST: "workflow.list",
        RUN: "workflow.run",
    },
    // Agent domain
    AGENT: {
        LIST: "agent.list",
    },
};
// ============================================================================
// Error Codes
// ============================================================================
exports.ERROR_CODES = {
    // Configuration errors
    CONFIG_INIT_ERROR: "CONFIG_INIT_ERROR",
    CONFIG_SET_ERROR: "CONFIG_SET_ERROR",
    CONFIG_VALIDATION_ERROR: "CONFIG_VALIDATION_ERROR",
    CONFIG_MISSING_REQUIRED: "CONFIG_MISSING_REQUIRED",
    // Git errors
    GIT_OPERATION_FAILED: "GIT_OPERATION_FAILED",
    GIT_CLONE_FAILED: "GIT_CLONE_FAILED",
    GIT_NO_CHANGES: "GIT_NO_CHANGES",
    GIT_CONFLICT: "GIT_CONFLICT",
    // Workspace errors
    WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
    FILE_READ_ERROR: "FILE_READ_ERROR",
    FILE_WRITE_ERROR: "FILE_WRITE_ERROR",
    FILE_DELETE_ERROR: "FILE_DELETE_ERROR",
    // Workflow errors
    WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND",
    WORKFLOW_EXECUTION_ERROR: "WORKFLOW_EXECUTION_ERROR",
    WORKFLOW_STEP_FAILED: "WORKFLOW_STEP_FAILED",
    // Agent errors
    AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
    AGENT_CAPABILITY_MISSING: "AGENT_CAPABILITY_MISSING",
    // Handler errors
    HANDLER_NOT_FOUND: "HANDLER_NOT_FOUND",
    HANDLER_EXECUTION_ERROR: "HANDLER_EXECUTION_ERROR",
    // Generic errors
    OPERATION_TIMEOUT: "OPERATION_TIMEOUT",
    OPERATION_CANCELLED: "OPERATION_CANCELLED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
};
// ============================================================================
// Similarity & Clustering Thresholds
// ============================================================================
exports.SIMILARITY_THRESHOLDS = {
    /** Minimum Levenshtein similarity (0.0 to 1.0) for grouping related file changes */
    CHANGE_GROUPING: 0.4,
    /** Minimum similarity for commit message suggestions */
    MESSAGE_SUGGESTION: 0.5,
    /** Similarity threshold for file path clustering */
    PATH_CLUSTERING: 0.35,
};
// ============================================================================
// Cache Configuration
// ============================================================================
exports.CACHE_SETTINGS = {
    /** Maximum number of log entries to keep in memory */
    MAX_LOG_ENTRIES: 1000,
    /** Log cache TTL in milliseconds (30 minutes) */
    LOG_TTL_MS: 30 * 60 * 1000,
    /** Maximum number of cached workflow definitions */
    MAX_WORKFLOW_CACHE: 100,
    /** Workflow cache TTL in milliseconds (1 hour) */
    WORKFLOW_CACHE_TTL_MS: 60 * 60 * 1000,
    /** Maximum number of cached agent definitions */
    MAX_AGENT_CACHE: 50,
    /** Agent cache TTL in milliseconds (1 hour) */
    AGENT_CACHE_TTL_MS: 60 * 60 * 1000,
    /** Git status cache TTL in milliseconds (5 minutes) */
    GIT_STATUS_TTL_MS: 5 * 60 * 1000,
};
// ============================================================================
// Git Configuration Defaults
// ============================================================================
exports.GIT_DEFAULTS = {
    /** Default remote name */
    DEFAULT_REMOTE: "origin",
    /** Default main branch */
    DEFAULT_BRANCH: "main",
    /** Fallback branch if main doesn't exist */
    FALLBACK_BRANCH: "master",
    /** Default depth for shallow clones (0 = full clone) */
    CLONE_DEPTH: 0,
    /** Whether to auto-fetch before operations */
    AUTO_FETCH: false,
    /** Whether to clean branches after merge */
    AUTO_BRANCH_CLEAN: true,
    /** Commit message minimum length (characters) */
    MIN_MESSAGE_LENGTH: 5,
    /** Commit message maximum length (characters) */
    MAX_MESSAGE_LENGTH: 72,
    /** Maximum number of inbound changes to process */
    MAX_INBOUND_CHANGES: 100,
    /** Git operation timeout in milliseconds */
    OPERATION_TIMEOUT_MS: 30 * 1000,
};
// ============================================================================
// Hygiene Configuration
// ============================================================================
exports.HYGIENE_SETTINGS = {
    /** Whether hygiene checks are enabled */
    ENABLED: true,
    /** Scan interval in minutes */
    SCAN_INTERVAL_MINUTES: 60,
    /** Maximum file size to check in bytes (10 MB) */
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    /** File patterns to exclude from hygiene checks */
    EXCLUDE_PATTERNS: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.vscode/**",
        "**/out/**",
    ],
    /** Log file patterns to detect */
    LOG_FILE_PATTERNS: ["*.log", "debug.log", "*-error.log"],
    /** Temporary file patterns */
    TEMP_FILE_PATTERNS: ["*.tmp", "*.temp", "*.bak", "*~"],
};
// ============================================================================
// Chat Configuration
// ============================================================================
exports.CHAT_SETTINGS = {
    /** Default LLM model for chat operations */
    DEFAULT_MODEL: "gpt-4",
    /** Alternative models */
    AVAILABLE_MODELS: ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"],
    /** Lines of context to include from active file */
    CONTEXT_LINES: 50,
    /** Maximum context size in characters */
    MAX_CONTEXT_CHARS: 4000,
    /** Chat message timeout in milliseconds */
    RESPONSE_TIMEOUT_MS: 30 * 1000,
    /** Maximum number of messages to keep in conversation */
    MAX_CONVERSATION_DEPTH: 10,
};
// ============================================================================
// Logging Configuration
// ============================================================================
exports.LOG_SETTINGS = {
    /** Default log level */
    DEFAULT_LEVEL: "info",
    /** Available log levels */
    LEVELS: ["debug", "info", "warn", "error"],
    /** Maximum entries per log level */
    MAX_ENTRIES_PER_LEVEL: 250,
    /** Whether to include timestamps in logs */
    INCLUDE_TIMESTAMPS: true,
    /** Whether to include context in logs */
    INCLUDE_CONTEXT: true,
};
// ============================================================================
// Log Context Strings
// ============================================================================
exports.LOG_CONTEXT = {
    // Git domain
    GIT_SERVICE: "GitService",
    GIT_STATUS_HANDLER: "GitStatusHandler",
    GIT_COMMIT_HANDLER: "GitCommitHandler",
    GIT_SMART_COMMIT_HANDLER: "GitSmartCommitHandler",
    GIT_ANALYTICS_SERVICE: "GitAnalyticsService",
    CHANGE_GROUPER: "ChangeGrouper",
    MESSAGE_SUGGESTER: "MessageSuggester",
    // Hygiene domain
    HYGIENE_SERVICE: "HygieneService",
    HYGIENE_SCANNER: "HygieneScanner",
    // Chat domain
    CHAT_SERVICE: "ChatService",
    CHAT_CONTEXT_HANDLER: "ChatContextHandler",
    // Workflow domain
    WORKFLOW_SERVICE: "WorkflowService",
    WORKFLOW_ENGINE: "WorkflowEngine",
    WORKFLOW_STEP_RUNNER: "StepRunner",
    // Agent domain
    AGENT_SERVICE: "AgentService",
    AGENT_REGISTRY: "AgentRegistry",
    // Infrastructure
    LOGGER: "Logger",
    CONFIG: "Config",
    TELEMETRY: "Telemetry",
    ROUTER: "CommandRouter",
    MIDDLEWARE: "Middleware",
    // Cross-cutting
    PERMISSION_CHECKER: "PermissionChecker",
    AUDIT_LOG: "AuditLog",
};
// ============================================================================
// File Patterns & Paths
// ============================================================================
exports.FILE_PATTERNS = {
    // TypeScript files
    TYPESCRIPT: "**/*.ts",
    TYPESCRIPT_BUILD: "**/*.js",
    // Configuration files
    CONFIG_FILES: ["tsconfig.json", "package.json", "*.config.js"],
    // Documentation
    DOCS: "**/*.md",
    // Test files
    TESTS: "**/*.test.ts",
    TEST_SPEC: "**/*.spec.ts",
    // Common folders to exclude
    EXCLUDED_DIRS: [
        "node_modules",
        ".git",
        "dist",
        "build",
        "out",
        ".vscode",
        ".idea",
    ],
};
// ============================================================================
// Performance Bounds
// ============================================================================
exports.PERFORMANCE_BOUNDS = {
    /** Maximum handler execution time in milliseconds */
    MAX_HANDLER_TIME_MS: 60 * 1000,
    /** Maximum workflow execution time in milliseconds */
    MAX_WORKFLOW_TIME_MS: 5 * 60 * 1000,
    /** Maximum number of concurrent operations */
    MAX_CONCURRENT_OPS: 5,
    /** Timeout for external API calls in milliseconds */
    API_TIMEOUT_MS: 30 * 1000,
    /** Debounce delay for file system events in milliseconds */
    FS_EVENT_DEBOUNCE_MS: 500,
    /** Batch size for processing large file lists */
    BATCH_SIZE: 50,
    /** Maximum retries for transient failures */
    MAX_RETRIES: 3,
    /** Base retry delay in milliseconds (exponential backoff) */
    RETRY_BASE_DELAY_MS: 1000,
};
// ============================================================================
// Telemetry Event Types
// ============================================================================
exports.TELEMETRY_EVENT_KINDS = {
    COMMAND_STARTED: "COMMAND_STARTED",
    COMMAND_COMPLETED: "COMMAND_COMPLETED",
    COMMAND_FAILED: "COMMAND_FAILED",
    CACHE_HIT: "CACHE_HIT",
    CACHE_MISS: "CACHE_MISS",
    ERROR_OCCURRED: "ERROR_OCCURRED",
    WORKFLOW_STARTED: "WORKFLOW_STARTED",
    WORKFLOW_COMPLETED: "WORKFLOW_COMPLETED",
    WORKFLOW_FAILED: "WORKFLOW_FAILED",
    AGENT_INVOKED: "AGENT_INVOKED",
    USER_ACTION: "USER_ACTION",
};
// ============================================================================
// Workflow Engine Constants
// ============================================================================
exports.WORKFLOW_SETTINGS = {
    /** Default timeout for workflow execution in milliseconds */
    EXECUTION_TIMEOUT_MS: 5 * 60 * 1000,
    /** Default timeout per step in milliseconds */
    STEP_TIMEOUT_MS: 60 * 1000,
    /** Maximum number of sequential steps allowed in a workflow */
    MAX_STEPS: 50,
    /** Whether to continue on step failure */
    CONTINUE_ON_FAILURE: false,
};
// ============================================================================
// Agent Registry Constants
// ============================================================================
exports.AGENT_SETTINGS = {
    /** Maximum number of capabilities per agent */
    MAX_CAPABILITIES_PER_AGENT: 20,
    /** Whether to allow dynamic agent registration */
    ALLOW_DYNAMIC_REGISTRATION: true,
    /** Agent discovery timeout in milliseconds */
    DISCOVERY_TIMEOUT_MS: 5 * 1000,
};
//# sourceMappingURL=constants.js.map