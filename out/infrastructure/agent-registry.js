"use strict";
/**
 * Agent Registry — discover, load, and validate agent definitions from .vscode/agents/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAgentDefinition = validateAgentDefinition;
exports.loadAgents = loadAgents;
exports.getAgent = getAgent;
exports.listAgents = listAgents;
exports.findAgentsByCapability = findAgentsByCapability;
exports.findAgentsByWorkflowTrigger = findAgentsByWorkflowTrigger;
const workspace_1 = require("./workspace");
/**
 * Validate agent definition against schema.
 */
function validateAgentDefinition(data) {
    if (typeof data !== "object" || data === null) {
        return false;
    }
    const obj = data;
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
function loadAgents(workspaceRoot) {
    const agentsDir = (0, workspace_1.getAgentsDir)(workspaceRoot);
    const agents = new Map();
    const files = (0, workspace_1.listJsonFiles)(agentsDir);
    for (const filePath of files) {
        const data = (0, workspace_1.readJsonFile)(filePath);
        if (validateAgentDefinition(data)) {
            agents.set(data.id, data);
        }
    }
    return agents;
}
/**
 * Get agent by ID.
 */
function getAgent(id, workspaceRoot) {
    const agents = loadAgents(workspaceRoot);
    return agents.get(id) || null;
}
/**
 * List all agent IDs.
 */
function listAgents(workspaceRoot) {
    const agents = loadAgents(workspaceRoot);
    return Array.from(agents.keys()).sort();
}
/**
 * Get agents that can execute a specific command.
 */
function findAgentsByCapability(commandName, workspaceRoot) {
    const agents = loadAgents(workspaceRoot);
    return Array.from(agents.values()).filter((agent) => agent.capabilities.includes(commandName));
}
/**
 * Get agents that can trigger a specific workflow.
 */
function findAgentsByWorkflowTrigger(workflowName, workspaceRoot) {
    const agents = loadAgents(workspaceRoot);
    return Array.from(agents.values()).filter((agent) => agent.workflowTriggers?.includes(workflowName));
}
//# sourceMappingURL=agent-registry.js.map