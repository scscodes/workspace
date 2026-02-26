"use strict";
/**
 * Workflow Domain Handlers — list and run workflows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createListWorkflowsHandler = createListWorkflowsHandler;
exports.createRunWorkflowHandler = createRunWorkflowHandler;
const types_1 = require("../../types");
/**
 * workflow.list — Show all available workflows.
 */
function createListWorkflowsHandler(logger, discoverWorkflows) {
    return async (_ctx) => {
        try {
            logger.debug("Listing workflows", "WorkflowListHandler");
            const workflows = discoverWorkflows();
            const workflowList = Array.from(workflows.values()).map((w) => ({
                name: w.name,
                description: w.description,
                version: w.version,
                stepCount: w.steps.length,
            }));
            return (0, types_1.success)({
                workflows: workflowList,
                count: workflowList.length,
            });
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "WORKFLOW_LIST_ERROR",
                message: "Failed to list workflows",
                details: err,
                context: "workflow.list",
            });
        }
    };
}
/**
 * workflow.run — Execute a named workflow.
 */
function createRunWorkflowHandler(logger, getWorkflowEngine, loadWorkflow) {
    return async (ctx, params) => {
        // Validate params
        if (!params.name || params.name.trim().length === 0) {
            return (0, types_1.failure)({
                code: "INVALID_PARAMS",
                message: "Workflow name is required",
                context: "workflow.run",
            });
        }
        try {
            logger.info(`Running workflow: ${params.name}`, "WorkflowRunHandler");
            // Load workflow
            const workflow = loadWorkflow(params.name);
            if (!workflow) {
                return (0, types_1.failure)({
                    code: "WORKFLOW_NOT_FOUND",
                    message: `Workflow not found: ${params.name}`,
                    context: "workflow.run",
                });
            }
            // Execute workflow
            const engine = getWorkflowEngine();
            const startTime = Date.now();
            const executionResult = await engine.execute(workflow, ctx, params.variables || {});
            const duration = Date.now() - startTime;
            if (executionResult.kind === "ok") {
                logger.info(`Workflow completed: ${params.name}`, "WorkflowRunHandler");
                return (0, types_1.success)({
                    workflowName: params.name,
                    success: true,
                    duration,
                    stepCount: workflow.steps.length,
                    message: "Workflow completed successfully",
                });
            }
            else {
                const failedStepId = executionResult.error.details?.currentStep;
                return (0, types_1.failure)({
                    code: "WORKFLOW_EXECUTION_FAILED",
                    message: `Workflow failed: ${executionResult.error.message}`,
                    details: {
                        duration,
                        stepCount: workflow.steps.length,
                        failedAt: failedStepId,
                    },
                    context: "workflow.run",
                });
            }
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "WORKFLOW_RUN_ERROR",
                message: `Failed to run workflow: ${params.name}`,
                details: err,
                context: "workflow.run",
            });
        }
    };
}
//# sourceMappingURL=handlers.js.map