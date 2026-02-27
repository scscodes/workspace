/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as nodePath from "path";
import { CommandRouter } from "./router";
import { Logger } from "./infrastructure/logger";
import { Config } from "./infrastructure/config";
import { CommandContext, CommandName, Command, Middleware, MiddlewareContext } from "./types";
import { createGitDomain } from "./domains/git/service";
import { createHygieneDomain } from "./domains/hygiene/service";
import { createChatDomain } from "./domains/chat/service";
import { createWorkflowDomain } from "./domains/workflow/service";
import { createAgentDomain } from "./domains/agent/service";
import {
  createLoggingMiddleware,
  createAuditMiddleware,
} from "./cross-cutting/middleware";
import { StepRunner } from "./infrastructure/workflow-engine";
import { createGitProvider } from "./infrastructure/git-provider";
import { createWorkspaceProvider } from "./infrastructure/workspace-provider";
import {
  TelemetryTracker,
  ConsoleTelemetrySink,
} from "./infrastructure/telemetry";
import { formatResultMessage } from "./infrastructure/result-handler";
import { GitTreeProvider } from "./ui/tree-providers/git-tree-provider";
import { HygieneTreeProvider } from "./ui/tree-providers/hygiene-tree-provider";
import { WorkflowTreeProvider } from "./ui/tree-providers/workflow-tree-provider";
import { AgentTreeProvider } from "./ui/tree-providers/agent-tree-provider";
import { createChatParticipant } from "./ui/chat-participant";
import { registerMeridianTools } from "./ui/lm-tools";
import { AnalyticsWebviewProvider, HygieneAnalyticsWebviewProvider } from "./infrastructure/webview-provider";
import { GitAnalyticsReport } from "./domains/git/analytics-types";
import { HygieneAnalyticsReport, PruneConfig, PRUNE_DEFAULTS } from "./domains/hygiene/analytics-types";
import { selectModel } from "./infrastructure/model-selector";

/** Read user-configured prune settings, falling back to PRUNE_DEFAULTS */
function readPruneConfig(): PruneConfig {
  const cfg = vscode.workspace.getConfiguration("meridian.hygiene.prune");
  return {
    minAgeDays:   cfg.get<number>("minAgeDays",   PRUNE_DEFAULTS.minAgeDays),
    maxSizeMB:    cfg.get<number>("maxSizeMB",    PRUNE_DEFAULTS.maxSizeMB),
    minLineCount: cfg.get<number>("minLineCount",  PRUNE_DEFAULTS.minLineCount),
    categories:   cfg.get<PruneConfig["categories"]>("categories", PRUNE_DEFAULTS.categories),
  };
}

// ============================================================================
// Telemetry Middleware Factory
// ============================================================================

/**
 * Creates a middleware that emits COMMAND_STARTED, COMMAND_COMPLETED, and
 * COMMAND_FAILED telemetry events around each dispatched command.
 */
