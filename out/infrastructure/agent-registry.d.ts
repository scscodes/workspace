/**
 * Agent Registry — discover, load, and validate agent definitions from .vscode/agents/
 */
import { AgentDefinition } from "../types";
/**
 * Validate agent definition against schema.
 */
export declare function validateAgentDefinition(data: unknown): data is AgentDefinition;
/**
 * Load agent definitions from bundled and workspace locations.
 * Workspace definitions override bundled ones (same id).
 */
export declare function loadAgents(workspaceRoot?: string, extensionPath?: string): Map<string, AgentDefinition>;
/**
 * Get agent by ID.
 */
export declare function getAgent(id: string, workspaceRoot?: string, extensionPath?: string): AgentDefinition | null;
/**
 * List all agent IDs.
 */
export declare function listAgents(workspaceRoot?: string, extensionPath?: string): string[];
/**
 * Get agents that can execute a specific command.
 */
export declare function findAgentsByCapability(commandName: string, workspaceRoot?: string, extensionPath?: string): AgentDefinition[];
/**
 * Get agents that can trigger a specific workflow.
 */
export declare function findAgentsByWorkflowTrigger(workflowName: string, workspaceRoot?: string, extensionPath?: string): AgentDefinition[];
//# sourceMappingURL=agent-registry.d.ts.map