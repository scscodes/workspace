/**
 * Agent Registry — discover, load, and validate agent definitions from .vscode/agents/
 */
import { AgentDefinition } from "../types";
/**
 * Validate agent definition against schema.
 */
export declare function validateAgentDefinition(data: unknown): data is AgentDefinition;
/**
 * Load agent definitions from .vscode/agents/
 */
export declare function loadAgents(workspaceRoot?: string): Map<string, AgentDefinition>;
/**
 * Get agent by ID.
 */
export declare function getAgent(id: string, workspaceRoot?: string): AgentDefinition | null;
/**
 * List all agent IDs.
 */
export declare function listAgents(workspaceRoot?: string): string[];
/**
 * Get agents that can execute a specific command.
 */
export declare function findAgentsByCapability(commandName: string, workspaceRoot?: string): AgentDefinition[];
/**
 * Get agents that can trigger a specific workflow.
 */
export declare function findAgentsByWorkflowTrigger(workflowName: string, workspaceRoot?: string): AgentDefinition[];
//# sourceMappingURL=agent-registry.d.ts.map