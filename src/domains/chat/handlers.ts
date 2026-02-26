/**
 * Chat/Copilot Domain Handlers — local context gathering.
 */

import {
  Handler,
  CommandContext,
  success,
  failure,
  ChatContext,
  Logger,
  GitProvider,
} from "../../types";

/**
 * Example: chat.context — Gather chat context from workspace + git.
 * Used to seed copilot context window.
 */
export function createContextHandler(
  gitProvider: GitProvider,
  logger: Logger
): Handler<any, ChatContext> {
  return async (_ctx: CommandContext) => {
    try {
      logger.info("Gathering chat context", "ChatContextHandler");

      // Get current git status
      const statusResult = await gitProvider.status();
      const gitStatus =
        statusResult.kind === "ok" ? statusResult.value : undefined;

      const chatCtx: ChatContext = {
        activeFile: _ctx.activeFilePath,
        gitBranch: gitStatus?.branch,
        gitStatus: gitStatus,
      };

      logger.debug(
        `Context gathered: file=${chatCtx.activeFile}, branch=${chatCtx.gitBranch}`,
        "ChatContextHandler"
      );

      return success(chatCtx);
    } catch (err) {
      return failure({
        code: "CHAT_CONTEXT_ERROR",
        message: "Failed to gather chat context",
        details: err,
        context: "chat.context",
      });
    }
  };
}

/**
 * Example: chat.delegate — Local task delegation (placeholder).
 * Future: could spawn workflows or local background tasks.
 */
export function createDelegateHandler(
  logger: Logger
): Handler<any, any> {
  return async (
    _ctx: CommandContext,
    params: any = {}
  ) => {
    try {
      logger.info(
        `Delegating local task: ${params.taskType}`,
        "ChatDelegateHandler"
      );

      // Placeholder — in real extension, could trigger workflows
      const message = `Local task delegation: ${params.taskType} (payload: ${JSON.stringify(params.payload).substring(0, 50)}...)`;

      logger.info(message, "ChatDelegateHandler");

      return success({
        success: true,
        message,
      });
    } catch (err) {
      return failure({
        code: "CHAT_DELEGATE_ERROR",
        message: "Failed to delegate local task",
        details: err,
        context: "chat.delegate",
      });
    }
  };
}
