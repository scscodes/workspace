"use strict";
/**
 * Agent Domain Handlers — list agents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createListAgentsHandler = createListAgentsHandler;
const types_1 = require("../../types");
/**
 * agent.list — Show all available agent definitions.
 */
function createListAgentsHandler(logger, discoverAgents) {
    return async (_ctx) => {
        try {
            logger.debug("Listing agents", "AgentListHandler");
            const agents = discoverAgents();
            const agentList = Array.from(agents.values()).map((a) => ({
                id: a.id,
                description: a.description,
                version: a.version,
                capabilities: a.capabilities,
                workflowTriggers: a.workflowTriggers,
            }));
            return (0, types_1.success)({
                agents: agentList,
                count: agentList.length,
            });
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "AGENT_LIST_ERROR",
                message: "Failed to list agents",
                details: err,
                context: "agent.list",
            });
        }
    };
}
//# sourceMappingURL=handlers.js.map