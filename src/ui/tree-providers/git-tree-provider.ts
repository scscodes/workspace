/**
 * Git Tree Provider — displays branch state and change counts in the sidebar.
 */

import * as vscode from "vscode";
import { GitProvider, GitStatus, Logger } from "../../types";

class GitTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemKind: "branch" | "stat",
    collapsible: vscode.TreeItemCollapsibleState,
    description?: string
  ) {
    super(label, collapsible);
    this.description = description;
    this.contextValue = itemKind;
  }
}

export class GitTreeProvider implements vscode.TreeDataProvider<GitTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cached: GitStatus | null = null;

  constructor(
    private readonly gitProvider: GitProvider,
    private readonly logger: Logger
  ) {}

  refresh(): void {
    this.cached = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GitTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitTreeItem): Promise<GitTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    if (element.itemKind === "branch") {
      return this.getStatItems();
    }
    return [];
  }

  private async getRootItems(): Promise<GitTreeItem[]> {
    if (!this.cached) {
      const result = await this.gitProvider.status();
      if (result.kind === "err") {
        this.logger.warn("GitTreeProvider: status failed", "GitTreeProvider", result.error);
        const err = new GitTreeItem(
          "Git unavailable",
          "stat",
          vscode.TreeItemCollapsibleState.None,
          result.error.code
        );
        err.iconPath = new vscode.ThemeIcon("error");
        return [err];
      }
      this.cached = result.value;
    }

    const s = this.cached;
    const dirty = s.isDirty ? "dirty" : "clean";
    const item = new GitTreeItem(
      s.branch,
      "branch",
      vscode.TreeItemCollapsibleState.Expanded,
      dirty
    );
    item.iconPath = new vscode.ThemeIcon(s.isDirty ? "git-branch" : "check");
    return [item];
  }

  private getStatItems(): GitTreeItem[] {
    if (!this.cached) return [];
    const s = this.cached;
    const items: GitTreeItem[] = [];

    const make = (label: string, count: number, icon: string) => {
      const it = new GitTreeItem(label, "stat", vscode.TreeItemCollapsibleState.None, String(count));
      it.iconPath = new vscode.ThemeIcon(icon);
      return it;
    };

    items.push(make("Staged", s.staged, "diff-added"));
    items.push(make("Unstaged", s.unstaged, "diff-modified"));
    items.push(make("Untracked", s.untracked, "question"));
    return items;
  }
}
