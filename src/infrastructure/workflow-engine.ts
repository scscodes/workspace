/**
 * Workflow Engine — execute workflow steps linearly with conditional branching.
 * Supports output passing between steps and error recovery.
 */

import { Logger, Result, failure, success, Command, CommandContext } from "../types";
import { WorkflowDefinition, WorkflowStep } from "../types";

/**
 * Step execution result includes output for conditional branching.
 */
export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  nextStepId?: string; // Resolved next step based on conditions
}

/**
 * Workflow execution context tracking state across steps.
 */
export interface WorkflowExecutionContext {
  workflowName: string;
  currentStepId: string;
  stepResults: Map<string, StepExecutionResult>; // Track all step outputs
  startTime: number;
  variables: Record<string, unknown>; // Shared state across steps
}

/**
 * Step runner function signature — execute single step.
 * Provided by router; calls command handler.
 */
export type StepRunner = (
  stepCommand: Command,
  commandContext: CommandContext
) => Promise<Result<Record<string, unknown>>>;

/**
 * Workflow engine — orchestrate step execution.
 */
export class WorkflowEngine {
  constructor(
    private logger: Logger,
    private stepRunner: StepRunner
  ) {}

  /**
   * Execute workflow definition linearly.
   */
  async execute(
    workflow: WorkflowDefinition,
    commandContext: CommandContext,
    variables: Record<string, unknown> = {}
  ): Promise<Result<WorkflowExecutionContext>> {
    const executionCtx: WorkflowExecutionContext = {
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
        const stepResult = await this.executeStep(
          step,
          commandContext,
          executionCtx
        );
        executionCtx.stepResults.set(step.id, stepResult);

        this.logger.info(
          `Step ${step.id} completed: ${stepResult.success ? "success" : "failure"}`,
          "WorkflowEngine.execute"
        );

        // Resolve next step based on condition
        const nextStepId = stepResult.nextStepId || this.resolveNextStep(step, stepResult);
        if (!nextStepId || nextStepId === "exit") {
          break;
        }

        // Find next step in workflow
        const nextStepIndex = workflow.steps.findIndex((s) => s.id === nextStepId);
        if (nextStepIndex === -1) {
          return failure({
            code: "INVALID_NEXT_STEP",
            message: `Step ${step.id} references undefined next step: ${nextStepId}`,
            context: "WorkflowEngine.execute",
          });
        }

        stepIndex = nextStepIndex;
      }

      return success(executionCtx);
    } catch (err) {
      this.logger.error(
        `Workflow execution failed`,
        "WorkflowEngine.execute",
        { error: err, currentStep: executionCtx.currentStepId } as any
      );

      return failure({
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
  private async executeStep(
    step: WorkflowStep,
    commandContext: CommandContext,
    executionCtx: WorkflowExecutionContext
  ): Promise<StepExecutionResult> {
    try {
      // Build command with interpolated params
      const params = this.interpolateParams(step.params, executionCtx.variables);

      const command: Command = {
        name: step.command,
        params,
      };

      // Run step via handler
      const result = await this.stepRunner(command, commandContext);

      const stepResult: StepExecutionResult = {
        stepId: step.id,
        success: result.kind === "ok",
        output: result.kind === "ok" ? result.value : undefined,
      };

      if (result.kind === "err") {
        stepResult.error = result.error.message;
      }

      return stepResult;
    } catch (err) {
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
  private resolveNextStep(
    step: WorkflowStep,
    result: StepExecutionResult
  ): string | undefined {
    if (result.success) {
      return step.onSuccess;
    } else {
      return step.onFailure;
    }
  }

  /**
   * Interpolate variables in step params.
   * Example: { path: "$(srcPath)" } → { path: "/home/user/src" }
   */
  private interpolateParams(
    params: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        result[key] = this.interpolateString(value, variables);
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.interpolateParams(
          value as Record<string, unknown>,
          variables
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Interpolate single string with variables.
   */
  private interpolateString(
    value: string,
    variables: Record<string, unknown>
  ): string {
    return value.replace(/\$\(([^)]+)\)/g, (_, varName) => {
      return String(variables[varName] ?? `$(${varName})`);
    });
  }
}
