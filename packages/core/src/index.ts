// ─── Types ──────────────────────────────────────────────────────────────────
// Re-export all types from the central type definitions.
// Consumers should import types from '@aidev/core' directly.

export type {
  // Common
  SupportedLanguage,
  SupportedFramework,
  CodeLocation,
  Severity,
  ExportFormat,
  // Settings
  OperatingMode,
  ModelTier,
  ModelRole,
  ModelProviderSource,
  ModelTierMap,
  CommitConstraints,
  DirectApiConfig,
  AgentSettings,
  ExtensionSettings,
  // Models
  ResolvedModel,
  ToolDefinition,
  ToolCall,
  ToolResult,
  StopReason,
  ChatMessage,
  ModelRequestOptions,
  ModelResponse,
  IModelProvider,
  // Analysis
  ToolId,
  ToolInvocationMode,
  ScanStatus,
  Finding,
  SuggestedFix,
  ScanResult,
  ScanSummary,
  ScanOptions,
  ITool,
  // Git
  ChangedFile,
  CommitProposal,
  ConstraintValidation,
  ConstraintViolation,
  HookCheckResult,
  TldrSummary,
  TldrHighlight,
  BranchComparison,
  ConflictFile,
  ConflictHunk,
  ConflictResolution,
} from './types/index.js';

// ─── Settings ───────────────────────────────────────────────────────────────
export {
  DEFAULT_SETTINGS,
  DEFAULT_MODEL_TIERS,
  DEFAULT_COMMIT_CONSTRAINTS,
  DEFAULT_AGENT_SETTINGS,
} from './settings/defaults.js';

export {
  VALID_MODES,
  VALID_PROVIDER_SOURCES,
  VALID_LANGUAGES,
  MODE_TIER_MAP,
  normalizeSettings,
  validateSettings,
} from './settings/schema.js';

// ─── Models ─────────────────────────────────────────────────────────────────
export { resolveTier, resolveModelId } from './models/tiers.js';

// ─── Tools ──────────────────────────────────────────────────────────────────
export {
  TOOL_REGISTRY,
  getToolEntry,
  getToolByCommand,
  getAutonomousTools,
  getToolDefinitions,
  BaseTool,
  DeadCodeTool,
  LintTool,
  CommitTool,
  CommentsTool,
  TldrTool,
  BranchDiffTool,
  DiffResolveTool,
} from './tools/index.js';
export type { ToolRegistryEntry } from './tools/index.js';

// ─── Agent ───────────────────────────────────────────────────────────────────
export { runAgentLoop, buildSystemPrompt } from './agent/index.js';
export type {
  AgentConfig,
  AgentAction,
  AgentToolCallAction,
  AgentConfirmationAction,
  AgentResponseAction,
  AgentErrorAction,
  ConversationTurn,
} from './agent/index.js';

// ─── Git Operations ─────────────────────────────────────────────────────────
export {
  // Executor
  execGit,
  execGitStrict,
  isGitRepo,
  getRepoRoot,
  // Status
  getChangedFiles,
  getStagedFiles,
  getUnstagedFiles,
  // Log
  getLog,
  getCommitCount,
  // Blame
  getBlame,
  getFileAge,
  // Staging & Commit
  stageFiles,
  stageAll,
  unstageFiles,
  createCommit,
  getDiffSummary,
  getStagedDiff,
  autoStage,
  amendCommit,
  getLastCommitInfo,
  // Branch
  getCurrentBranch,
  getTrackingBranch,
  getAheadBehind,
  fetchRemote,
  getRemoteDiff,
  getRemoteDiffSummary,
  getRemoteLog,
  // Conflicts
  isInMergeState,
  isInConflictState,
  getConflictFiles,
  parseConflictMarkers,
  readConflictFile,
  writeResolution,
  // Hooks
  checkHooks,
  // Validation
  validateCommitMessage,
} from './git/index.js';

export type {
  GitExecOptions,
  GitExecResult,
  GitLogEntry,
  GitLogOptions,
  BlameRange,
  BlameOptions,
  AheadBehind,
  LastCommitInfo,
} from './git/index.js';

// ─── Utils ──────────────────────────────────────────────────────────────────
export { generateId, emptyScanSummary, buildScanSummary } from './utils/index.js';
