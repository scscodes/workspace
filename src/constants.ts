/**
 * Centralized, typed constants for the entire application.
 * No magic strings or numbers; all thresholds, names, and patterns are explicit.
 * 
 * Organized by domain for clarity.
 */

// ============================================================================
// Command Names
// ============================================================================

export const COMMAND_NAMES = {
  // Git domain
  GIT: {
    STATUS: "git.status" as const,
    PULL: "git.pull" as const,
    COMMIT: "git.commit" as const,
    SMART_COMMIT: "git.smartCommit" as const,
    ANALYZE_INBOUND: "git.analyzeInbound" as const,
    SHOW_ANALYTICS: "git.showAnalytics" as const,
    EXPORT_JSON: "git.exportJson" as const,
    EXPORT_CSV: "git.exportCsv" as const,
  },
  // Hygiene domain
  HYGIENE: {
    SCAN: "hygiene.scan" as const,
    CLEANUP: "hygiene.cleanup" as const,
    SHOW_ANALYTICS: "hygiene.showAnalytics" as const,
  },
  // Chat domain
  CHAT: {
    CONTEXT: "chat.context" as const,
    DELEGATE: "chat.delegate" as const,
  },
  // Workflow domain
  WORKFLOW: {
    LIST: "workflow.list" as const,
    RUN: "workflow.run" as const,
  },
  // Agent domain
  AGENT: {
    LIST: "agent.list" as const,
  },
} as const;

// ============================================================================
// Error Codes
// ============================================================================

export const ERROR_CODES = {
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
} as const;

// ============================================================================
// Similarity & Clustering Thresholds
// ============================================================================

export const SIMILARITY_THRESHOLDS = {
  /** Minimum Levenshtein similarity (0.0 to 1.0) for grouping related file changes */
  CHANGE_GROUPING: 0.4,

  /** Minimum similarity for commit message suggestions */
  MESSAGE_SUGGESTION: 0.5,

  /** Similarity threshold for file path clustering */
  PATH_CLUSTERING: 0.35,
} as const;

// ============================================================================
// Cache Configuration
// ============================================================================

export const CACHE_SETTINGS = {
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
} as const;

// ============================================================================
// Git Configuration Defaults
// ============================================================================

export const GIT_DEFAULTS = {
  /** Default remote name */
  DEFAULT_REMOTE: "origin" as const,

  /** Default main branch */
  DEFAULT_BRANCH: "main" as const,

  /** Fallback branch if main doesn't exist */
  FALLBACK_BRANCH: "master" as const,

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
} as const;

// ============================================================================
// Hygiene Configuration
// ============================================================================

