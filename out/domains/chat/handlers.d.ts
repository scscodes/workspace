/**
 * Chat/Copilot Domain Handlers — local context gathering.
 */
import { Handler, ChatContext, Logger, GitProvider } from "../../types";
/**
 * Example: chat.context — Gather chat context from workspace + git.
 * Used to seed copilot context window.
 */
export declare function createContextHandler(gitProvider: GitProvider, logger: Logger): Handler<any, ChatContext>;
/**
 * Example: chat.delegate — Local task delegation (placeholder).
 * Future: could spawn workflows or local background tasks.
 */
export declare function createDelegateHandler(logger: Logger): Handler<any, any>;
//# sourceMappingURL=handlers.d.ts.map