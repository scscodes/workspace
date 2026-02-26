/**
 * Agent Tree Provider — lists discovered agents and their capabilities in the sidebar.
 */

import * as vscode from "vscode";
import { Command, CommandContext, CommandName, Logger, Result } from "../../types";

type Dispatcher = (cmd: Command, ctx: CommandContext) => Promise<Result<unknown>>;

type AgentItemKind = "agent" | "capability";

interface AgentSummary {
  id: string;
  description?: string;
  version?: string;
  capabilities: CommandName[];
  workflowTriggers?: string[];
}

class AgentTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemKind: AgentItemKind,
    public readonly children: AgentTreeItem[],
    collapsible: vscode.TreeItemCollapsibleState,
    description?: string
  ) {
    super(label, collapsible);
    this.description = description;
    this.contextValue = itemKind;
  }
}

export class AgentTreeProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cached: AgentTreeItem[] | null = null;

  constructor(
    private readonly dispatch: Dispatcher,
    private readonly ctx: CommandContext,
    private readonly logger: Logger
  ) {}

  refresh(): void {
    this.cached = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AgentTreeItem): Promise<AgentTreeItem[]> {
    if (!element) return this.getRootItems();
    return element.children;
  }

  private async getRootItems(): Promise<AgentTreeItem[]> {
    if (this.cached) return this.cached;

    const result = await this.dispatch({ name: "agent.list", params: {} }, this.ctx);
    if (result.kind === "err") {
      this.logger.warn("AgentTreeProvider: list failed", "AgentTreeProvider", result.error);
      const err = new AgentTreeItem(
        "Failed to load agents",
        "agent",
        [],
        vscode.TreeItemCollapsibleState.None,
        result.error.code
      );
      err.iconPath = new vscode.ThemeIcon("error");
      return [err];
    }

    const { agents } = result.value as { agents: AgentSummary[]; count: number };

    if (agents.length === 0) {
      const empty = new AgentTreeItem(
        "No agents found",
        "agent",
        [],
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    this.cached = agents.map((a) => {
      const capItems: AgentTreeItem[] = a.capabilities.map((cap) => {
        const it = new AgentTreeItem(
          cap,
          "capability",
          [],
          vscode.TreeItemCollapsibleState.None
        );
        it.iconPath = new vscode.ThemeIcon("symbol-method");
        return it;
      });

      const it = new AgentTreeItem(
        a.id,
        "agent",
        capItems,
        capItems.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        a.version ? `v${a.version}` : undefined
      );
      it.iconPath = new vscode.ThemeIcon("robot");
      it.tooltip = a.description;
      return it;
    });
    return this.cached;
  }
}
