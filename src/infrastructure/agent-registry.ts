/**
 * Agent Registry — discover, load, and validate agent definitions from .vscode/agents/
 */

import { AgentDefinition } from "../types";
import {
  getAgentsDir,
  listJsonFiles,
  readJsonFile,
} from "./workspace";

/**
 * Validate agent definition against schema.
 */
export function validateAgentDefinition(data: unknown): data is AgentDefinition {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (typeof obj.id !== "string" || !obj.id) {
    return false;
  }

  if (!Array.isArray(obj.capabilities)) {
    return false;
  }

  // Optional fields
  if (obj.description !== undefined && typeof obj.description !== "string") {
    return false;
  }

  if (obj.version !== undefined && typeof obj.version !== "string") {
    return false;
  }

  if (obj.workflowTriggers !== undefined && !Array.isArray(obj.workflowTriggers)) {
    return false;
  }

  if (obj.metadata !== undefined && typeof obj.metadata !== "object") {
    return false;
  }

  return true;
}

/**
 * Load agent definitions from .vscode/agents/
 */
export function loadAgents(workspaceRoot?: string): Map<string, AgentDefinition> {
  const agentsDir = getAgentsDir(workspaceRoot);
  const agents = new Map<string, AgentDefinition>();

  const files = listJsonFiles(agentsDir);
  for (const filePath of files) {
    const data = readJsonFile(filePath);
    if (validateAgentDefinition(data)) {
      agents.set(data.id, data);
    }
  }

  return agents;
}

/**
 * Get agent by ID.
 */
export function getAgent(
  id: string,
  workspaceRoot?: string
): AgentDefinition | null {
  const agents = loadAgents(workspaceRoot);
  return agents.get(id) || null;
}

/**
 * List all agent IDs.
 */
export function listAgents(workspaceRoot?: string): string[] {
  const agents = loadAgents(workspaceRoot);
  return Array.from(agents.keys()).sort();
}

/**
 * Get agents that can execute a specific command.
 */
export function findAgentsByCapability(
  commandName: string,
  workspaceRoot?: string
): AgentDefinition[] {
  const agents = loadAgents(workspaceRoot);
  return Array.from(agents.values()).filter((agent) =>
    agent.capabilities.includes(commandName as any)
  );
}

/**
 * Get agents that can trigger a specific workflow.
 */
export function findAgentsByWorkflowTrigger(
  workflowName: string,
  workspaceRoot?: string
): AgentDefinition[] {
  const agents = loadAgents(workspaceRoot);
  return Array.from(agents.values()).filter((agent) =>
    agent.workflowTriggers?.includes(workflowName)
  );
}
