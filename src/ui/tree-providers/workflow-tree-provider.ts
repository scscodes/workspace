/**
 * Workflow Tree Provider — lists available workflows in the sidebar.
 * Each item has an inline "run" command for one-click execution.
 * Supports running/last-run state indicators per workflow.
 */

import * as vscode from "vscode";
import { Command, CommandContext, Logger, Result } from "../../types";

type Dispatcher = (cmd: Command, ctx: CommandContext) => Promise<Result<unknown>>;

interface WorkflowSummary {
  name: string;
  description?: string;
  version?: string;
  stepCount: number;
}

class WorkflowTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemKind: "root" | "workflow",
    collapsible: vscode.TreeItemCollapsibleState,
    description?: string
  ) {
    super(label, collapsible);
    this.description = description;
    this.contextValue = itemKind;
  }
}

export class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorkflowTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Cache workflow data separately from tree items so state changes rebuild items cheaply
  private cachedWorkflows: WorkflowSummary[] | null = null;

  // Per-workflow execution state
  private runningSet = new Set<string>();
  private lastRuns = new Map<string, { success: boolean; duration: number }>();

  constructor(
    private readonly dispatch: Dispatcher,
    private readonly ctx: CommandContext,
    private readonly logger: Logger
  ) {}

  refresh(): void {
    this.cachedWorkflows = null;
    this._onDidChangeTreeData.fire();
  }

  /** Called by main.ts when a workflow starts executing. */
  setRunning(name: string): void {
    this.runningSet.add(name);
    this._onDidChangeTreeData.fire();
  }

  /** Called by main.ts when a workflow finishes. Updates description with result. */
  setLastRun(name: string, success: boolean, duration: number): void {
    this.runningSet.delete(name);
    this.lastRuns.set(name, { success, duration });
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkflowTreeItem): Promise<WorkflowTreeItem[]> {
    if (element) return [];
    return this.getRootItems();
  }

  private async getRootItems(): Promise<WorkflowTreeItem[]> {
    // Fetch workflow list only if not cached (refresh() clears this)
    if (!this.cachedWorkflows) {
      const result = await this.dispatch({ name: "workflow.list", params: {} }, this.ctx);
      if (result.kind === "err") {
        this.logger.warn("WorkflowTreeProvider: list failed", "WorkflowTreeProvider", result.error);
        const err = new WorkflowTreeItem(
          "Failed to load workflows",
          "root",
          vscode.TreeItemCollapsibleState.None,
          result.error.code
        );
        err.iconPath = new vscode.ThemeIcon("error");
        return [err];
      }
      const { workflows } = result.value as { workflows: WorkflowSummary[]; count: number };
      this.cachedWorkflows = workflows;
    }

    if (this.cachedWorkflows.length === 0) {
      const empty = new WorkflowTreeItem(
        "No workflows found",
        "root",
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    // Build items fresh each time so running/last-run state is always current
    return this.cachedWorkflows.map((w) => {
      const isRunning = this.runningSet.has(w.name);
      const lastRun   = this.lastRuns.get(w.name);

      const description = isRunning
        ? "running\u2026"
        : lastRun
          ? `${lastRun.success ? "\u2713" : "\u2717"} ${(lastRun.duration / 1000).toFixed(1)}s`
          : (w.description ?? `${w.stepCount} step(s)`);

      const it = new WorkflowTreeItem(
        w.name,
        "workflow",
        vscode.TreeItemCollapsibleState.None,
        description
      );
      // "loading~spin" animates in TreeItem iconPath (unlike description which is plain text)
      it.iconPath = new vscode.ThemeIcon(isRunning ? "loading~spin" : "play");
      it.command = {
        command: "meridian.workflow.run",
        title: "Run Workflow",
        arguments: [{ name: w.name }],
      };
      return it;
    });
  }
}
