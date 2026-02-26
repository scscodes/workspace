/**
 * Chat/Copilot Domain Service — local context gathering.
 */
import { DomainService, ChatCommandName, Handler, Logger, GitProvider, Result } from "../../types";
/**
 * Chat domain commands.
 */
export declare const CHAT_COMMANDS: ChatCommandName[];
export declare class ChatDomainService implements DomainService {
    readonly name = "chat";
    handlers: Partial<Record<ChatCommandName, Handler>>;
    private logger;
    constructor(gitProvider: GitProvider, logger: Logger);
    /**
     * Initialize domain.
     */
    initialize(): Promise<Result<void>>;
    /**
     * Cleanup.
     */
    teardown(): Promise<void>;
}
/**
 * Factory function — creates and returns chat domain service.
 */
export declare function createChatDomain(gitProvider: GitProvider, logger: Logger): ChatDomainService;
//# sourceMappingURL=service.d.ts.map