/**
 * Workflow Domain Handlers — list and run workflows.
 */

import {
  Handler,
  CommandContext,
  Logger,
  WorkflowDefinition,
  Result,
  success,
  failure,
} from "../../types";
import { ListWorkflowsResult, RunWorkflowResult } from "./types";
import { WorkflowEngine } from "../../infrastructure/workflow-engine";

/**
 * workflow.list — Show all available workflows.
 */
export function createListWorkflowsHandler(
  logger: Logger,
  discoverWorkflows: () => Map<string, WorkflowDefinition>
): Handler<Record<string, unknown>, ListWorkflowsResult> {
  return async (_ctx: CommandContext): Promise<Result<ListWorkflowsResult>> => {
    try {
      logger.debug("Listing workflows", "WorkflowListHandler");

      const workflows = discoverWorkflows();
      const workflowList = Array.from(workflows.values()).map((w) => ({
        name: w.name,
        description: w.description,
        version: w.version,
        stepCount: w.steps.length,
      }));

      return success({
        workflows: workflowList,
        count: workflowList.length,
      });
    } catch (err) {
      return failure({
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
export function createRunWorkflowHandler(
  logger: Logger,
  getWorkflowEngine: () => WorkflowEngine,
  loadWorkflow: (name: string) => WorkflowDefinition | null
): Handler<
  { name: string; variables?: Record<string, unknown> },
  RunWorkflowResult
> {
  return async (
    ctx: CommandContext,
    params: { name: string; variables?: Record<string, unknown> }
  ): Promise<Result<RunWorkflowResult>> => {
    // Validate params
    if (!params.name || params.name.trim().length === 0) {
      return failure({
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
        return failure({
          code: "WORKFLOW_NOT_FOUND",
          message: `Workflow not found: ${params.name}`,
          context: "workflow.run",
        });
      }

      // Execute workflow
      const engine = getWorkflowEngine();
      const startTime = Date.now();

      const executionResult = await engine.execute(
        workflow,
        ctx,
        params.variables || {}
      );

      const duration = Date.now() - startTime;

      if (executionResult.kind === "ok") {
        logger.info(
          `Workflow completed: ${params.name}`,
          "WorkflowRunHandler"
        );

        return success({
          workflowName: params.name,
          success: true,
          duration,
          stepCount: workflow.steps.length,
          message: "Workflow completed successfully",
        });
      } else {
        const failedStepId = (executionResult.error.details as any)?.currentStep;
        return failure({
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
    } catch (err) {
      return failure({
        code: "WORKFLOW_RUN_ERROR",
        message: `Failed to run workflow: ${params.name}`,
        details: err,
        context: "workflow.run",
      });
    }
  };
}
