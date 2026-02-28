"use strict";
/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.Logger = exports.CommandRouter = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const nodePath = __importStar(require("path"));
const router_1 = require("./router");
Object.defineProperty(exports, "CommandRouter", { enumerable: true, get: function () { return router_1.CommandRouter; } });
const logger_1 = require("./infrastructure/logger");
const config_1 = require("./infrastructure/config");
const service_1 = require("./domains/git/service");
const service_2 = require("./domains/hygiene/service");
const service_3 = require("./domains/chat/service");
const service_4 = require("./domains/workflow/service");
const service_5 = require("./domains/agent/service");
const middleware_1 = require("./cross-cutting/middleware");
const git_provider_1 = require("./infrastructure/git-provider");
const workspace_provider_1 = require("./infrastructure/workspace-provider");
const telemetry_1 = require("./infrastructure/telemetry");
const result_handler_1 = require("./infrastructure/result-handler");
const git_tree_provider_1 = require("./ui/tree-providers/git-tree-provider");
const hygiene_tree_provider_1 = require("./ui/tree-providers/hygiene-tree-provider");
const workflow_tree_provider_1 = require("./ui/tree-providers/workflow-tree-provider");
const agent_tree_provider_1 = require("./ui/tree-providers/agent-tree-provider");
const chat_participant_1 = require("./ui/chat-participant");
const lm_tools_1 = require("./ui/lm-tools");
const webview_provider_1 = require("./infrastructure/webview-provider");
const analytics_types_1 = require("./domains/hygiene/analytics-types");
const model_selector_1 = require("./infrastructure/model-selector");
/** Read user-configured prune settings, falling back to PRUNE_DEFAULTS */
function readPruneConfig() {
    const cfg = vscode.workspace.getConfiguration("meridian.hygiene.prune");
    return {
        minAgeDays: cfg.get("minAgeDays", analytics_types_1.PRUNE_DEFAULTS.minAgeDays),
        maxSizeMB: cfg.get("maxSizeMB", analytics_types_1.PRUNE_DEFAULTS.maxSizeMB),
        minLineCount: cfg.get("minLineCount", analytics_types_1.PRUNE_DEFAULTS.minLineCount),
        categories: cfg.get("categories", analytics_types_1.PRUNE_DEFAULTS.categories),
    };
}
// ============================================================================
// Telemetry Middleware Factory
// ============================================================================
/**
 * Creates a middleware that emits COMMAND_STARTED, COMMAND_COMPLETED, and
 * COMMAND_FAILED telemetry events around each dispatched command.
 */
function createTelemetryMiddleware(telemetry) {
    return async (ctx, next) => {
        const start = Date.now();
        telemetry.trackCommandStarted(ctx.commandName);
        try {
            await next();
            telemetry.trackCommandCompleted(ctx.commandName, Date.now() - start, "success");
        }
        catch (err) {
            const duration = Date.now() - start;
            telemetry.trackCommandFailed(ctx.commandName, duration, {
                code: "MIDDLEWARE_ERROR",
                message: err instanceof Error ? err.message : String(err),
                context: ctx.commandName,
            });
            throw err;
        }
    };
}
// ============================================================================
// Command Context Builder
// ============================================================================
/**
 * Build a CommandContext from the VS Code extension context.
 * workspaceFolders maps to the first workspace folder URI if available.
 */
function getCommandContext(context) {
    return {
        extensionPath: context.extensionUri.fsPath,
        workspaceFolders: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [],
        activeFilePath: vscode.window.activeTextEditor?.document.uri.fsPath,
    };
}
// ============================================================================
// Command ID → Internal CommandName mapping
// ============================================================================
const COMMAND_MAP = [
    ["meridian.git.status", "git.status"],
    ["meridian.git.pull", "git.pull"],
    ["meridian.git.commit", "git.commit"],
    ["meridian.git.smartCommit", "git.smartCommit"],
    ["meridian.hygiene.scan", "hygiene.scan"],
    ["meridian.hygiene.cleanup", "hygiene.cleanup"],
    ["meridian.chat.context", "chat.context"],
    ["meridian.workflow.list", "workflow.list"],
    ["meridian.agent.list", "agent.list"],
    ["meridian.git.showAnalytics", "git.showAnalytics"],
    ["meridian.git.exportJson", "git.exportJson"],
    ["meridian.git.exportCsv", "git.exportCsv"],
    ["meridian.hygiene.showAnalytics", "hygiene.showAnalytics"],
];
// ============================================================================
// Extension Activation
// ============================================================================
/**
 * Activate the extension.
 * Called by VS Code when activation event is triggered.
 */
