/**
 * Workflow Domain Service — discover, manage, and execute workflows.
 */
import { DomainService, WorkflowCommandName, Handler, Logger, Result, WorkflowDefinition } from "../../types";
import { StepRunner } from "../../infrastructure/workflow-engine";
/**
 * Workflow domain commands.
 */
export declare const WORKFLOW_COMMANDS: WorkflowCommandName[];
export declare class WorkflowDomainService implements DomainService {
    readonly name = "workflow";
    handlers: Partial<Record<WorkflowCommandName, Handler>>;
    private logger;
    private workflowCache;
    private workflowEngine;
    private stepRunner;
    constructor(logger: Logger, stepRunner?: StepRunner);
    /**
     * Initialize domain — discover workflows.
     */
    initialize(): Promise<Result<void>>;
    /**
     * Teardown — clear caches.
     */
    teardown(): Promise<void>;
    /**
     * Discover workflows from .vscode/workflows/
     */
    private discoverWorkflows;
    /**
     * Load workflow by name from cache or discover.
     */
    private loadWorkflow;
    /**
     * Get workflow engine instance.
     */
    private getWorkflowEngine;
    /**
     * Create default step runner that throws (should be provided by router).
     */
    private createDefaultStepRunner;
}
/**
 * Validate workflow definition schema.
 */
export declare function validateWorkflowDefinition(data: unknown): data is WorkflowDefinition;
/**
 * Factory function — creates and returns workflow domain service.
 */
export declare function createWorkflowDomain(logger: Logger, stepRunner?: StepRunner): WorkflowDomainService;
//# sourceMappingURL=service.d.ts.map