/**
 * Error Code Definitions — Centralized error codes and telemetry events
 * Every error code must be explicitly defined here
 */

// ============================================================================
// Git Domain Error Codes
// ============================================================================

export const GIT_ERROR_CODES = {
  // Core Git Operations
  GIT_UNAVAILABLE: "GIT_UNAVAILABLE",
  GIT_INIT_ERROR: "GIT_INIT_ERROR",
  GIT_STATUS_ERROR: "GIT_STATUS_ERROR",
  GIT_PULL_ERROR: "GIT_PULL_ERROR",
  GIT_COMMIT_ERROR: "GIT_COMMIT_ERROR",
  GIT_FETCH_ERROR: "GIT_FETCH_ERROR",
  GIT_RESET_ERROR: "GIT_RESET_ERROR",

  // Change Parsing & Staging
  GET_CHANGES_FAILED: "GET_CHANGES_FAILED",
  PARSE_CHANGES_FAILED: "PARSE_CHANGES_FAILED",
  STAGE_FAILED: "STAGE_FAILED",

  // Batch Commit Operations
  COMMIT_FAILED: "COMMIT_FAILED",
  BATCH_COMMIT_ERROR: "BATCH_COMMIT_ERROR",
  ROLLBACK_FAILED: "ROLLBACK_FAILED",

  // Inbound Analysis
  INBOUND_ANALYSIS_ERROR: "INBOUND_ANALYSIS_ERROR",
  INBOUND_DIFF_PARSE_ERROR: "INBOUND_DIFF_PARSE_ERROR",
  CONFLICT_DETECTION_ERROR: "CONFLICT_DETECTION_ERROR",

  // Analytics
  ANALYTICS_ERROR: "ANALYTICS_ERROR",
  EXPORT_ERROR: "EXPORT_ERROR",

  // Validation
  NO_CHANGES: "NO_CHANGES",
  NO_GROUPS_APPROVED: "NO_GROUPS_APPROVED",
} as const;

// ============================================================================
// Hygiene Domain Error Codes
// ============================================================================

export const HYGIENE_ERROR_CODES = {
  HYGIENE_INIT_ERROR: "HYGIENE_INIT_ERROR",
  HYGIENE_SCAN_ERROR: "HYGIENE_SCAN_ERROR",
  HYGIENE_CLEANUP_ERROR: "HYGIENE_CLEANUP_ERROR",
  FILE_READ_ERROR: "FILE_READ_ERROR",
  FILE_DELETE_ERROR: "FILE_DELETE_ERROR",
} as const;

// ============================================================================
// Chat Domain Error Codes
// ============================================================================

export const CHAT_ERROR_CODES = {
  CHAT_INIT_ERROR: "CHAT_INIT_ERROR",
  CHAT_CONTEXT_ERROR: "CHAT_CONTEXT_ERROR",
  CHAT_DELEGATE_ERROR: "CHAT_DELEGATE_ERROR",
} as const;

// ============================================================================
// Workflow Engine Error Codes
// ============================================================================

export const WORKFLOW_ERROR_CODES = {
  WORKFLOW_EXECUTION_ERROR: "WORKFLOW_EXECUTION_ERROR",
  INVALID_NEXT_STEP: "INVALID_NEXT_STEP",
  STEP_EXECUTION_ERROR: "STEP_EXECUTION_ERROR",
  STEP_TIMEOUT: "STEP_TIMEOUT",
  INTERPOLATION_ERROR: "INTERPOLATION_ERROR",
  INVALID_WORKFLOW: "INVALID_WORKFLOW",
} as const;

// ============================================================================
// Router Error Codes
// ============================================================================

export const ROUTER_ERROR_CODES = {
  HANDLER_NOT_FOUND: "HANDLER_NOT_FOUND",
  HANDLER_CONFLICT: "HANDLER_CONFLICT",
  HANDLER_ERROR: "HANDLER_ERROR",
  MIDDLEWARE_ERROR: "MIDDLEWARE_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DOMAIN_INIT_ERROR: "DOMAIN_INIT_ERROR",
} as const;

// ============================================================================
// Infrastructure Error Codes
// ============================================================================

export const INFRASTRUCTURE_ERROR_CODES = {
  CONFIG_READ_ERROR: "CONFIG_READ_ERROR",
  CONFIG_WRITE_ERROR: "CONFIG_WRITE_ERROR",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  WORKSPACE_READ_ERROR: "WORKSPACE_READ_ERROR",
  WORKSPACE_WRITE_ERROR: "WORKSPACE_WRITE_ERROR",
  WEBVIEW_ERROR: "WEBVIEW_ERROR",
  LOGGER_ERROR: "LOGGER_ERROR",
} as const;

// ============================================================================
// Generic Error Codes
// ============================================================================

