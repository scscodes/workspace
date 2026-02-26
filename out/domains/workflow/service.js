"use strict";
/**
 * Workflow Domain Service — discover, manage, and execute workflows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowDomainService = exports.WORKFLOW_COMMANDS = void 0;
exports.validateWorkflowDefinition = validateWorkflowDefinition;
exports.createWorkflowDomain = createWorkflowDomain;
const types_1 = require("../../types");
const handlers_1 = require("./handlers");
const workspace_1 = require("../../infrastructure/workspace");
const workflow_engine_1 = require("../../infrastructure/workflow-engine");
/**
 * Workflow domain commands.
 */
exports.WORKFLOW_COMMANDS = [
    "workflow.list",
    "workflow.run",
];
class WorkflowDomainService {
    constructor(logger, stepRunner) {
        this.name = "workflow";
        this.handlers = {};
        this.workflowCache = new Map();
        this.workflowEngine = null;
        this.stepRunner = null;
        this.logger = logger;
        this.stepRunner = stepRunner || this.createDefaultStepRunner();
        // Initialize handlers
        this.handlers = {
            "workflow.list": (0, handlers_1.createListWorkflowsHandler)(this.logger, () => this.discoverWorkflows()),
            "workflow.run": (0, handlers_1.createRunWorkflowHandler)(this.logger, this.getWorkflowEngine.bind(this), (name) => this.loadWorkflow(name)),
        };
    }
    /**
     * Initialize domain — discover workflows.
     */
    async initialize() {
        try {
            this.logger.info("Initializing workflow domain", "WorkflowDomainService.initialize");
            const discovered = this.discoverWorkflows();
            this.logger.info(`Discovered ${discovered.size} workflows`, "WorkflowDomainService.initialize");
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            return (0, types_1.failure)({
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
    async teardown() {
        this.logger.debug("Tearing down workflow domain", "WorkflowDomainService.teardown");
        this.workflowCache.clear();
    }
    /**
     * Discover workflows from .vscode/workflows/
     */
    discoverWorkflows() {
        this.workflowCache.clear();
        const workflowsDir = (0, workspace_1.getWorkflowsDir)();
        const files = (0, workspace_1.listJsonFiles)(workflowsDir);
        for (const filePath of files) {
            const data = (0, workspace_1.readJsonFile)(filePath);
            if (data && validateWorkflowDefinition(data)) {
                this.workflowCache.set(data.name, data);
            }
        }
        return this.workflowCache;
    }
    /**
     * Load workflow by name from cache or discover.
     */
    loadWorkflow(name) {
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
    getWorkflowEngine() {
        if (!this.workflowEngine) {
            this.workflowEngine = new workflow_engine_1.WorkflowEngine(this.logger, this.stepRunner || this.createDefaultStepRunner());
        }
        return this.workflowEngine;
    }
    /**
     * Create default step runner that throws (should be provided by router).
     */
    createDefaultStepRunner() {
        return async () => {
            return (0, types_1.failure)({
                code: "STEP_RUNNER_NOT_AVAILABLE",
                message: "Step runner not initialized. Register workflow domain with router.",
                context: "WorkflowDomainService",
            });
        };
    }
}
exports.WorkflowDomainService = WorkflowDomainService;
/**
 * Validate workflow definition schema.
 */
function validateWorkflowDefinition(data) {
    if (typeof data !== "object" || data === null) {
        return false;
    }
    const obj = data;
    // Required fields
    if (typeof obj.name !== "string" || !obj.name) {
        return false;
    }
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
        return false;
    }
    // Validate each step
    for (const step of obj.steps) {
        if (typeof step !== "object" || step === null) {
            return false;
        }
        const stepObj = step;
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
function createWorkflowDomain(logger, stepRunner) {
    return new WorkflowDomainService(logger, stepRunner);
}
//# sourceMappingURL=service.js.map