function createTelemetryMiddleware(telemetry: TelemetryTracker): Middleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    const start = Date.now();
    telemetry.trackCommandStarted(ctx.commandName);
    try {
      await next();
      telemetry.trackCommandCompleted(
        ctx.commandName,
        Date.now() - start,
        "success"
      );
    } catch (err) {
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
function getCommandContext(context: vscode.ExtensionContext): CommandContext {
  return {
    extensionPath: context.extensionUri.fsPath,
    workspaceFolders:
      vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [],
    activeFilePath:
      vscode.window.activeTextEditor?.document.uri.fsPath,
  };
}

// ============================================================================
// Command ID → Internal CommandName mapping
// ============================================================================

const COMMAND_MAP: ReadonlyArray<[string, CommandName]> = [
  ["meridian.git.status",      "git.status"],
  ["meridian.git.pull",        "git.pull"],
  ["meridian.git.commit",      "git.commit"],
  ["meridian.git.smartCommit", "git.smartCommit"],
  ["meridian.hygiene.scan",    "hygiene.scan"],
  ["meridian.hygiene.cleanup", "hygiene.cleanup"],
  ["meridian.chat.context",    "chat.context"],
  ["meridian.workflow.list",   "workflow.list"],
  ["meridian.agent.list",        "agent.list"],
  ["meridian.git.showAnalytics",     "git.showAnalytics"],
  ["meridian.git.exportJson",        "git.exportJson"],
  ["meridian.git.exportCsv",         "git.exportCsv"],
  ["meridian.hygiene.showAnalytics", "hygiene.showAnalytics"],
];

// ============================================================================
// Extension Activation
// ============================================================================

/**
 * Activate the extension.
 * Called by VS Code when activation event is triggered.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {

  // Initialize infrastructure layer
  const logger = new Logger();
  const config = new Config();
  await config.initialize();

  // Output channel — primary user-facing log surface
  const outputChannel = vscode.window.createOutputChannel("Meridian");
  context.subscriptions.push(outputChannel);

  // Initialize telemetry
  const telemetry = new TelemetryTracker(new ConsoleTelemetrySink(false));

  // Resolve workspace root from VS Code workspace folders
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // Resolve extension path
  const extensionPath = context.extensionUri.fsPath;

  // Initialize real providers
  const gitProvider = createGitProvider(workspaceRoot);
  const workspaceProvider = createWorkspaceProvider(workspaceRoot);

  // Create router
  const router = new CommandRouter(logger);

  // Register middleware (telemetry first, then logging, then audit)
  router.use(createTelemetryMiddleware(telemetry));
  router.use(createLoggingMiddleware(logger));
  router.use(createAuditMiddleware(logger));

  // Create step runner for workflow engine (allows workflows to dispatch commands)
  const stepRunner: StepRunner = async (command: Command, ctx: CommandContext) => {
    const result = await router.dispatch(command, ctx);
    if (result.kind === "ok") {
      return { kind: "ok" as const, value: (result.value as Record<string, unknown>) || {} };
    }
    return result as any;
  };

  // Register domains
  const gitDomain = createGitDomain(gitProvider, logger);
  const hygieneDomain = createHygieneDomain(workspaceProvider, logger);
  const chatDomain = createChatDomain(
    gitProvider,
    logger,
    (cmd, ctx) => router.dispatch(cmd, ctx)
  );
  const workflowDomain = createWorkflowDomain(logger, stepRunner, workspaceRoot, extensionPath);
  const agentDomain = createAgentDomain(logger, workspaceRoot, extensionPath);

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
  const analyticsPanel = new AnalyticsWebviewProvider(
    context.extensionUri,
    workspaceRoot,
    async (opts) => {
      const result = await router.dispatch({ name: "git.showAnalytics", params: opts }, cmdCtx);
      if (result.kind === "ok") { return result.value as GitAnalyticsReport; }
      throw new Error((result as any).error?.message ?? "Analytics failed");
    }
  );

  // Hygiene analytics webview panel
  const hygieneAnalyticsPanel = new HygieneAnalyticsWebviewProvider(
    context.extensionUri,
    async () => {
      const freshCtx = getCommandContext(context);
      const result = await router.dispatch(
        { name: "hygiene.showAnalytics", params: readPruneConfig() },
        freshCtx
      );
      if (result.kind === "ok") return result.value as HygieneAnalyticsReport;
      throw new Error((result as any).error?.message ?? "Hygiene analytics failed");
    }
  );

  // Register all 10 VS Code commands. Each maps the "meridian.*" vscode ID
  // to the internal bare CommandName. Results surface via OutputChannel + notifications.
  for (const [vsCodeId, commandName] of COMMAND_MAP) {
    const disposable = vscode.commands.registerCommand(
      vsCodeId,
      async (params: Record<string, unknown> = {}) => {
        const cmdCtx = getCommandContext(context);

        // hygiene.showAnalytics: inject user prune config before dispatching
        if (commandName === "hygiene.showAnalytics") {
          const pruneResult = await router.dispatch(
            { name: "hygiene.showAnalytics", params: readPruneConfig() },
            cmdCtx
          );
          if (pruneResult.kind === "ok") {
            await hygieneAnalyticsPanel.openPanel(pruneResult.value as HygieneAnalyticsReport);
            outputChannel.appendLine(`[${new Date().toISOString()}] Hygiene analytics panel opened`);
          } else {
            const { message } = formatResultMessage(commandName, pruneResult);
            vscode.window.showErrorMessage(message);
          }
          return;
        }

        const command: Command = { name: commandName, params };
        const result = await router.dispatch(command, cmdCtx);

        // git.showAnalytics opens the webview panel instead of a notification
        if (commandName === "git.showAnalytics" && result.kind === "ok") {
          await analyticsPanel.openPanel(result.value as GitAnalyticsReport);
          outputChannel.appendLine(`[${new Date().toISOString()}] Analytics panel opened`);
          return;
        }

        const { level, message } = formatResultMessage(commandName, result);
        outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
        if (level === "info") {
          vscode.window.showInformationMessage(message);
        } else {
          vscode.window.showErrorMessage(message);
        }
      }
    );
    context.subscriptions.push(disposable);
  }

  const dispatch = (cmd: Command, ctx: CommandContext) => router.dispatch(cmd, ctx);

  const gitTree      = new GitTreeProvider(gitProvider, logger, workspaceRoot);
  const hygieneTree  = new HygieneTreeProvider(dispatch, cmdCtx, logger);
  const workflowTree = new WorkflowTreeProvider(dispatch, cmdCtx, logger);
  const agentTree    = new AgentTreeProvider(dispatch, cmdCtx, logger);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("meridian.git.view",      gitTree),
    vscode.window.registerTreeDataProvider("meridian.hygiene.view",  hygieneTree),
    vscode.window.registerTreeDataProvider("meridian.workflow.view", workflowTree),
    vscode.window.registerTreeDataProvider("meridian.agent.view",    agentTree),
  );

  // Refresh commands — wire to each tree provider's refresh() method
  context.subscriptions.push(
    vscode.commands.registerCommand("meridian.git.refresh",      () => gitTree.refresh()),
    vscode.commands.registerCommand("meridian.hygiene.refresh",  () => hygieneTree.refresh()),
    vscode.commands.registerCommand("meridian.workflow.refresh", () => workflowTree.refresh()),
    vscode.commands.registerCommand("meridian.agent.refresh",    () => agentTree.refresh()),
  );

  // workflow.run — registered after tree providers so workflowTree is in scope.
  // VS Code passes the TreeItem as the first arg when invoked from context/inline menus
  // but passes { name: "..." } when invoked from it.command.arguments (click).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "meridian.workflow.run",
      async (arg: unknown = {}) => {
        const freshCtx = getCommandContext(context);
        let name: string | undefined;

        if (arg && typeof arg === "object") {
          const obj = arg as Record<string, unknown>;
          if (typeof obj.name === "string" && obj.name) {
            name = obj.name;
          } else if (typeof obj.label === "string" && obj.label) {
            name = obj.label;
          }
        }

        if (!name) {
          vscode.window.showErrorMessage("No workflow selected.");
          return;
        }

        workflowTree.setRunning(name);
        const result = await router.dispatch({ name: "workflow.run", params: { name } }, freshCtx);
        const r = result.kind === "ok" ? (result.value as any) : null;
        workflowTree.setLastRun(name, r?.success ?? result.kind === "ok", r?.duration ?? 0);

        // Log to output channel only — tree item description shows the result
        const { message } = formatResultMessage("workflow.run", result);
        outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
      }
    )
  );

  // Hygiene file actions — registered after tree providers so hygieneTree is in scope.
  context.subscriptions.push(
    vscode.commands.registerCommand("meridian.hygiene.deleteFile", async (item: any) => {
      const filePath: string | undefined = item?.filePath;
      if (!filePath) return;
      const filename = nodePath.basename(filePath);
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${filename}"? This cannot be undone.`,
        { modal: true }, "Delete"
      );
      if (confirm !== "Delete") return;
      const freshCtx = getCommandContext(context);
      const result = await router.dispatch(
        { name: "hygiene.cleanup", params: { files: [filePath] } }, freshCtx
      );
      if (result.kind === "ok") {
        vscode.window.showInformationMessage(`Deleted: ${filename}`);
        hygieneTree.refresh();
      } else {
        vscode.window.showErrorMessage(`Delete failed: ${(result as any).error.message}`);
      }
    }),
    vscode.commands.registerCommand("meridian.hygiene.ignoreFile", async (item: any) => {
      const filePath: string | undefined = item?.filePath;
      if (!filePath) return;
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const ignorePath = nodePath.join(wsRoot, ".meridianignore");
      const pattern = nodePath.relative(wsRoot, filePath);
      fs.appendFileSync(ignorePath, `\n${pattern}\n`);
      vscode.window.showInformationMessage(`Added to .meridianignore: ${pattern}`);
      hygieneTree.refresh();
    }),
    vscode.commands.registerCommand("meridian.hygiene.reviewFile", async (item: any) => {
      const filePath: string | undefined = item?.filePath;
      if (!filePath) return;

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        vscode.window.showErrorMessage(`Could not read: ${nodePath.basename(filePath)}`);
        return;
      }

      const model = await selectModel("hygiene");
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
        vscode.LanguageModelChatMessage.User(
          `You are a critical technical reviewer. Analyze this Markdown document and provide concise, actionable feedback on:\n1. Content accuracy and factual correctness\n2. Clarity and readability\n3. Completeness (gaps or missing context)\n4. Effectiveness (does it achieve its purpose?)\n5. Top 3 specific improvements\n\nDocument: ${filename}\n\`\`\`markdown\n${content}\n\`\`\``
        ),
      ];

      try {
        const cts = new vscode.CancellationTokenSource();
        context.subscriptions.push(cts);
        const response = await model.sendRequest(messages, {}, cts.token);
        for await (const fragment of response.text) {
          outputChannel.append(fragment);
        }
        outputChannel.appendLine("\n");
      } catch (err) {
        outputChannel.appendLine(`[Error] Review failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Register chat participant (@meridian in Copilot Chat)
  const chatParticipant = createChatParticipant(router, cmdCtx, logger);
  context.subscriptions.push(chatParticipant);

  // Register LM tools so Copilot and @meridian can invoke Meridian commands autonomously
  const toolDisposables = registerMeridianTools(router, cmdCtx, logger);
  context.subscriptions.push(...toolDisposables);

  logger.info(
    `Extension activated with ${router.listDomains().length} domains`,
    "activate"
  );
  logger.info(
    `Registered ${COMMAND_MAP.length} commands`,
    "activate"
  );
}

/**
 * Deactivate the extension.
 * Called when extension is unloaded. VS Code disposes subscriptions automatically;
 * router teardown cleans up domain services.
 */
export async function deactivate(): Promise<void> {
  // router is local to activate(); VS Code calls deactivate separately.
  // Domain teardown happens via context.subscriptions disposal.
  // No action needed here beyond the subscription cleanup VS Code performs.
}

// ============================================================================
// Exports for Testing / Integration
// ============================================================================

export { CommandRouter };
export { Logger } from "./infrastructure/logger";
export { Config } from "./infrastructure/config";
