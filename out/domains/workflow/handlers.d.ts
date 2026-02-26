/**
 * Workflow Domain Handlers — list and run workflows.
 */
import { Handler, Logger, WorkflowDefinition } from "../../types";
import { ListWorkflowsResult, RunWorkflowResult } from "./types";
import { WorkflowEngine } from "../../infrastructure/workflow-engine";
/**
 * workflow.list — Show all available workflows.
 */
export declare function createListWorkflowsHandler(logger: Logger, discoverWorkflows: () => Map<string, WorkflowDefinition>): Handler<Record<string, unknown>, ListWorkflowsResult>;
/**
 * workflow.run — Execute a named workflow.
 */
export declare function createRunWorkflowHandler(logger: Logger, getWorkflowEngine: () => WorkflowEngine, loadWorkflow: (name: string) => WorkflowDefinition | null): Handler<{
    name: string;
    variables?: Record<string, unknown>;
}, RunWorkflowResult>;
//# sourceMappingURL=handlers.d.ts.map