export const GENERIC_ERROR_CODES = {
  INVALID_PARAMS: "INVALID_PARAMS",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  TIMEOUT: "TIMEOUT",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

/**
 * Combined error codes for convenience
 */
export const ERROR_CODES = {
  ...GIT_ERROR_CODES,
  ...HYGIENE_ERROR_CODES,
  ...CHAT_ERROR_CODES,
  ...WORKFLOW_ERROR_CODES,
  ...ROUTER_ERROR_CODES,
  ...INFRASTRUCTURE_ERROR_CODES,
  ...GENERIC_ERROR_CODES,
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================================================
// Telemetry Event Definitions
// ============================================================================

export enum TelemetryEvent {
  // Command execution
  COMMAND_STARTED = "COMMAND_STARTED",
  COMMAND_COMPLETED = "COMMAND_COMPLETED",
  COMMAND_FAILED = "COMMAND_FAILED",

  // Git operations
  GIT_INIT = "GIT_INIT",
  GIT_STATUS_CHECK = "GIT_STATUS_CHECK",
  GIT_PULL_EXECUTED = "GIT_PULL_EXECUTED",
  GIT_COMMIT_EXECUTED = "GIT_COMMIT_EXECUTED",
  GIT_SMART_COMMIT = "GIT_SMART_COMMIT",
  GIT_BATCH_COMMIT = "GIT_BATCH_COMMIT",
  GIT_BATCH_ROLLBACK = "GIT_BATCH_ROLLBACK",
  GIT_INBOUND_ANALYSIS = "GIT_INBOUND_ANALYSIS",

  // Workflow execution
  WORKFLOW_STARTED = "WORKFLOW_STARTED",
  WORKFLOW_COMPLETED = "WORKFLOW_COMPLETED",
  WORKFLOW_STEP_EXECUTED = "WORKFLOW_STEP_EXECUTED",

  // Hygiene operations
  HYGIENE_SCAN = "HYGIENE_SCAN",
  HYGIENE_CLEANUP = "HYGIENE_CLEANUP",

  // Error events
  ERROR_OCCURRED = "ERROR_OCCURRED",
  RETRY_ATTEMPTED = "RETRY_ATTEMPTED",

  // Analytics
  ANALYTICS_GENERATED = "ANALYTICS_GENERATED",
  ANALYTICS_EXPORTED = "ANALYTICS_EXPORTED",
}

/**
 * Telemetry event metadata
 */
export interface TelemetryEventMetadata {
  eventName: TelemetryEvent;
  isCritical: boolean;
  description: string;
  payloadExample: Record<string, unknown>;
}

export const TELEMETRY_EVENTS: Record<TelemetryEvent, TelemetryEventMetadata> = {
  [TelemetryEvent.COMMAND_STARTED]: {
    eventName: TelemetryEvent.COMMAND_STARTED,
    isCritical: false,
    description: "Fired when a command begins execution",
    payloadExample: {
      commandName: "git.smartCommit",
      timestamp: Date.now(),
    },
  },
  [TelemetryEvent.COMMAND_COMPLETED]: {
    eventName: TelemetryEvent.COMMAND_COMPLETED,
    isCritical: true,
    description: "Fired when a command completes successfully",
    payloadExample: {
      commandName: "git.smartCommit",
      durationMs: 1234,
      timestamp: Date.now(),
    },
  },
  [TelemetryEvent.COMMAND_FAILED]: {
    eventName: TelemetryEvent.COMMAND_FAILED,
    isCritical: true,
    description: "Fired when a command fails",
    payloadExample: {
      commandName: "git.smartCommit",
      errorCode: "BATCH_COMMIT_ERROR",
      durationMs: 234,
    },
  },
  [TelemetryEvent.GIT_INIT]: {
    eventName: TelemetryEvent.GIT_INIT,
    isCritical: true,
    description: "Git domain initialized successfully",
    payloadExample: {
      branch: "main",
      timestamp: Date.now(),
    },
  },
  [TelemetryEvent.GIT_STATUS_CHECK]: {
    eventName: TelemetryEvent.GIT_STATUS_CHECK,
    isCritical: false,
    description: "Git status checked",
    payloadExample: {
      branch: "main",
      isDirty: true,
      stagedCount: 3,
    },
  },
  [TelemetryEvent.GIT_PULL_EXECUTED]: {
    eventName: TelemetryEvent.GIT_PULL_EXECUTED,
    isCritical: true,
    description: "Git pull completed",
    payloadExample: {
      branch: "main",
      success: true,
    },
  },
  [TelemetryEvent.GIT_COMMIT_EXECUTED]: {
    eventName: TelemetryEvent.GIT_COMMIT_EXECUTED,
    isCritical: true,
    description: "Git commit completed",
    payloadExample: {
      fileCount: 5,
      hash: "abc123def456",
    },
  },
  [TelemetryEvent.GIT_SMART_COMMIT]: {
    eventName: TelemetryEvent.GIT_SMART_COMMIT,
    isCritical: true,
    description: "Smart commit executed with change grouping",
    payloadExample: {
      filesAnalyzed: 10,
      groupsCreated: 3,
      commitsCreated: 3,
      durationMs: 2000,
    },
  },
  [TelemetryEvent.GIT_BATCH_COMMIT]: {
    eventName: TelemetryEvent.GIT_BATCH_COMMIT,
    isCritical: true,
    description: "Batch commit executed",
    payloadExample: {
      groupCount: 3,
      totalFiles: 10,
      commitCount: 3,
    },
  },
  [TelemetryEvent.GIT_BATCH_ROLLBACK]: {
    eventName: TelemetryEvent.GIT_BATCH_ROLLBACK,
    isCritical: true,
    description: "Batch commit rolled back due to error",
    payloadExample: {
      commitCount: 2,
      reason: "COMMIT_FAILED",
    },
  },
  [TelemetryEvent.GIT_INBOUND_ANALYSIS]: {
    eventName: TelemetryEvent.GIT_INBOUND_ANALYSIS,
    isCritical: false,
    description: "Inbound changes analyzed",
    payloadExample: {
      remoteChanges: 5,
      conflicts: 2,
      highSeverity: 1,
    },
  },
  [TelemetryEvent.WORKFLOW_STARTED]: {
    eventName: TelemetryEvent.WORKFLOW_STARTED,
    isCritical: true,
    description: "Workflow execution started",
    payloadExample: {
      workflowName: "deploy",
      stepCount: 5,
    },
  },
  [TelemetryEvent.WORKFLOW_COMPLETED]: {
    eventName: TelemetryEvent.WORKFLOW_COMPLETED,
    isCritical: true,
    description: "Workflow completed successfully",
    payloadExample: {
      workflowName: "deploy",
      durationMs: 5000,
      stepsExecuted: 5,
    },
  },
  [TelemetryEvent.WORKFLOW_STEP_EXECUTED]: {
    eventName: TelemetryEvent.WORKFLOW_STEP_EXECUTED,
    isCritical: false,
    description: "Single workflow step executed",
    payloadExample: {
      workflowName: "deploy",
      stepId: "checkout",
      success: true,
    },
  },
  [TelemetryEvent.HYGIENE_SCAN]: {
    eventName: TelemetryEvent.HYGIENE_SCAN,
    isCritical: false,
    description: "Workspace hygiene scan completed",
    payloadExample: {
      deadFiles: 3,
      largeFiles: 2,
      logFiles: 5,
    },
  },
  [TelemetryEvent.HYGIENE_CLEANUP]: {
    eventName: TelemetryEvent.HYGIENE_CLEANUP,
    isCritical: true,
    description: "Workspace cleanup completed",
    payloadExample: {
      filesDeleted: 10,
      bytesFreed: 1048576,
      dryRun: false,
    },
  },
  [TelemetryEvent.ERROR_OCCURRED]: {
    eventName: TelemetryEvent.ERROR_OCCURRED,
    isCritical: true,
    description: "Error occurred during execution",
    payloadExample: {
      errorCode: "GIT_UNAVAILABLE",
      context: "GitDomainService.initialize",
      timestamp: Date.now(),
    },
  },
  [TelemetryEvent.RETRY_ATTEMPTED]: {
    eventName: TelemetryEvent.RETRY_ATTEMPTED,
    isCritical: false,
    description: "Operation retry attempted",
    payloadExample: {
      attemptNumber: 2,
      operation: "git.fetch",
      backoffMs: 1000,
    },
  },
  [TelemetryEvent.ANALYTICS_GENERATED]: {
    eventName: TelemetryEvent.ANALYTICS_GENERATED,
    isCritical: false,
    description: "Git analytics report generated",
    payloadExample: {
      commitCount: 150,
      authorCount: 5,
      fileCount: 50,
    },
  },
  [TelemetryEvent.ANALYTICS_EXPORTED]: {
    eventName: TelemetryEvent.ANALYTICS_EXPORTED,
    isCritical: false,
    description: "Analytics exported to file",
    payloadExample: {
      format: "json",
      filePath: "/workspace/analytics.json",
    },
  },
};

// ============================================================================
// Timeout Constants
// ============================================================================

export const TIMEOUTS = {
  GIT_OPERATION: 30_000, // 30 seconds
  GIT_CLONE: 120_000, // 2 minutes
  WORKFLOW_STEP: 60_000, // 1 minute
  NETWORK_REQUEST: 10_000, // 10 seconds
} as const;

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoffMs: 100,
  maxBackoffMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Get retry config for specific error code
 */
export function getRetryConfig(errorCode: ErrorCode): RetryConfig | null {
  // Network errors and timeouts are retryable
  const retryableErrors: ErrorCode[] = [
    GIT_ERROR_CODES.GIT_FETCH_ERROR,
    GENERIC_ERROR_CODES.TIMEOUT,
  ];

  return retryableErrors.includes(errorCode) ? DEFAULT_RETRY_CONFIG : null;
}
