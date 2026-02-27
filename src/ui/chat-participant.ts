/**
 * Chat Participant — exposes Meridian commands via @meridian in Copilot Chat.
 *
 * Routing priority:
 *   1. request.command  — VS Code routes /slash commands here (no leading slash)
 *   2. SLASH_MAP        — explicit "/keyword" in prompt (legacy fallback)
 *   3. KEYWORD_MAP      — single-word natural language ("status", "agents", etc.)
 *   4. LLM classifier   — multi-word free-form; model picks command, we dispatch
 */

import * as vscode from "vscode";
import { CommandRouter } from "../router";
import { Command, CommandContext, CommandName } from "../types";
import { Logger } from "../infrastructure/logger";
import { formatResultMessage } from "../infrastructure/result-handler";

// Declared slash commands (mirrors package.json chatParticipants.commands[].name)
const SLASH_MAP: Record<string, CommandName> = {
  "/status":    "git.status",
  "/scan":      "hygiene.scan",
  "/workflows": "workflow.list",
  "/agents":    "agent.list",
  "/analytics": "git.showAnalytics",
  "/context":   "chat.context",
};

// Single-word natural language keywords → direct dispatch, no LLM needed
const KEYWORD_MAP: Record<string, CommandName> = {
  "status":    "git.status",
  "scan":      "hygiene.scan",
  "hygiene":   "hygiene.scan",
  "workflows": "workflow.list",
  "workflow":  "workflow.list",
  "agents":    "agent.list",
  "agent":     "agent.list",
  "analytics": "git.showAnalytics",
  "commit":    "git.smartCommit",
  "pull":      "git.pull",
  "context":   "chat.context",
};

// Classifier prompt: tells the LLM to pick one command ID from a known list.
// The model responds with ONLY the command name — no prose, no markdown.
const CLASSIFIER_SYSTEM = `You are a command classifier for the Meridian VS Code extension.
Given the user's request, respond with EXACTLY ONE command ID from this list, or "chat.context" if none apply.

git.status        – check branch, staged/unstaged/untracked file counts
git.smartCommit   – group and commit staged changes with AI-suggested messages
git.pull          – pull latest changes from remote
git.analyzeInbound – analyze incoming remote changes for conflicts
git.showAnalytics  – open the git analytics report (commits, churn, authors)
hygiene.scan      – scan workspace for large files, dead files, stale logs
workflow.list     – list all available workflows
workflow.run:<name> – run a named workflow (replace <name>)
agent.list        – list all available agents and their capabilities
chat.context      – show branch, active file, and available commands

Respond with ONLY the command ID (e.g. "git.status" or "workflow.run:my-workflow"). Nothing else.`;

export function createChatParticipant(
  router: CommandRouter,
  ctx: CommandContext,
  logger: Logger
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (request, _chatCtx, stream, token) => {
    // Debug: log incoming request shape so issues can be diagnosed
    logger.info(
      `Chat request — command: ${JSON.stringify(request.command)}, prompt: ${JSON.stringify(request.prompt)}`,
      "ChatParticipant"
    );

    // ── 1. request.command: VS Code routes /slash commands here ─────────────
    //    e.g. "@meridian /status"  →  request.command = "status"
    if (request.command) {
      const cmd = request.command.toLowerCase();
      const commandName = SLASH_MAP[`/${cmd}`] ?? KEYWORD_MAP[cmd];
      if (commandName) {
        logger.info(`Routing via request.command: ${cmd} → ${commandName}`, "ChatParticipant");
        stream.markdown(`\`@meridian\` → \`${commandName}\`\n\n`);
        return handleDirectDispatch(commandName, {}, router, ctx, stream, logger);
      }
    }

    const text = request.prompt.trim();
    const firstWord = text.split(" ")[0].toLowerCase();

    // ── 2. SLASH_MAP: explicit "/keyword" in prompt ──────────────────────────
    if (firstWord in SLASH_MAP) {
      const commandName = SLASH_MAP[firstWord];
      stream.markdown(`\`@meridian\` → \`${commandName}\`\n\n`);
      return handleDirectDispatch(commandName, {}, router, ctx, stream, logger);
    }

    // ── 3. "run <name>" shorthand ────────────────────────────────────────────
    if (firstWord === "run" && text.length > 4) {
      const name = text.slice(4).trim();
      stream.markdown(`\`@meridian\` → \`workflow.run\`\n\n`);
      return handleDirectDispatch("workflow.run", { name }, router, ctx, stream, logger);
    }

    // ── 4. KEYWORD_MAP: single-word natural language ─────────────────────────
    if (firstWord in KEYWORD_MAP) {
      const commandName = KEYWORD_MAP[firstWord];
      stream.markdown(`\`@meridian\` → \`${commandName}\`\n\n`);
      return handleDirectDispatch(commandName, {}, router, ctx, stream, logger);
    }

    // ── 5. LLM classifier: multi-word free-form ──────────────────────────────
    if (text.length > 0) {
      return handleClassifier(text, request, token, router, ctx, stream, logger);
    }

    // ── 6. Empty prompt fallback ─────────────────────────────────────────────
    stream.markdown(`\`@meridian\` — use \`/status\`, \`/scan\`, \`/workflows\`, \`/agents\`, \`/analytics\`, or just describe what you need.`);
  };

  const participant = vscode.chat.createChatParticipant("meridian", handler);
  participant.iconPath = vscode.Uri.joinPath(
    vscode.Uri.file(ctx.extensionPath),
    "media",
    "icon.svg"
  );
  return participant;
}

