/**
 * Agent Domain Service — discover and manage agent definitions.
 */
import { DomainService, AgentCommandName, Handler, Logger, Result } from "../../types";
/**
 * Agent domain commands.
 */
export declare const AGENT_COMMANDS: AgentCommandName[];
export declare class AgentDomainService implements DomainService {
    readonly name = "agent";
    handlers: Partial<Record<AgentCommandName, Handler>>;
    private logger;
    private agentCache;
    constructor(logger: Logger);
    /**
     * Initialize domain — discover agents.
     */
    initialize(): Promise<Result<void>>;
    /**
     * Teardown — clear caches.
     */
    teardown(): Promise<void>;
    /**
     * Discover agents from .vscode/agents/
     */
    private discoverAgents;
}
/**
 * Factory function — creates and returns agent domain service.
 */
export declare function createAgentDomain(logger: Logger): AgentDomainService;
//# sourceMappingURL=service.d.ts.map