/**
 * Agent domain types and interfaces.
 */

/**
 * Result of listing agents.
 */
export interface ListAgentsResult {
  agents: AgentInfo[];
  count: number;
}

/**
 * Agent information summary.
 */
export interface AgentInfo {
  id: string;
  description?: string;
  version?: string;
  capabilities: string[];
  workflowTriggers?: string[];
}
