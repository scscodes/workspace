/**
 * Agent Domain Service — discover and manage agent definitions.
 */

import {
  DomainService,
  AgentCommandName,
  Handler,
  Logger,
  Result,
  failure,
  success,
  AgentDefinition,
} from "../../types";
import { createListAgentsHandler } from "./handlers";
import { loadAgents } from "../../infrastructure/agent-registry";

/**
 * Agent domain commands.
 */
export const AGENT_COMMANDS: AgentCommandName[] = ["agent.list"];

export class AgentDomainService implements DomainService {
  readonly name = "agent";

  handlers: Partial<Record<AgentCommandName, Handler>> = {};
  private logger: Logger;
  private workspaceRoot?: string;
  private extensionPath?: string;
  private agentCache: Map<string, AgentDefinition> = new Map();

  constructor(logger: Logger, workspaceRoot?: string, extensionPath?: string) {
    this.logger = logger;
    this.workspaceRoot = workspaceRoot;
    this.extensionPath = extensionPath;

    // Initialize handlers
    this.handlers = {
      "agent.list": createListAgentsHandler(this.logger, () =>
        this.discoverAgents()
      ) as any,
    };
  }

  /**
   * Initialize domain — discover agents.
   */
  async initialize(): Promise<Result<void>> {
    try {
      this.logger.info(
        "Initializing agent domain",
        "AgentDomainService.initialize"
      );

      const discovered = this.discoverAgents();
      this.logger.info(
        `Discovered ${discovered.size} agents`,
        "AgentDomainService.initialize"
      );

      return success(void 0);
    } catch (err) {
      return failure({
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
  async teardown(): Promise<void> {
    this.logger.debug(
      "Tearing down agent domain",
      "AgentDomainService.teardown"
    );
    this.agentCache.clear();
  }

  /**
   * Discover agents from bundled and workspace locations.
   */
  private discoverAgents(): Map<string, AgentDefinition> {
    this.agentCache = loadAgents(this.workspaceRoot, this.extensionPath);
    return this.agentCache;
  }
}

/**
 * Factory function — creates and returns agent domain service.
 */
export function createAgentDomain(
  logger: Logger,
  workspaceRoot?: string,
  extensionPath?: string
): AgentDomainService {
  return new AgentDomainService(logger, workspaceRoot, extensionPath);
}
