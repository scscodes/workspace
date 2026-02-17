import type { ExtensionSettings, CommitConstraints, ModelTierMap, AgentSettings } from '../types/index.js';

// ─── Commit Constraints ─────────────────────────────────────────────────────

/** Minimum commit message length (characters) */
const COMMIT_MIN_LENGTH = 10;

/** Maximum first-line length (characters) — conventional git standard */
const COMMIT_MAX_LENGTH = 72;

export const DEFAULT_COMMIT_CONSTRAINTS: CommitConstraints = {
  minLength: COMMIT_MIN_LENGTH,
  maxLength: COMMIT_MAX_LENGTH,
  prefix: '',
  suffix: '',
  enforcement: 'warn',
};

// ─── Model Tiers ────────────────────────────────────────────────────────────

/**
 * Default model tier assignments.
 * Empty strings mean "not yet configured" — the provider will use
 * whatever is available, or prompt the user to assign models.
 */
export const DEFAULT_MODEL_TIERS: ModelTierMap = {
  high: '',
  mid: '',
  low: '',
};

// ─── Agent Settings ──────────────────────────────────────────────────────────

/** Maximum tool-call round-trips per conversation turn */
const AGENT_DEFAULT_MAX_TURNS = 10;

/** Maximum total tokens (input + output) per agent run */
const AGENT_DEFAULT_MAX_TOKEN_BUDGET = 32000;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  maxTurns: AGENT_DEFAULT_MAX_TURNS,
  maxTokenBudget: AGENT_DEFAULT_MAX_TOKEN_BUDGET,
  systemPrompt: '',
};

// ─── Tool Limits ──────────────────────────────────────────────────────────────

/** Maximum file content length to send to model (characters) */
export const TOOL_MAX_FILE_CONTENT_LENGTH = 10_000;

/** Maximum files to analyze per tool run (safety bound) */
export const TOOL_MAX_FILES_PER_RUN = 200;

/** Maximum diff lines to include in prompts/results */
export const TOOL_MAX_DIFF_LINES = 500;

/** Maximum context lines around conflicts for model prompts */
export const TOOL_MAX_CONTEXT_LINES = 50;

/** Maximum commits to include in TLDR prompt */
export const TOOL_MAX_COMMITS_FOR_PROMPT = 100;

/** Comments older than this (in days) are flagged as stale */
export const TOOL_STALE_COMMENT_THRESHOLD_DAYS = 180;

/** Default days to look back for TLDR summaries */
export const TOOL_DEFAULT_SINCE_DAYS = 14;

/** Batch size for parallel file processing */
export const TOOL_MODEL_BATCH_SIZE = 5;

/** Timeout for model requests (milliseconds) */
export const TOOL_MODEL_TIMEOUT_MS = 30_000;

// ─── Root Settings ──────────────────────────────────────────────────────────

/**
 * Complete default settings.
 * Every configurable value lives here — no magic numbers elsewhere.
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  mode: 'balanced',
  modelTiers: DEFAULT_MODEL_TIERS,
  providerSource: 'ide',
  enabledLanguages: ['typescript', 'javascript', 'python'],
  commitConstraints: DEFAULT_COMMIT_CONSTRAINTS,
  preCommitDryRun: true,
  agent: DEFAULT_AGENT_SETTINGS,
};
