"use strict";
/**
 * Chat/Copilot Domain Handlers — local context gathering and task delegation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContextHandler = createContextHandler;
exports.createDelegateHandler = createDelegateHandler;
const types_1 = require("../../types");
// ============================================================================
// Context Handler
// ============================================================================
/**
 * chat.context — Gather chat context from workspace + git.
 * Returns active file path, current git branch, and git status.
 */
function createContextHandler(gitProvider, logger) {
    return async (ctx) => {
        try {
            logger.info("Gathering chat context", "ChatContextHandler");
            const statusResult = await gitProvider.status();
            const gitStatus = statusResult.kind === "ok" ? statusResult.value : undefined;
            const chatCtx = {
                activeFile: ctx.activeFilePath,
                gitBranch: gitStatus?.branch,
                gitStatus,
            };
            logger.debug(`Context gathered: file=${chatCtx.activeFile ?? "none"}, branch=${chatCtx.gitBranch ?? "none"}`, "ChatContextHandler");
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
 * chat.delegate — Backend command dispatcher.
 * If params.workflow is provided, dispatches "workflow.run" via the injected dispatcher.
 * No LLM calls, no chat UI — pure backend routing.
 */
function createDelegateHandler(dispatcher, logger) {
    return async (ctx, params) => {
        try {
            const { task, workflow } = params;
            if (!workflow) {
                logger.warn(`Delegate called for task "${task}" with no workflow target`, "ChatDelegateHandler");
                return (0, types_1.failure)({
                    code: "CHAT_DELEGATE_NO_TARGET",
                    message: "No delegation target: provide a workflow name",
                    context: "chat.delegate",
                });
            }
            logger.info(`Delegating task "${task}" to workflow "${workflow}"`, "ChatDelegateHandler");
            const command = {
                name: "workflow.run",
                params: { name: workflow, task },
            };
            const result = await dispatcher(command, ctx);
            if (result.kind === "err") {
                logger.warn(`Workflow dispatch failed for "${workflow}": ${result.error.message}`, "ChatDelegateHandler", result.error);
                return (0, types_1.failure)(result.error);
            }
            logger.info(`Workflow "${workflow}" dispatched successfully`, "ChatDelegateHandler");
            return (0, types_1.success)({
                dispatched: true,
                workflow,
                message: `Workflow "${workflow}" dispatched for task "${task}"`,
            });
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "CHAT_DELEGATE_ERROR",
                message: "Failed to delegate task",
                details: err,
                context: "chat.delegate",
            });
        }
    };
}
//# sourceMappingURL=handlers.js.map