"use strict";
/**
 * Chat/Copilot Domain Handlers — local context gathering.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContextHandler = createContextHandler;
exports.createDelegateHandler = createDelegateHandler;
const types_1 = require("../../types");
/**
 * Example: chat.context — Gather chat context from workspace + git.
 * Used to seed copilot context window.
 */
function createContextHandler(gitProvider, logger) {
    return async (_ctx) => {
        try {
            logger.info("Gathering chat context", "ChatContextHandler");
            // Get current git status
            const statusResult = await gitProvider.status();
            const gitStatus = statusResult.kind === "ok" ? statusResult.value : undefined;
            const chatCtx = {
                activeFile: _ctx.activeFilePath,
                gitBranch: gitStatus?.branch,
                gitStatus: gitStatus,
            };
            logger.debug(`Context gathered: file=${chatCtx.activeFile}, branch=${chatCtx.gitBranch}`, "ChatContextHandler");
            return (0, types_1.success)(chatCtx);
        }
        catch (err) {
            return (0, types_1.failure)({
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
function createDelegateHandler(logger) {
    return async (_ctx, params = {}) => {
        try {
            logger.info(`Delegating local task: ${params.taskType}`, "ChatDelegateHandler");
            // Placeholder — in real extension, could trigger workflows
            const message = `Local task delegation: ${params.taskType} (payload: ${JSON.stringify(params.payload).substring(0, 50)}...)`;
            logger.info(message, "ChatDelegateHandler");
            return (0, types_1.success)({
                success: true,
                message,
            });
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "CHAT_DELEGATE_ERROR",
                message: "Failed to delegate local task",
                details: err,
                context: "chat.delegate",
            });
        }
    };
}
//# sourceMappingURL=handlers.js.map