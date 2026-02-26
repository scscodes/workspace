"use strict";
/**
 * Workflow Engine — execute workflow steps linearly with conditional branching.
 * Supports output passing between steps and error recovery.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
const types_1 = require("../types");
/**
 * Workflow engine — orchestrate step execution.
 */
class WorkflowEngine {
    constructor(logger, stepRunner) {
        this.logger = logger;
        this.stepRunner = stepRunner;
    }
    /**
     * Execute workflow definition linearly.
     */
    async execute(workflow, commandContext, variables = {}) {
        const executionCtx = {
            workflowName: workflow.name,
            currentStepId: workflow.steps[0]?.id || "exit",
            stepResults: new Map(),
            startTime: Date.now(),
            variables,
        };
        try {
            let stepIndex = 0;
            while (stepIndex < workflow.steps.length) {
                const step = workflow.steps[stepIndex];
                executionCtx.currentStepId = step.id;
                // Execute step
                const stepResult = await this.executeStep(step, commandContext, executionCtx);
                executionCtx.stepResults.set(step.id, stepResult);
                this.logger.info(`Step ${step.id} completed: ${stepResult.success ? "success" : "failure"}`, "WorkflowEngine.execute");
                // Resolve next step based on condition
                const nextStepId = stepResult.nextStepId || this.resolveNextStep(step, stepResult);
                if (!nextStepId || nextStepId === "exit") {
                    break;
                }
                // Find next step in workflow
                const nextStepIndex = workflow.steps.findIndex((s) => s.id === nextStepId);
                if (nextStepIndex === -1) {
                    return (0, types_1.failure)({
                        code: "INVALID_NEXT_STEP",
                        message: `Step ${step.id} references undefined next step: ${nextStepId}`,
                        context: "WorkflowEngine.execute",
                    });
                }
                stepIndex = nextStepIndex;
            }
            return (0, types_1.success)(executionCtx);
        }
        catch (err) {
            this.logger.error(`Workflow execution failed`, "WorkflowEngine.execute", { error: err, currentStep: executionCtx.currentStepId });
            return (0, types_1.failure)({
                code: "WORKFLOW_EXECUTION_ERROR",
                message: `Workflow ${workflow.name} failed at step ${executionCtx.currentStepId}`,
                details: err,
                context: "WorkflowEngine.execute",
            });
        }
    }
    /**
     * Execute single workflow step.
     */
    async executeStep(step, commandContext, executionCtx) {
        try {
            // Build command with interpolated params
            const params = this.interpolateParams(step.params, executionCtx.variables);
            const command = {
                name: step.command,
                params,
            };
            // Run step via handler
            const result = await this.stepRunner(command, commandContext);
            const stepResult = {
                stepId: step.id,
                success: result.kind === "ok",
                output: result.kind === "ok" ? result.value : undefined,
            };
            if (result.kind === "err") {
                stepResult.error = result.error.message;
            }
            return stepResult;
        }
        catch (err) {
            return {
                stepId: step.id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    /**
     * Resolve next step based on conditions.
     */
    resolveNextStep(step, result) {
        if (result.success) {
            return step.onSuccess;
        }
        else {
            return step.onFailure;
        }
    }
    /**
     * Interpolate variables in step params.
     * Example: { path: "$(srcPath)" } → { path: "/home/user/src" }
     */
    interpolateParams(params, variables) {
        const result = {};
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === "string") {
                result[key] = this.interpolateString(value, variables);
            }
            else if (typeof value === "object" && value !== null) {
                result[key] = this.interpolateParams(value, variables);
            }
            else {
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * Interpolate single string with variables.
     */
    interpolateString(value, variables) {
        return value.replace(/\$\(([^)]+)\)/g, (_, varName) => {
            return String(variables[varName] ?? `$(${varName})`);
        });
    }
}
exports.WorkflowEngine = WorkflowEngine;
//# sourceMappingURL=workflow-engine.js.map