/**
 * Chat/Copilot Domain Service — local context gathering and task delegation.
 */
import { DomainService, ChatCommandName, Handler, Logger, GitProvider, Result } from "../../types";
import { CommandDispatcher } from "./handlers";
/**
 * Chat domain commands.
 */
export declare const CHAT_COMMANDS: ChatCommandName[];
export declare class ChatDomainService implements DomainService {
    readonly name = "chat";
    handlers: Partial<Record<ChatCommandName, Handler>>;
    private logger;
    constructor(gitProvider: GitProvider, logger: Logger, dispatcher: CommandDispatcher);
    initialize(): Promise<Result<void>>;
    teardown(): Promise<void>;
}
/**
 * Factory function — creates and returns chat domain service.
 */
export declare function createChatDomain(gitProvider: GitProvider, logger: Logger, dispatcher: CommandDispatcher): ChatDomainService;
//# sourceMappingURL=service.d.ts.map