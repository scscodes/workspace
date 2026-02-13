import * as vscode from 'vscode';
import { join } from 'node:path';
import { TOOL_REGISTRY } from '@aidev/core';
import type { ToolRegistryEntry, ScanResult, Finding, Severity, ToolId } from '@aidev/core';
import type { ToolRunner } from '../tools/runner.js';

// ─── Severity Icons ─────────────────────────────────────────────────────────

const SEVERITY_ICONS: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'lightbulb',
};

// ─── Tool Icons ─────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  'dead-code': 'search',
  'lint': 'checklist',
  'comments': 'comment',
  'commit': 'git-commit',
  'tldr': 'book',
};

// ─── Tools Tree ─────────────────────────────────────────────────────────────

/**
 * Tree data provider for the "Tools" view in the AIDev sidebar.
 * One clickable item per registered tool.
 */
export class ToolsTreeProvider implements vscode.TreeDataProvider<ToolTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ToolTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: ToolTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ToolTreeItem[] {
    return TOOL_REGISTRY.map(
      (entry) => new ToolTreeItem(entry, TOOL_ICONS[entry.id] ?? 'beaker'),
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

class ToolTreeItem extends vscode.TreeItem {
  constructor(entry: ToolRegistryEntry, iconId: string) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = entry.description;
    this.command = {
      command: entry.commandId,
      title: entry.name,
    };
    this.iconPath = new vscode.ThemeIcon(iconId);
  }
}

// ─── Results Tree ───────────────────────────────────────────────────────────

type ResultTreeNode = ToolGroupItem | FindingItem;

/**
 * Tree data provider for the "Results" view.
 * Groups findings by tool, each finding clickable for jump-to-source.
 */
export class ResultsTreeProvider implements vscode.TreeDataProvider<ResultTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ResultTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private results = new Map<ToolId, ScanResult>();

  /**
   * Update results for a specific tool. Triggers tree refresh.
   */
  setResult(result: ScanResult): void {
    this.results.set(result.toolId, result);
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Clear all results.
   */
  clear(): void {
    this.results.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ResultTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ResultTreeNode): ResultTreeNode[] {
    if (!element) {
      // Root level: show tool groups
      if (this.results.size === 0) {
        return [new PlaceholderItem()];
      }

      return Array.from(this.results.entries()).map(
        ([toolId, result]) => new ToolGroupItem(toolId, result),
      );
    }

    if (element instanceof ToolGroupItem) {
      // Tool group: show findings
      return element.result.findings.map((f) => new FindingItem(f));
    }

    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

class PlaceholderItem extends vscode.TreeItem {
  constructor() {
    super('No results yet — run a scan.', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

class ToolGroupItem extends vscode.TreeItem {
  constructor(
    public readonly toolId: ToolId,
    public readonly result: ScanResult,
  ) {
    const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
    const label = entry?.name ?? toolId;
    const count = result.findings.length;

    super(
      `${label} (${String(count)})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );

    this.iconPath = new vscode.ThemeIcon(TOOL_ICONS[toolId] ?? 'beaker');
    this.description = result.status;

    if (result.status === 'failed') {
      this.tooltip = result.error ?? 'Failed';
    }
  }
}

class FindingItem extends vscode.TreeItem {
  constructor(finding: Finding) {
    super(finding.title, vscode.TreeItemCollapsibleState.None);

    this.description = `${finding.location.filePath}:${String(finding.location.startLine)}`;
    this.tooltip = finding.description;
    this.iconPath = new vscode.ThemeIcon(SEVERITY_ICONS[finding.severity] ?? 'info');

    // Jump-to-source on click
    if (finding.location.filePath && finding.location.startLine > 0) {
      // Resolve file path: if relative, resolve against workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let fileUri: vscode.Uri;
      
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        // Check if path is already absolute
        const isAbsolute = finding.location.filePath.startsWith('/') || 
          (process.platform === 'win32' && /^[A-Za-z]:/.test(finding.location.filePath));
        
        if (isAbsolute) {
          fileUri = vscode.Uri.file(finding.location.filePath);
        } else {
          // Resolve relative path against workspace root
          const absolutePath = join(workspaceRoot, finding.location.filePath);
          fileUri = vscode.Uri.file(absolutePath);
        }
      } else {
        // Fallback: assume absolute path
        fileUri = vscode.Uri.file(finding.location.filePath);
      }

      this.command = {
        command: 'vscode.open',
        title: 'Jump to source',
        arguments: [
          fileUri,
          {
            selection: new vscode.Range(
              finding.location.startLine - 1,
              finding.location.startColumn ?? 0,
              finding.location.endLine - 1,
              finding.location.endColumn ?? 0,
            ),
          } as vscode.TextDocumentShowOptions,
        ],
      };
    }
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Register sidebar views and wire up result updates.
 */
export function registerSidebar(
  _context: vscode.ExtensionContext,
  toolRunner?: ToolRunner,
): vscode.Disposable[] {
  const toolsProvider = new ToolsTreeProvider();
  const resultsProvider = new ResultsTreeProvider();

  const disposables: vscode.Disposable[] = [
    vscode.window.registerTreeDataProvider('aidev.toolsView', toolsProvider),
    vscode.window.registerTreeDataProvider('aidev.resultsView', resultsProvider),
  ];

  // Wire up tool runner results to the sidebar
  if (toolRunner) {
    disposables.push(
      toolRunner.onDidCompleteRun((result) => {
        resultsProvider.setResult(result);
      }),
    );
  }

  return disposables;
}
