/**
 * Agent Domain Handlers — list agents.
 */
import { Handler, Logger, AgentDefinition } from "../../types";
import { ListAgentsResult } from "./types";
/**
 * agent.list — Show all available agent definitions.
 */
export declare function createListAgentsHandler(logger: Logger, discoverAgents: () => Map<string, AgentDefinition>): Handler<Record<string, unknown>, ListAgentsResult>;
//# sourceMappingURL=handlers.d.ts.map