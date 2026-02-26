/**
 * Workflow Tree Provider — lists available workflows in the sidebar.
 * Each item has an inline "run" command for one-click execution.
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

  private cached: WorkflowTreeItem[] | null = null;

  constructor(
    private readonly dispatch: Dispatcher,
    private readonly ctx: CommandContext,
    private readonly logger: Logger
  ) {}

  refresh(): void {
    this.cached = null;
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
    if (this.cached) return this.cached;

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

    if (workflows.length === 0) {
      const empty = new WorkflowTreeItem(
        "No workflows found",
        "root",
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    this.cached = workflows.map((w) => {
      const it = new WorkflowTreeItem(
        w.name,
        "workflow",
        vscode.TreeItemCollapsibleState.None,
        w.description ?? `${w.stepCount} step(s)`
      );
      it.iconPath = new vscode.ThemeIcon("play");
      it.command = {
        command: "meridian.workflow.run",
        title: "Run Workflow",
        arguments: [{ name: w.name }],
      };
      return it;
    });
    return this.cached;
  }
}