// ── Direct dispatch (slash commands, keywords, "run <name>") ────────────────

async function handleDirectDispatch(
  commandName: CommandName,
  params: Record<string, unknown>,
  router: CommandRouter,
  ctx: CommandContext,
  stream: vscode.ChatResponseStream,
  logger: Logger
): Promise<void> {
  const cmd: Command = { name: commandName, params };
  const result = await router.dispatch(cmd, ctx);

  if (result.kind === "ok") {
    if (commandName === "chat.context") {
      const v = result.value as Record<string, unknown>;
      const gitStatus = v.gitStatus as Record<string, unknown> | undefined;
      const branch = v.gitBranch ?? gitStatus?.branch ?? "unknown";
      const dirty = gitStatus?.isDirty ? "dirty" : "clean";
      const file = v.activeFile ?? "none";
      stream.markdown(
        `**Branch:** \`${branch}\` (${dirty})\n\n` +
        `**Active file:** \`${file}\`\n\n` +
        `Slash commands: \`/status\` \`/scan\` \`/workflows\` \`/agents\` \`/analytics\`\n\n` +
        `Or ask naturally: _"show me my agents"_, _"what workflows do I have?"_, _"scan for issues"_`
      );
    } else {
      const msg = formatResultMessage(commandName, result);
      stream.markdown(msg.message);
      if (commandName === "workflow.list" || commandName === "agent.list") {
        stream.markdown("\n\n```json\n" + JSON.stringify(result.value, null, 2) + "\n```");
      }
    }
  } else {
    logger.warn(`Chat dispatch failed: ${commandName}`, "ChatParticipant", result.error);
    stream.markdown(`**Error** \`${result.error.code}\`: ${result.error.message}`);
  }
}

// ── LLM classifier path ──────────────────────────────────────────────────────

async function handleClassifier(
  text: string,
  request: vscode.ChatRequest,
  token: vscode.CancellationToken,
  router: CommandRouter,
  ctx: CommandContext,
  stream: vscode.ChatResponseStream,
  logger: Logger
): Promise<void> {
  logger.info(`LLM classifier invoked for: "${text}"`, "ChatParticipant");
  logger.info(`request.model available: ${!!request.model}`, "ChatParticipant");

  if (!request.model) {
    logger.warn("No model on request, falling back to chat.context", "ChatParticipant");
    stream.markdown(`\`@meridian\` → \`chat.context\`\n\n`);
    return handleDirectDispatch("chat.context", {}, router, ctx, stream, logger);
  }

  stream.progress("Figuring out what you need...");

  try {
    const messages = [
      vscode.LanguageModelChatMessage.User(`${CLASSIFIER_SYSTEM}\n\nUser request: "${text}"`),
    ];

    const response = await request.model.sendRequest(messages, {}, token);

    let classification = "";
    for await (const part of response.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        classification += part.value;
      }
    }
    classification = classification.trim().split("\n")[0].trim();

    logger.info(`LLM classified as: "${classification}"`, "ChatParticipant");

    // Handle "workflow.run:<name>"
    if (classification.startsWith("workflow.run:")) {
      const workflowName = classification.slice("workflow.run:".length).trim();
      stream.markdown(`\`@meridian\` → \`workflow.run\` (${workflowName})\n\n`);
      return handleDirectDispatch("workflow.run", { name: workflowName }, router, ctx, stream, logger);
    }

    // Map classifier output to a valid CommandName
    const VALID_COMMANDS: Record<string, CommandName> = {
      "git.status":         "git.status",
      "git.smartCommit":    "git.smartCommit",
      "git.pull":           "git.pull",
      "git.analyzeInbound": "git.analyzeInbound",
      "git.showAnalytics":  "git.showAnalytics",
      "hygiene.scan":       "hygiene.scan",
      "workflow.list":      "workflow.list",
      "agent.list":         "agent.list",
      "chat.context":       "chat.context",
    };

    const commandName = VALID_COMMANDS[classification] ?? "chat.context";
    stream.markdown(`\`@meridian\` → \`${commandName}\`\n\n`);
    return handleDirectDispatch(commandName, {}, router, ctx, stream, logger);

  } catch (err) {
    logger.warn(
      `LLM classifier failed: ${err instanceof Error ? err.message : String(err)}`,
      "ChatParticipant"
    );
    stream.markdown(`\`@meridian\` → \`chat.context\`\n\n`);
    return handleDirectDispatch("chat.context", {}, router, ctx, stream, logger);
  }
}
