/**
 * Workflow Domain Service — discover, manage, and execute workflows.
 */

import {
  DomainService,
  WorkflowCommandName,
  Handler,
  Logger,
  Result,
  failure,
  success,
  WorkflowDefinition,
} from "../../types";
import {
  createListWorkflowsHandler,
  createRunWorkflowHandler,
} from "./handlers";
import {
  getWorkflowsDir,
  listJsonFiles,
  readJsonFile,
} from "../../infrastructure/workspace";
import { WorkflowEngine, StepRunner } from "../../infrastructure/workflow-engine";

/**
 * Workflow domain commands.
 */
export const WORKFLOW_COMMANDS: WorkflowCommandName[] = [
  "workflow.list",
  "workflow.run",
];

export class WorkflowDomainService implements DomainService {
  readonly name = "workflow";

  handlers: Partial<Record<WorkflowCommandName, Handler>> = {};
  private logger: Logger;
  private workflowCache: Map<string, WorkflowDefinition> = new Map();
  private workflowEngine: WorkflowEngine | null = null;
  private stepRunner: StepRunner | null = null;

  constructor(logger: Logger, stepRunner?: StepRunner) {
    this.logger = logger;
    this.stepRunner = stepRunner || this.createDefaultStepRunner();

    // Initialize handlers
    this.handlers = {
      "workflow.list": createListWorkflowsHandler(this.logger, () =>
        this.discoverWorkflows()
      ) as any,
      "workflow.run": createRunWorkflowHandler(
        this.logger,
        this.getWorkflowEngine.bind(this),
        (name) => this.loadWorkflow(name)
      ) as any,
    };
  }

  /**
   * Initialize domain — discover workflows.
   */
  async initialize(): Promise<Result<void>> {
    try {
      this.logger.info(
        "Initializing workflow domain",
        "WorkflowDomainService.initialize"
      );

      const discovered = this.discoverWorkflows();
      this.logger.info(
        `Discovered ${discovered.size} workflows`,
        "WorkflowDomainService.initialize"
      );

      return success(void 0);
    } catch (err) {
      return failure({
        code: "WORKFLOW_INIT_ERROR",
        message: "Failed to initialize workflow domain",
        details: err,
        context: "WorkflowDomainService.initialize",
      });
    }
  }

  /**
   * Teardown — clear caches.
   */
  async teardown(): Promise<void> {
    this.logger.debug(
      "Tearing down workflow domain",
      "WorkflowDomainService.teardown"
    );
    this.workflowCache.clear();
  }

  /**
   * Discover workflows from .vscode/workflows/
   */
  private discoverWorkflows(): Map<string, WorkflowDefinition> {
    this.workflowCache.clear();

    const workflowsDir = getWorkflowsDir();
    const files = listJsonFiles(workflowsDir);

    for (const filePath of files) {
      const data = readJsonFile<WorkflowDefinition>(filePath);
      if (data && validateWorkflowDefinition(data)) {
        this.workflowCache.set(data.name, data);
      }
    }

    return this.workflowCache;
  }

  /**
   * Load workflow by name from cache or discover.
   */
  private loadWorkflow(name: string): WorkflowDefinition | null {
    let workflow = this.workflowCache.get(name);
    if (!workflow) {
      this.discoverWorkflows();
      workflow = this.workflowCache.get(name);
    }
    return workflow || null;
  }

  /**
   * Get workflow engine instance.
   */
  private getWorkflowEngine(): WorkflowEngine {
    if (!this.workflowEngine) {
      this.workflowEngine = new WorkflowEngine(
        this.logger,
        this.stepRunner || this.createDefaultStepRunner()
      );
    }
    return this.workflowEngine;
  }

  /**
   * Create default step runner that throws (should be provided by router).
   */
  private createDefaultStepRunner(): StepRunner {
    return async (): Promise<Result<Record<string, unknown>>> => {
      return failure({
        code: "STEP_RUNNER_NOT_AVAILABLE",
        message:
          "Step runner not initialized. Register workflow domain with router.",
        context: "WorkflowDomainService",
      });
    };
  }
}

/**
 * Validate workflow definition schema.
 */
export function validateWorkflowDefinition(
  data: unknown
): data is WorkflowDefinition {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (typeof obj.name !== "string" || !obj.name) {
    return false;
  }

  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    return false;
  }

  // Validate each step
  for (const step of obj.steps as unknown[]) {
    if (typeof step !== "object" || step === null) {
      return false;
    }

    const stepObj = step as Record<string, unknown>;
    if (typeof stepObj.id !== "string" || !stepObj.id) {
      return false;
    }

    if (typeof stepObj.command !== "string" || !stepObj.command) {
      return false;
    }

    if (typeof stepObj.params !== "object") {
      return false;
    }
  }

  return true;
}

/**
 * Factory function — creates and returns workflow domain service.
 */
export function createWorkflowDomain(
  logger: Logger,
  stepRunner?: StepRunner
): WorkflowDomainService {
  return new WorkflowDomainService(logger, stepRunner);
}
