import type { ToolId } from '../types/index.js';

/**
 * A workflow definition: a named intent pattern that maps to an ordered sequence of tools.
 * Used by the chat participant to short-circuit the agent loop and run a fixed tool chain.
 */
export interface WorkflowDefinition {
  /** Unique workflow ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Keywords/phrases that trigger this workflow (lowercase) */
  triggers: string[];
  /** Tool IDs to run in sequence */
  toolIds: ToolId[];
  /** Description for the /workflow help command */
  description: string;
}

/**
 * Central registry of all workflows.
 * Each workflow represents a high-level intent pattern.
 */
export const WORKFLOW_REGISTRY: readonly WorkflowDefinition[] = [
  {
    id: 'fix',
    name: 'Quick Fix',
    description: 'Find and fix issues fast: linting, dead code, and auto-commit.',
    triggers: ['fix', 'broken', 'failing', 'quick fix'],
    toolIds: ['lint', 'dead-code', 'commit'],
  },
  {
    id: 'prep-pr',
    name: 'Prepare for PR',
    description: 'Get ready to ship: branch diff, summary, and auto-commit.',
    triggers: ['prep pr', 'prepare pr', 'ready for pr', 'ship it', 'prep for review'],
    toolIds: ['branch-diff', 'tldr', 'commit'],
  },
  {
    id: 'review',
    name: 'Code Review',
    description: 'Audit the codebase: dead code, linting, and comments.',
    triggers: ['review', 'audit', 'code review', 'check code'],
    toolIds: ['dead-code', 'lint', 'comments'],
  },
] as const;

/**
 * Match free-form user input to a workflow by substring/keyword matching.
 * Uses case-insensitive, whitespace-trimmed matching.
 *
 * Returns the first matching workflow, or undefined if no match.
 *
 * @param input - User message to match
 * @returns Matching WorkflowDefinition, or undefined
 */
export function matchWorkflow(input: string): WorkflowDefinition | undefined {
  const normalized = input.toLowerCase().trim();

  for (const workflow of WORKFLOW_REGISTRY) {
    for (const trigger of workflow.triggers) {
      if (normalized.includes(trigger)) {
        return workflow;
      }
    }
  }

  return undefined;
}
