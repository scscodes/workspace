/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */

import * as vscode from "vscode";
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
  ["meridian.workflow.run",    "workflow.run"],
  ["meridian.agent.list",      "agent.list"],
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
  const workflowDomain = createWorkflowDomain(logger, stepRunner);
  const agentDomain = createAgentDomain(logger);

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

  // Register all 10 VS Code commands. Each maps the "meridian.*" vscode ID
  // to the internal bare CommandName. Results surface via OutputChannel + notifications.
  for (const [vsCodeId, commandName] of COMMAND_MAP) {
    const disposable = vscode.commands.registerCommand(
      vsCodeId,
      async (params: Record<string, unknown> = {}) => {
        const cmdCtx = getCommandContext(context);
        const command: Command = { name: commandName, params };
        const result = await router.dispatch(command, cmdCtx);
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

  // Register sidebar tree providers
  const cmdCtx = getCommandContext(context);
  const dispatch = (cmd: Command, ctx: CommandContext) => router.dispatch(cmd, ctx);

  const gitTree      = new GitTreeProvider(gitProvider, logger);
  const hygieneTree  = new HygieneTreeProvider(dispatch, cmdCtx, logger);
  const workflowTree = new WorkflowTreeProvider(dispatch, cmdCtx, logger);
  const agentTree    = new AgentTreeProvider(dispatch, cmdCtx, logger);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("meridian.git.view",      gitTree),
    vscode.window.registerTreeDataProvider("meridian.hygiene.view",  hygieneTree),
    vscode.window.registerTreeDataProvider("meridian.workflow.view", workflowTree),
    vscode.window.registerTreeDataProvider("meridian.agent.view",    agentTree),
  );

  // Register chat participant (@meridian in Copilot Chat)
  const chatParticipant = createChatParticipant(router, cmdCtx, logger);
  context.subscriptions.push(chatParticipant);

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
