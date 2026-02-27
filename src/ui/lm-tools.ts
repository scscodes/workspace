/**
 * LM Tools — registers Meridian commands as VS Code Language Model Tools.
 *
 * Enables autonomous tool invocation by GitHub Copilot and the @meridian
 * chat participant. Each tool wraps a CommandRouter dispatch call and returns
 * a formatted text result the LLM can reason over.
 */

import * as vscode from "vscode";
import { CommandRouter } from "../router";
import { CommandContext, CommandName } from "../types";
import { Logger } from "../infrastructure/logger";
import { formatResultMessage } from "../infrastructure/result-handler";

interface ToolDef {
  readonly name: string;
  readonly commandName: CommandName;
}

const TOOL_DEFS: readonly ToolDef[] = [
  { name: "meridian_git_status",          commandName: "git.status"         },
  { name: "meridian_git_smart_commit",    commandName: "git.smartCommit"    },
  { name: "meridian_git_analyze_inbound", commandName: "git.analyzeInbound" },
  { name: "meridian_hygiene_scan",        commandName: "hygiene.scan"       },
  { name: "meridian_workflow_run",        commandName: "workflow.run"       },
  { name: "meridian_git_show_analytics",  commandName: "git.showAnalytics"  },
] as const;

export function registerMeridianTools(
  router: CommandRouter,
  ctx: CommandContext,
  logger: Logger
): vscode.Disposable[] {
  return TOOL_DEFS.map(({ name, commandName }) =>
    vscode.lm.registerTool(name, {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
        _token: vscode.CancellationToken
      ): Promise<vscode.LanguageModelToolResult> {
        const params = (options.input ?? {}) as Record<string, unknown>;
        logger.info(`LM tool invoked: ${name}`, "LMTools");

        const result = await router.dispatch({ name: commandName, params }, ctx);
        const { message } = formatResultMessage(commandName, result);

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(message),
        ]);
      },
    })
  );
}
