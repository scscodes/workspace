/**
 * Result → user-facing message converter.
 * Maps Result<unknown> + command name to a level + human-readable string
 * suitable for OutputChannel and vscode.window notifications.
 */

import { Result } from "../types";
import { CommandName } from "../types";

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  NO_CHANGES:               "No changes to commit.",
  NO_GROUPS_APPROVED:       "No commit groups were approved.",
  GIT_UNAVAILABLE:          "Git is not available in this workspace.",
  GIT_STATUS_ERROR:         "Failed to read git status.",
  GIT_PULL_ERROR:           "Git pull failed.",
  GIT_COMMIT_ERROR:         "Commit failed.",
  GIT_FETCH_ERROR:          "Fetch failed.",
  BATCH_COMMIT_ERROR:       "One or more commits failed.",
  HYGIENE_SCAN_ERROR:       "Workspace scan failed.",
  HYGIENE_CLEANUP_ERROR:    "Cleanup failed.",
  HANDLER_NOT_FOUND:        "Command not recognized.",
  WORKFLOW_EXECUTION_ERROR: "Workflow execution failed.",
  INVALID_WORKFLOW:         "Workflow definition is invalid.",
  CHAT_CONTEXT_ERROR:       "Failed to gather chat context.",
  CHAT_DELEGATE_ERROR:      "Failed to delegate chat action.",
};

export interface UserMessage {
  level: "info" | "error";
  message: string;
}

export function formatResultMessage(
  commandName: string,
  result: Result<unknown>
): UserMessage {
  if (result.kind === "err") {
    const msg = ERROR_MESSAGES[result.error.code] ?? result.error.message;
    return { level: "error", message: `[${commandName}] ${msg}` };
  }

  const v = result.value as Record<string, unknown>;

  switch (commandName as CommandName) {
    case "git.status": {
      const branch = v.branch ?? "unknown";
      const dirty = v.isDirty ? "dirty" : "clean";
      return { level: "info", message: `${branch} (${dirty}) — staged: ${v.staged}, unstaged: ${v.unstaged}, untracked: ${v.untracked}` };
    }
    case "git.pull":
      return { level: "info", message: `Pulled: ${(v as any).message ?? "up to date"}` };
    case "git.commit":
      return { level: "info", message: `Committed: ${v}` };
    case "git.smartCommit": {
      const sc = v as any;
      return { level: "info", message: `Smart commit: ${sc.totalGroups} group(s), ${sc.totalFiles} file(s)` };
    }
    case "hygiene.scan": {
      const dead = ((v.deadFiles as unknown[]) ?? []).length;
      const large = ((v.largeFiles as unknown[]) ?? []).length;
      const logs = ((v.logFiles as unknown[]) ?? []).length;
      return { level: "info", message: `Scan complete — dead: ${dead}, large: ${large}, logs: ${logs}` };
    }
    case "hygiene.cleanup":
      return { level: "info", message: "Cleanup complete." };
    case "workflow.list":
      return { level: "info", message: `Found ${v.count ?? 0} workflow(s)` };
    case "workflow.run":
      return { level: "info", message: `Workflow finished.` };
    case "agent.list":
      return { level: "info", message: `Found ${v.count ?? 0} agent(s)` };
    case "chat.context":
      return { level: "info", message: "Chat context gathered." };
    case "chat.delegate":
      return { level: "info", message: `Delegated: ${(v as any).message ?? "OK"}` };
    default:
      return { level: "info", message: `[${commandName}] OK` };
  }
}
