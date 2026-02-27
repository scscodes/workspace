"use strict";
/**
 * Agent Registry — discover, load, and validate agent definitions from .vscode/agents/
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAgentDefinition = validateAgentDefinition;
exports.loadAgents = loadAgents;
exports.getAgent = getAgent;
exports.listAgents = listAgents;
exports.findAgentsByCapability = findAgentsByCapability;
exports.findAgentsByWorkflowTrigger = findAgentsByWorkflowTrigger;
const path = __importStar(require("path"));
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
 * Load agent definitions from bundled and workspace locations.
 * Workspace definitions override bundled ones (same id).
 */
function loadAgents(workspaceRoot, extensionPath) {
    const agents = new Map();
    // Load bundled agents first
    if (extensionPath) {
        const bundledDir = path.join(extensionPath, "bundled", "agents");
        const files = (0, workspace_1.listJsonFiles)(bundledDir);
        for (const filePath of files) {
            const data = (0, workspace_1.readJsonFile)(filePath);
            if (validateAgentDefinition(data)) {
                agents.set(data.id, data);
            }
        }
    }
    // Load workspace agents (overrides bundled)
    const workspaceDir = (0, workspace_1.getAgentsDir)(workspaceRoot);
    const files = (0, workspace_1.listJsonFiles)(workspaceDir);
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
function getAgent(id, workspaceRoot, extensionPath) {
    const agents = loadAgents(workspaceRoot, extensionPath);
    return agents.get(id) || null;
}
/**
 * List all agent IDs.
 */
function listAgents(workspaceRoot, extensionPath) {
    const agents = loadAgents(workspaceRoot, extensionPath);
    return Array.from(agents.keys()).sort();
}
/**
 * Get agents that can execute a specific command.
 */
function findAgentsByCapability(commandName, workspaceRoot, extensionPath) {
    const agents = loadAgents(workspaceRoot, extensionPath);
    return Array.from(agents.values()).filter((agent) => agent.capabilities.includes(commandName));
}
/**
 * Get agents that can trigger a specific workflow.
 */
function findAgentsByWorkflowTrigger(workflowName, workspaceRoot, extensionPath) {
    const agents = loadAgents(workspaceRoot, extensionPath);
    return Array.from(agents.values()).filter((agent) => agent.workflowTriggers?.includes(workflowName));
}
//# sourceMappingURL=agent-registry.js.map