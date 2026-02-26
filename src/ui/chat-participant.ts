/**
 * Chat Participant — exposes Meridian commands via @meridian in Copilot Chat.
 *
 * Slash commands: /status, /scan, /workflows, /agents, /context
 * Free-form text falls back to chat.context.
 */

import * as vscode from "vscode";
import { CommandRouter } from "../router";
import { Command, CommandContext, CommandName } from "../types";
import { Logger } from "../infrastructure/logger";

const SLASH_MAP: Record<string, CommandName> = {
  "/status":    "git.status",
  "/scan":      "hygiene.scan",
  "/workflows": "workflow.list",
  "/agents":    "agent.list",
  "/context":   "chat.context",
};

export function createChatParticipant(
  router: CommandRouter,
  ctx: CommandContext,
  logger: Logger
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (request, _chatCtx, stream, _token) => {
    const text = request.prompt.trim();
    const firstWord = text.split(" ")[0];
    const commandName: CommandName = SLASH_MAP[firstWord] ?? "chat.context";
    const rest = text.includes(" ") ? text.slice(firstWord.length + 1).trim() : "";
    const params: Record<string, unknown> = rest ? { input: rest } : {};

    stream.markdown(`\`@meridian\` → \`${commandName}\`\n\n`);

    const cmd: Command = { name: commandName, params };
    const result = await router.dispatch(cmd, ctx);

    if (result.kind === "ok") {
      const json = JSON.stringify(result.value, null, 2);
      stream.markdown("```json\n" + json + "\n```");
    } else {
      logger.warn(`Chat participant command failed: ${commandName}`, "ChatParticipant", result.error);
      stream.markdown(`**Error** \`${result.error.code}\`: ${result.error.message}`);
    }
  };

  const participant = vscode.chat.createChatParticipant("meridian", handler);
  participant.iconPath = vscode.Uri.joinPath(
    vscode.Uri.file(ctx.extensionPath),
    "media",
    "icon.svg"
  );
  return participant;
}
