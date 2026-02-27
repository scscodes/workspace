/**
 * Chat/Copilot Domain Handlers — local context gathering and task delegation.
 */
import { Handler, CommandContext, Command, Result, ChatContext, Logger, GitProvider } from "../../types";
/**
 * chat.context — Gather chat context from workspace + git.
 * Returns active file path, current git branch, and git status.
 */
export declare function createContextHandler(gitProvider: GitProvider, logger: Logger): Handler<Record<string, never>, ChatContext>;
export interface DelegateParams {
    task: string;
    workflow?: string;
}
export interface DelegateResult {
    dispatched: boolean;
    workflow?: string;
    message: string;
}
/** Minimal dispatcher interface; satisfied by CommandRouter.dispatch */
export type CommandDispatcher = (command: Command, ctx: CommandContext) => Promise<Result<unknown>>;
/**
 * chat.delegate — Backend command dispatcher.
 * If params.workflow is provided, dispatches "workflow.run" via the injected dispatcher.
 * No LLM calls, no chat UI — pure backend routing.
 */
export declare function createDelegateHandler(dispatcher: CommandDispatcher, logger: Logger): Handler<DelegateParams, DelegateResult>;
//# sourceMappingURL=handlers.d.ts.map