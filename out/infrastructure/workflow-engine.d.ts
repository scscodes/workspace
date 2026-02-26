/**
 * Workflow Engine — execute workflow steps linearly with conditional branching.
 * Supports output passing between steps and error recovery.
 */
import { Logger, Result, Command, CommandContext } from "../types";
import { WorkflowDefinition } from "../types";
/**
 * Step execution result includes output for conditional branching.
 */
export interface StepExecutionResult {
    stepId: string;
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
    nextStepId?: string;
}
/**
 * Workflow execution context tracking state across steps.
 */
export interface WorkflowExecutionContext {
    workflowName: string;
    currentStepId: string;
    stepResults: Map<string, StepExecutionResult>;
    startTime: number;
    variables: Record<string, unknown>;
}
/**
 * Step runner function signature — execute single step.
 * Provided by router; calls command handler.
 */
export type StepRunner = (stepCommand: Command, commandContext: CommandContext) => Promise<Result<Record<string, unknown>>>;
/**
 * Workflow engine — orchestrate step execution.
 */
export declare class WorkflowEngine {
    private logger;
    private stepRunner;
    constructor(logger: Logger, stepRunner: StepRunner);
    /**
     * Execute workflow definition linearly.
     */
    execute(workflow: WorkflowDefinition, commandContext: CommandContext, variables?: Record<string, unknown>): Promise<Result<WorkflowExecutionContext>>;
    /**
     * Execute single workflow step.
     */
    private executeStep;
    /**
     * Resolve next step based on conditions.
     */
    private resolveNextStep;
    /**
     * Interpolate variables in step params.
     * Example: { path: "$(srcPath)" } → { path: "/home/user/src" }
     */
    private interpolateParams;
    /**
     * Interpolate single string with variables.
     */
    private interpolateString;
}
//# sourceMappingURL=workflow-engine.d.ts.map