export const HYGIENE_SETTINGS = {
  /** Whether hygiene checks are enabled */
  ENABLED: true,

  /** Scan interval in minutes */
  SCAN_INTERVAL_MINUTES: 60,

  /** Maximum file size to check in bytes (10 MB) */
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,

  /** File patterns to exclude from hygiene checks */
  EXCLUDE_PATTERNS: [
    // VCS + editor
    "**/node_modules/**",
    "**/.git/**",
    "**/.vscode/**",
    "**/.idea/**",
    // Build / output
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/bundled/**",
    // Python runtime & tooling
    "**/.venv/**",
    "**/venv/**",
    "**/__pycache__/**",
    "**/.pytest_cache/**",
    "**/.mypy_cache/**",
    "**/.ruff_cache/**",
    "**/.tox/**",
    "**/.eggs/**",
    "**/*.egg-info/**",
    // JS/TS coverage & caches
    "**/coverage/**",
    "**/.nyc_output/**",
    "**/.cache/**",
  ] as const,

  /** Log file patterns to detect */
  LOG_FILE_PATTERNS: ["*.log", "debug.log", "*-error.log"] as const,

  /** Temporary file patterns */
  TEMP_FILE_PATTERNS: ["*.tmp", "*.temp", "*.bak", "*~"] as const,
} as const;

// ============================================================================
// Hygiene Analytics — lighter exclusion set for the analytics scan.
// Unlike HYGIENE_SETTINGS.EXCLUDE_PATTERNS, this intentionally keeps
// artifact dirs (dist/, build/, out/, coverage/, .cache/, .next/) so they
// are surfaced and can be flagged as prune candidates.
// Gitignore patterns are NOT applied to analytics either.
// ============================================================================

export const HYGIENE_ANALYTICS_EXCLUDE_PATTERNS = [
  // VCS + editor noise — never analytically useful
  "**/node_modules/**",
  "**/.git/**",
  "**/.vscode/**",
  "**/.idea/**",
  // Python runtime environments — can be enormous
  "**/.venv/**",
  "**/venv/**",
  "**/.pytest_cache/**",
  "**/.mypy_cache/**",
  "**/.ruff_cache/**",
  "**/.tox/**",
  "**/.eggs/**",
  "**/*.egg-info/**",
  // JS package manager internals
  "**/.yarn/**",
  "**/.pnpm-store/**",
] as const;

// ============================================================================
// Chat Configuration
// ============================================================================

export const CHAT_SETTINGS = {
  /** Default LLM model for chat operations */
  DEFAULT_MODEL: "gpt-4" as const,

  /** Alternative models */
  AVAILABLE_MODELS: ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"] as const,

  /** Lines of context to include from active file */
  CONTEXT_LINES: 50,

  /** Maximum context size in characters */
  MAX_CONTEXT_CHARS: 4000,

  /** Chat message timeout in milliseconds */
  RESPONSE_TIMEOUT_MS: 30 * 1000,

  /** Maximum number of messages to keep in conversation */
  MAX_CONVERSATION_DEPTH: 10,
} as const;

// ============================================================================
// Logging Configuration
// ============================================================================

export const LOG_SETTINGS = {
  /** Default log level */
  DEFAULT_LEVEL: "info" as const,

  /** Available log levels */
  LEVELS: ["debug", "info", "warn", "error"] as const,

  /** Maximum entries per log level */
  MAX_ENTRIES_PER_LEVEL: 250,

  /** Whether to include timestamps in logs */
  INCLUDE_TIMESTAMPS: true,

  /** Whether to include context in logs */
  INCLUDE_CONTEXT: true,
} as const;

// ============================================================================
// Log Context Strings
// ============================================================================

export const LOG_CONTEXT = {
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
} as const;

// ============================================================================
// File Patterns & Paths
// ============================================================================

export const FILE_PATTERNS = {
  // TypeScript files
  TYPESCRIPT: "**/*.ts" as const,
  TYPESCRIPT_BUILD: "**/*.js" as const,

  // Configuration files
  CONFIG_FILES: ["tsconfig.json", "package.json", "*.config.js"] as const,

  // Documentation
  DOCS: "**/*.md" as const,

  // Test files
  TESTS: "**/*.test.ts" as const,
  TEST_SPEC: "**/*.spec.ts" as const,

  // Common folders to exclude
  EXCLUDED_DIRS: [
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    ".vscode",
    ".idea",
  ] as const,
} as const;

// ============================================================================
// Performance Bounds
// ============================================================================

export const PERFORMANCE_BOUNDS = {
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
} as const;

// ============================================================================
// Telemetry Event Types
// ============================================================================

export const TELEMETRY_EVENT_KINDS = {
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
} as const;

// ============================================================================
// Workflow Engine Constants
// ============================================================================

export const WORKFLOW_SETTINGS = {
  /** Default timeout for workflow execution in milliseconds */
  EXECUTION_TIMEOUT_MS: 5 * 60 * 1000,

  /** Default timeout per step in milliseconds */
  STEP_TIMEOUT_MS: 60 * 1000,

  /** Maximum number of sequential steps allowed in a workflow */
  MAX_STEPS: 50,

  /** Whether to continue on step failure */
  CONTINUE_ON_FAILURE: false,
} as const;

// ============================================================================
// Agent Registry Constants
// ============================================================================

export const AGENT_SETTINGS = {
  /** Maximum number of capabilities per agent */
  MAX_CAPABILITIES_PER_AGENT: 20,

  /** Whether to allow dynamic agent registration */
  ALLOW_DYNAMIC_REGISTRATION: true,

  /** Agent discovery timeout in milliseconds */
  DISCOVERY_TIMEOUT_MS: 5 * 1000,
} as const;

// ============================================================================
// Type inference helpers (ensure consistency)
// ============================================================================

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type CommandName = typeof COMMAND_NAMES[keyof typeof COMMAND_NAMES][keyof typeof COMMAND_NAMES[keyof typeof COMMAND_NAMES]];
export type LogLevel = typeof LOG_SETTINGS.LEVELS[number];
export type TelemetryEventKind = typeof TELEMETRY_EVENT_KINDS[keyof typeof TELEMETRY_EVENT_KINDS];
