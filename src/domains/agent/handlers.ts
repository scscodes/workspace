/**
 * Agent Domain Handlers — list agents.
 */

import {
  Handler,
  CommandContext,
  Logger,
  AgentDefinition,
  Result,
  success,
  failure,
} from "../../types";
import { ListAgentsResult } from "./types";

/**
 * agent.list — Show all available agent definitions.
 */
export function createListAgentsHandler(
  logger: Logger,
  discoverAgents: () => Map<string, AgentDefinition>
): Handler<Record<string, unknown>, ListAgentsResult> {
  return async (_ctx: CommandContext): Promise<Result<ListAgentsResult>> => {
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

      return success({
        agents: agentList,
        count: agentList.length,
      });
    } catch (err) {
      return failure({
        code: "AGENT_LIST_ERROR",
        message: "Failed to list agents",
        details: err,
        context: "agent.list",
      });
    }
  };
}
