import type { ToolId } from '../types/index.js';

// Re-export the base class for tool implementations
export { BaseTool } from './base-tool.js';

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
}

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
  },
  {
    id: 'lint',
    name: 'Lint & Best Practice',
    description: 'Run linters and model-driven analysis for code smells and best practices.',
    chatCommand: 'lint',
    commandId: 'aidev.scanLint',
  },
  {
    id: 'comments',
    name: 'Comment Pruning',
    description: 'Identify stale, verbose, or low-value comments for cleanup.',
    chatCommand: 'comments',
    commandId: 'aidev.pruneComments',
  },
  {
    id: 'commit',
    name: 'Auto-Commit',
    description: 'Stage changed files and generate a commit message for approval.',
    chatCommand: 'commit',
    commandId: 'aidev.autoCommit',
  },
  {
    id: 'tldr',
    name: 'TLDR',
    description: 'Summarize recent changes for a file, directory, or project.',
    chatCommand: 'tldr',
    commandId: 'aidev.tldr',
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
