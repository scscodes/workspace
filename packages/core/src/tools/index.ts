import type { ToolId, ToolInvocationMode, ToolDefinition } from '../types/index.js';

// Re-export the base class for tool implementations
export { BaseTool } from './base-tool.js';

// Export tool classes for VSCode extension to instantiate
export { DeadCodeTool } from './dead-code/index.js';
export { LintTool } from './lint/index.js';
export { CommitTool } from './commit/index.js';
export { CommentsTool } from './comments/index.js';
export { TldrTool } from './tldr/index.js';
export { BranchDiffTool } from './branch-diff/index.js';
export { DiffResolveTool } from './diff-resolve/index.js';
export { PRReviewTool } from './pr-review/index.js';

/**
 * Metadata for a registered tool.
 * Used by chat participant routing, sidebar display, and command registration.
 */
export interface ToolRegistryEntry {
  /** Must match a ToolId */
  id: ToolId;
  /** Human-readable name */
  name: string;
  /** Short description for UI and chat help text */
  description: string;
  /** Chat command name (used as @aidev /command) */
  chatCommand: string;
  /** VSCode command ID */
  commandId: string;
  /** Whether the model can invoke this tool autonomously or needs user confirmation */
  invocation: ToolInvocationMode;
  /** JSON Schema describing the tool's input parameters for LLM tool calling */
  inputSchema: Record<string, unknown>;
}

/** Standard input schema for scan-based tools — optional file/directory paths */
const STANDARD_SCAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'File or directory paths to analyze. Omit for entire workspace.',
    },
  },
};

/**
 * Central registry of all analysis tools.
 *
 * SINGLE SOURCE OF TRUTH — never hardcode tool names, commands, or
 * descriptions elsewhere. Import from here.
 */
export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [
  {
    id: 'dead-code',
    name: 'Dead Code Discovery',
    description: 'Find unused exports, unreachable code, unused files, and dead variables.',
    chatCommand: 'deadcode',
    commandId: 'aidev.scanDeadCode',
    invocation: 'autonomous',
    inputSchema: STANDARD_SCAN_SCHEMA,
  },
  {
    id: 'lint',
    name: 'Lint & Best Practice',
    description: 'Run linters and model-driven analysis for code smells and best practices.',
    chatCommand: 'lint',
    commandId: 'aidev.scanLint',
    invocation: 'autonomous',
    inputSchema: STANDARD_SCAN_SCHEMA,
  },
  {
    id: 'comments',
    name: 'Comment Pruning',
    description: 'Identify stale, verbose, or low-value comments for cleanup.',
    chatCommand: 'comments',
    commandId: 'aidev.pruneComments',
    invocation: 'restricted',
    inputSchema: STANDARD_SCAN_SCHEMA,
  },
  {
    id: 'commit',
    name: 'Auto-Commit',
    description: 'Stage changed files and generate a commit message for approval, or apply/amend a commit.',
    chatCommand: 'commit',
    commandId: 'aidev.autoCommit',
    invocation: 'restricted',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['propose', 'apply', 'amend'],
          description: 'propose = generate message, apply = create commit, amend = amend last commit. Default: propose.',
        },
        message: {
          type: 'string',
          description: 'Commit message (required for apply/amend).',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to include (default: all changed).',
        },
      },
    },
  },
  {
    id: 'tldr',
    name: 'TLDR',
    description: 'Summarize recent changes for a file, directory, or project.',
    chatCommand: 'tldr',
    commandId: 'aidev.tldr',
    invocation: 'autonomous',
    inputSchema: STANDARD_SCAN_SCHEMA,
  },
  {
    id: 'branch-diff',
    name: 'Branch Diff',
    description: 'Compare local branch against its remote tracking branch. Shows ahead/behind, incoming/outgoing commits, and diffs.',
    chatCommand: 'branchdiff',
    commandId: 'aidev.branchDiff',
    invocation: 'autonomous',
    inputSchema: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (default: origin).',
        },
        fetch: {
          type: 'boolean',
          description: 'Fetch latest from remote before comparing (default: true).',
        },
      },
    },
  },
  {
    id: 'diff-resolve',
    name: 'Diff Resolver',
    description: 'Detect and resolve merge conflicts. Auto-resolves safe diffs, uses the model for complex conflicts.',
    chatCommand: 'resolve',
    commandId: 'aidev.diffResolve',
    invocation: 'restricted',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to resolve (default: all conflicts).',
        },
        autoApplySafe: {
          type: 'boolean',
          description: 'Auto-apply safe resolutions without listing them (default: false).',
        },
      },
    },
  },
  {
    id: 'pr-review',
    name: 'PR Review',
    description: 'Review a pull request: lint, dead-code detection, and semantic analysis of the diff.',
    chatCommand: 'prreview',
    commandId: 'aidev.prReview',
    invocation: 'restricted',
    inputSchema: {
      type: 'object',
      properties: {
        prNumber: {
          type: 'number',
          description: 'PR number to review (required).',
        },
        repo: {
          type: 'string',
          description: 'Repository in owner/repo format (optional, uses current repo if not specified).',
        },
        postComments: {
          type: 'boolean',
          description: 'Post review summary as a comment on the PR (default: false).',
        },
      },
      required: ['prNumber'],
    },
  },
] as const;

/**
 * Look up a tool by its ID. Returns undefined if not found.
 */
export function getToolEntry(id: ToolId): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

/**
 * Look up a tool by its chat command name. Returns undefined if not found.
 */
export function getToolByCommand(command: string): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY.find((t) => t.chatCommand === command);
}

/**
 * Return all tools the model may invoke without user confirmation.
 */
export function getAutonomousTools(): readonly ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter((t) => t.invocation === 'autonomous');
}

/**
 * Build an array of ToolDefinitions suitable for LLM tool-calling payloads.
 * Optionally filter by invocation mode.
 */
export function getToolDefinitions(filter?: ToolInvocationMode): ToolDefinition[] {
  const entries = filter
    ? TOOL_REGISTRY.filter((t) => t.invocation === filter)
    : [...TOOL_REGISTRY];
  return entries.map((t) => ({
    name: t.chatCommand,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}
