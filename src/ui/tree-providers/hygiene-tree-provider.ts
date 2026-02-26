/**
 * Hygiene Tree Provider — displays workspace scan results in the sidebar.
 */

import * as vscode from "vscode";
import { Command, CommandContext, Logger, Result, WorkspaceScan } from "../../types";

type Dispatcher = (cmd: Command, ctx: CommandContext) => Promise<Result<unknown>>;

type HygieneItemKind = "category" | "file";

class HygieneTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemKind: HygieneItemKind,
    public readonly children: HygieneTreeItem[],
    collapsible: vscode.TreeItemCollapsibleState,
    description?: string
  ) {
    super(label, collapsible);
    this.description = description;
    this.contextValue = itemKind;
  }
}

export class HygieneTreeProvider implements vscode.TreeDataProvider<HygieneTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HygieneTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cached: HygieneTreeItem[] | null = null;

  constructor(
    private readonly dispatch: Dispatcher,
    private readonly ctx: CommandContext,
    private readonly logger: Logger
  ) {}

  refresh(): void {
    this.cached = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HygieneTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: HygieneTreeItem): Promise<HygieneTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    return element.children;
  }

  private async getRootItems(): Promise<HygieneTreeItem[]> {
    if (this.cached) return this.cached;

    const result = await this.dispatch({ name: "hygiene.scan", params: {} }, this.ctx);
    if (result.kind === "err") {
      this.logger.warn("HygieneTreeProvider: scan failed", "HygieneTreeProvider", result.error);
      const err = new HygieneTreeItem(
        "Scan failed",
        "category",
        [],
        vscode.TreeItemCollapsibleState.None,
        result.error.code
      );
      err.iconPath = new vscode.ThemeIcon("error");
      return [err];
    }

    const scan = result.value as WorkspaceScan;
    const makeFileItem = (path: string): HygieneTreeItem => {
      const it = new HygieneTreeItem(
        path.split("/").pop() ?? path,
        "file",
        [],
        vscode.TreeItemCollapsibleState.None,
        path
      );
      it.iconPath = new vscode.ThemeIcon("file");
      return it;
    };

    const makeCategory = (
      label: string,
      icon: string,
      children: HygieneTreeItem[]
    ): HygieneTreeItem => {
      const it = new HygieneTreeItem(
        label,
        "category",
        children,
        children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        String(children.length)
      );
      it.iconPath = new vscode.ThemeIcon(icon);
      return it;
    };

    const deadItems = scan.deadFiles.map(makeFileItem);
    const largeItems = scan.largeFiles.map((f) => {
      const it = makeFileItem(f.path);
      it.description = `${(f.sizeBytes / 1024).toFixed(1)} KB`;
      return it;
    });
    const logItems = scan.logFiles.map(makeFileItem);

    this.cached = [
      makeCategory("Dead Files", "trash", deadItems),
      makeCategory("Large Files", "database", largeItems),
      makeCategory("Log Files", "output", logItems),
    ];
    return this.cached;
  }
}
