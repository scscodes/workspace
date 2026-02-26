/**
 * Workflow domain types and interfaces.
 */
/**
 * Result of listing workflows.
 */
export interface ListWorkflowsResult {
    workflows: WorkflowInfo[];
    count: number;
}
/**
 * Workflow information summary.
 */
export interface WorkflowInfo {
    name: string;
    description?: string;
    version?: string;
    stepCount: number;
}
/**
 * Result of running a workflow.
 */
export interface RunWorkflowResult {
    workflowName: string;
    success: boolean;
    duration: number;
    stepCount: number;
    failedAt?: string;
    message: string;
}
//# sourceMappingURL=types.d.ts.map