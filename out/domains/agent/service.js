"use strict";
/**
 * Agent Domain Service — discover and manage agent definitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentDomainService = exports.AGENT_COMMANDS = void 0;
exports.createAgentDomain = createAgentDomain;
const types_1 = require("../../types");
const handlers_1 = require("./handlers");
const agent_registry_1 = require("../../infrastructure/agent-registry");
/**
 * Agent domain commands.
 */
exports.AGENT_COMMANDS = ["agent.list"];
class AgentDomainService {
    constructor(logger, workspaceRoot, extensionPath) {
        this.name = "agent";
        this.handlers = {};
        this.agentCache = new Map();
        this.logger = logger;
        this.workspaceRoot = workspaceRoot;
        this.extensionPath = extensionPath;
        // Initialize handlers
        this.handlers = {
            "agent.list": (0, handlers_1.createListAgentsHandler)(this.logger, () => this.discoverAgents()),
        };
    }
    /**
     * Initialize domain — discover agents.
     */
    async initialize() {
        try {
            this.logger.info("Initializing agent domain", "AgentDomainService.initialize");
            const discovered = this.discoverAgents();
            this.logger.info(`Discovered ${discovered.size} agents`, "AgentDomainService.initialize");
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "AGENT_INIT_ERROR",
                message: "Failed to initialize agent domain",
                details: err,
                context: "AgentDomainService.initialize",
            });
        }
    }
    /**
     * Teardown — clear caches.
     */
    async teardown() {
        this.logger.debug("Tearing down agent domain", "AgentDomainService.teardown");
        this.agentCache.clear();
    }
    /**
     * Discover agents from bundled and workspace locations.
     */
    discoverAgents() {
        this.agentCache = (0, agent_registry_1.loadAgents)(this.workspaceRoot, this.extensionPath);
        return this.agentCache;
    }
}
exports.AgentDomainService = AgentDomainService;
/**
 * Factory function — creates and returns agent domain service.
 */
function createAgentDomain(logger, workspaceRoot, extensionPath) {
    return new AgentDomainService(logger, workspaceRoot, extensionPath);
}
//# sourceMappingURL=service.js.map