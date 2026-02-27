/**
 * Git Tree Provider — displays branch state and change counts in the sidebar.
 * Files within each change group are expandable and open on click.
 */

import * as path from "path";
import * as vscode from "vscode";
import { GitProvider, GitStatus, RecentCommit, Logger } from "../../types";

class GitTreeItem extends vscode.TreeItem {
  filePath?: string;
  category?: string;

  constructor(
    label: string,
    public readonly itemKind: "branch" | "changeGroup" | "changedFile" | "commit",
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
    private readonly logger: Logger,
    private readonly workspaceRoot: string
  ) {}

  refresh(): void {
    this.cached = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GitTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitTreeItem): Promise<GitTreeItem[]> {
    if (!element)                           return this.getRootItems();
    if (element.itemKind === "branch")      return this.getBranchChildren();
    if (element.itemKind === "changeGroup") return this.getFilesForGroup(element);
    return [];
  }

  private async getRootItems(): Promise<GitTreeItem[]> {
    if (!this.cached) {
      const result = await this.gitProvider.status();
      if (result.kind === "err") {
        this.logger.warn("GitTreeProvider: status failed", "GitTreeProvider", result.error);
        const err = new GitTreeItem(
          "Git unavailable",
          "changeGroup",
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

  private async getBranchChildren(): Promise<GitTreeItem[]> {
    const changeGroups = this.getChangeGroupItems();
    const commitsGroup = await this.getRecentCommitsGroup();
    return [...changeGroups, commitsGroup];
  }

  private getChangeGroupItems(): GitTreeItem[] {
    if (!this.cached) return [];
    const s = this.cached;
    const make = (label: string, count: number, icon: string, category: string) => {
      const it = new GitTreeItem(label, "changeGroup",
        count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        String(count));
      it.iconPath = new vscode.ThemeIcon(icon);
      it.category = category;
      return it;
    };
    return [
      make("Staged",    s.staged,    "diff-added",    "staged"),
      make("Unstaged",  s.unstaged,  "diff-modified", "unstaged"),
      make("Untracked", s.untracked, "question",      "untracked"),
    ];
  }

  private async getRecentCommitsGroup(): Promise<GitTreeItem> {
    const result = await this.gitProvider.getRecentCommits(3);
    const commits: RecentCommit[] = result.kind === "ok" ? result.value : [];

    const group = new GitTreeItem(
      "Recent Commits",
      "changeGroup",
      commits.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
      String(commits.length)
    );
    group.iconPath = new vscode.ThemeIcon("history");
    group.category = "recentCommits";

    // Pre-build children so getFilesForGroup can return them immediately
    (group as any).__commits = commits;
    return group;
  }

  private async getFilesForGroup(group: GitTreeItem): Promise<GitTreeItem[]> {
    if (group.category === "recentCommits") {
      const commits: RecentCommit[] = (group as any).__commits ?? [];
      return commits.map(c => {
        const label = c.message.length > 50 ? `${c.message.slice(0, 47)}…` : c.message;
        const it = new GitTreeItem(
          label,
          "commit",
          vscode.TreeItemCollapsibleState.None,
          `+${c.insertions}/-${c.deletions} · ${c.shortHash}`
        );
        it.iconPath = new vscode.ThemeIcon("git-commit");
        it.tooltip = `${c.shortHash} by ${c.author}\n+${c.insertions} / -${c.deletions}`;
        return it;
      });
    }

    if (group.category === "untracked") {
      const placeholder = new GitTreeItem(
        "(untracked files not listed)",
        "changedFile",
        vscode.TreeItemCollapsibleState.None
      );
      placeholder.iconPath = new vscode.ThemeIcon("info");
      return [placeholder];
    }

    const result = await this.gitProvider.getAllChanges();
    if (result.kind === "err") {
      this.logger.warn("GitTreeProvider: getAllChanges failed", "GitTreeProvider", result.error);
      return [];
    }

    const files = result.value.filter(f =>
      group.category === "staged" ? f.status === "A" : f.status !== "A"
    );

    return files.map(f => {
      const absolutePath = path.join(this.workspaceRoot, f.path);
      const iconName =
        f.status === "A" ? "diff-added" :
        f.status === "D" ? "diff-removed" :
        "diff-modified";

      const it = new GitTreeItem(
        path.basename(f.path),
        "changedFile",
        vscode.TreeItemCollapsibleState.None,
        f.path
      );
      it.iconPath = new vscode.ThemeIcon(iconName);
      it.filePath = absolutePath;
      it.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [vscode.Uri.file(absolutePath)],
      };
      return it;
    });
  }
}