async function activate(context) {
    // Initialize infrastructure layer
    const logger = new logger_1.Logger();
    const config = new config_1.Config();
    await config.initialize();
    // Output channel — primary user-facing log surface
    const outputChannel = vscode.window.createOutputChannel("Meridian");
    context.subscriptions.push(outputChannel);
    // Initialize telemetry
    const telemetry = new telemetry_1.TelemetryTracker(new telemetry_1.ConsoleTelemetrySink(false));
    // Resolve workspace root from VS Code workspace folders
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    // Resolve extension path
    const extensionPath = context.extensionUri.fsPath;
    // Initialize real providers
    const gitProvider = (0, git_provider_1.createGitProvider)(workspaceRoot);
    const workspaceProvider = (0, workspace_provider_1.createWorkspaceProvider)(workspaceRoot);
    // Create router
    const router = new router_1.CommandRouter(logger);
    // Register middleware (telemetry first, then logging, then audit)
    router.use(createTelemetryMiddleware(telemetry));
    router.use((0, middleware_1.createLoggingMiddleware)(logger));
    router.use((0, middleware_1.createAuditMiddleware)(logger));
    // Create step runner for workflow engine (allows workflows to dispatch commands)
    const stepRunner = async (command, ctx) => {
        const result = await router.dispatch(command, ctx);
        if (result.kind === "ok") {
            return { kind: "ok", value: result.value || {} };
        }
        return result;
    };
    // Register domains
    const gitDomain = (0, service_1.createGitDomain)(gitProvider, logger, workspaceRoot);
    const hygieneDomain = (0, service_2.createHygieneDomain)(workspaceProvider, logger);
    const chatDomain = (0, service_3.createChatDomain)(gitProvider, logger, (cmd, ctx) => router.dispatch(cmd, ctx));
    const workflowDomain = (0, service_4.createWorkflowDomain)(logger, stepRunner, workspaceRoot, extensionPath);
    const agentDomain = (0, service_5.createAgentDomain)(logger, workspaceRoot, extensionPath);
    router.registerDomain(gitDomain);
    router.registerDomain(hygieneDomain);
    router.registerDomain(chatDomain);
    router.registerDomain(workflowDomain);
    router.registerDomain(agentDomain);
    // Validate all domains
    const validationResult = await router.validateDomains();
    if (validationResult.kind === "err") {
        logger.error("Domain validation failed", "activate", validationResult.error);
        throw new Error(validationResult.error.message);
    }
    // Register sidebar tree providers
    const cmdCtx = getCommandContext(context);
    // Git analytics webview panel (full-width editor tab)
    const analyticsPanel = new webview_provider_1.AnalyticsWebviewProvider(context.extensionUri, workspaceRoot, async (opts) => {
        const freshCtx = getCommandContext(context);
        const result = await router.dispatch({ name: "git.showAnalytics", params: opts }, freshCtx);
        if (result.kind === "ok") {
            return result.value;
        }
        throw new Error(result.error?.message ?? "Analytics failed");
    });
    // Hygiene analytics webview panel
    const hygieneAnalyticsPanel = new webview_provider_1.HygieneAnalyticsWebviewProvider(context.extensionUri, async () => {
        const freshCtx = getCommandContext(context);
        const result = await router.dispatch({ name: "hygiene.showAnalytics", params: readPruneConfig() }, freshCtx);
        if (result.kind === "ok")
            return result.value;
        throw new Error(result.error?.message ?? "Hygiene analytics failed");
    });
    // Register all 10 VS Code commands. Each maps the "meridian.*" vscode ID
    // to the internal bare CommandName. Results surface via OutputChannel + notifications.
    for (const [vsCodeId, commandName] of COMMAND_MAP) {
        const disposable = vscode.commands.registerCommand(vsCodeId, async (params = {}) => {
            const cmdCtx = getCommandContext(context);
            // hygiene.showAnalytics: inject user prune config before dispatching
            if (commandName === "hygiene.showAnalytics") {
                const pruneResult = await router.dispatch({ name: "hygiene.showAnalytics", params: readPruneConfig() }, cmdCtx);
                if (pruneResult.kind === "ok") {
                    await hygieneAnalyticsPanel.openPanel(pruneResult.value);
                    outputChannel.appendLine(`[${new Date().toISOString()}] Hygiene analytics panel opened`);
                }
                else {
                    const { message } = (0, result_handler_1.formatResultMessage)(commandName, pruneResult);
                    vscode.window.showErrorMessage(message);
                }
                return;
            }
            const command = { name: commandName, params };
            const result = await router.dispatch(command, cmdCtx);
            // git.showAnalytics opens the webview panel instead of a notification
            if (commandName === "git.showAnalytics" && result.kind === "ok") {
                await analyticsPanel.openPanel(result.value);
                outputChannel.appendLine(`[${new Date().toISOString()}] Analytics panel opened`);
                return;
            }
            const { level, message } = (0, result_handler_1.formatResultMessage)(commandName, result);
            outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
            if (level === "info") {
                vscode.window.showInformationMessage(message);
            }
            else {
                vscode.window.showErrorMessage(message);
            }
        });
        context.subscriptions.push(disposable);
    }
    const dispatch = (cmd, ctx) => router.dispatch(cmd, ctx);
    const gitTree = new git_tree_provider_1.GitTreeProvider(gitProvider, logger, workspaceRoot);
    const hygieneTree = new hygiene_tree_provider_1.HygieneTreeProvider(dispatch, cmdCtx, logger);
    const workflowTree = new workflow_tree_provider_1.WorkflowTreeProvider(dispatch, cmdCtx, logger);
    const agentTree = new agent_tree_provider_1.AgentTreeProvider(dispatch, cmdCtx, logger);
    context.subscriptions.push(vscode.window.registerTreeDataProvider("meridian.git.view", gitTree), vscode.window.registerTreeDataProvider("meridian.hygiene.view", hygieneTree), vscode.window.registerTreeDataProvider("meridian.workflow.view", workflowTree), vscode.window.registerTreeDataProvider("meridian.agent.view", agentTree));
    // Refresh commands — wire to each tree provider's refresh() method
    context.subscriptions.push(vscode.commands.registerCommand("meridian.git.refresh", () => gitTree.refresh()), vscode.commands.registerCommand("meridian.hygiene.refresh", () => hygieneTree.refresh()), vscode.commands.registerCommand("meridian.workflow.refresh", () => workflowTree.refresh()), vscode.commands.registerCommand("meridian.agent.refresh", () => agentTree.refresh()));
    // workflow.run — registered after tree providers so workflowTree is in scope.
    // VS Code passes the TreeItem as the first arg when invoked from context/inline menus
    // but passes { name: "..." } when invoked from it.command.arguments (click).
    context.subscriptions.push(vscode.commands.registerCommand("meridian.workflow.run", async (arg = {}) => {
        const freshCtx = getCommandContext(context);
        let name;
        if (arg && typeof arg === "object") {
            const obj = arg;
            if (typeof obj.name === "string" && obj.name) {
                name = obj.name;
            }
            else if (typeof obj.label === "string" && obj.label) {
                name = obj.label;
            }
        }
        if (!name) {
            vscode.window.showErrorMessage("No workflow selected.");
            return;
        }
        workflowTree.setRunning(name);
        const result = await router.dispatch({ name: "workflow.run", params: { name } }, freshCtx);
        const r = result.kind === "ok" ? result.value : null;
        workflowTree.setLastRun(name, r?.success ?? result.kind === "ok", r?.duration ?? 0);
        // Log to output channel only — tree item description shows the result
        const { message } = (0, result_handler_1.formatResultMessage)("workflow.run", result);
        outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }));
    // Hygiene file actions — registered after tree providers so hygieneTree is in scope.
    context.subscriptions.push(vscode.commands.registerCommand("meridian.hygiene.deleteFile", async (item) => {
        const filePath = item?.filePath;
        if (!filePath)
            return;
        const filename = nodePath.basename(filePath);
        const confirm = await vscode.window.showWarningMessage(`Delete "${filename}"? This cannot be undone.`, { modal: true }, "Delete");
        if (confirm !== "Delete")
            return;
        const freshCtx = getCommandContext(context);
        const result = await router.dispatch({ name: "hygiene.cleanup", params: { files: [filePath] } }, freshCtx);
        if (result.kind === "ok") {
            vscode.window.showInformationMessage(`Deleted: ${filename}`);
            hygieneTree.refresh();
        }
        else {
            vscode.window.showErrorMessage(`Delete failed: ${result.error.message}`);
        }
    }), vscode.commands.registerCommand("meridian.hygiene.ignoreFile", async (item) => {
        const filePath = item?.filePath;
        if (!filePath)
            return;
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const ignorePath = nodePath.join(wsRoot, ".meridianignore");
        const pattern = nodePath.relative(wsRoot, filePath);
        fs.appendFileSync(ignorePath, `\n${pattern}\n`);
        vscode.window.showInformationMessage(`Added to .meridianignore: ${pattern}`);
        hygieneTree.refresh();
    }), vscode.commands.registerCommand("meridian.hygiene.reviewFile", async (item) => {
        const filePath = item?.filePath;
        if (!filePath)
            return;
        let content;
        try {
            content = fs.readFileSync(filePath, "utf-8");
        }
        catch {
            vscode.window.showErrorMessage(`Could not read: ${nodePath.basename(filePath)}`);
            return;
        }
        const model = await (0, model_selector_1.selectModel)("hygiene");
        if (!model) {
            vscode.window.showErrorMessage("No language model available. Ensure GitHub Copilot is enabled.");
            return;
        }
        const filename = nodePath.basename(filePath);
        outputChannel.show(true);
        outputChannel.appendLine(`\n${"─".repeat(60)}`);
        outputChannel.appendLine(`[${new Date().toISOString()}] AI Review: ${filename}`);
        outputChannel.appendLine("─".repeat(60));
        const messages = [
            vscode.LanguageModelChatMessage.User(`You are a critical technical reviewer. Analyze this Markdown document and provide concise, actionable feedback on:\n1. Content accuracy and factual correctness\n2. Clarity and readability\n3. Completeness (gaps or missing context)\n4. Effectiveness (does it achieve its purpose?)\n5. Top 3 specific improvements\n\nDocument: ${filename}\n\`\`\`markdown\n${content}\n\`\`\``),
        ];
        try {
            const cts = new vscode.CancellationTokenSource();
            context.subscriptions.push(cts);
            const response = await model.sendRequest(messages, {}, cts.token);
            for await (const fragment of response.text) {
                outputChannel.append(fragment);
            }
            outputChannel.appendLine("\n");
        }
        catch (err) {
            outputChannel.appendLine(`[Error] Review failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }));
    // Register chat participant (@meridian in Copilot Chat)
    const chatParticipant = (0, chat_participant_1.createChatParticipant)(router, cmdCtx, logger);
    context.subscriptions.push(chatParticipant);
    // Register LM tools so Copilot and @meridian can invoke Meridian commands autonomously
    const toolDisposables = (0, lm_tools_1.registerMeridianTools)(router, cmdCtx, logger);
    context.subscriptions.push(...toolDisposables);
    logger.info(`Extension activated with ${router.listDomains().length} domains`, "activate");
    logger.info(`Registered ${COMMAND_MAP.length} commands`, "activate");
}
/**
 * Deactivate the extension.
 * Called when extension is unloaded. VS Code disposes subscriptions automatically;
 * router teardown cleans up domain services.
 */
async function deactivate() {
    // router is local to activate(); VS Code calls deactivate separately.
    // Domain teardown happens via context.subscriptions disposal.
    // No action needed here beyond the subscription cleanup VS Code performs.
}
var logger_2 = require("./infrastructure/logger");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return logger_2.Logger; } });
var config_2 = require("./infrastructure/config");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_2.Config; } });
//# sourceMappingURL=main.js.map