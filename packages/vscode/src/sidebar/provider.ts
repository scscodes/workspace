import * as vscode from 'vscode';
import { join } from 'node:path';
import { TOOL_REGISTRY } from '@aidev/core';
import type { ToolRegistryEntry, ScanResult, Finding, Severity, ToolId } from '@aidev/core';
import type { ToolRunner } from '../tools/runner.js';

// ─── Category → tools ──────────────────────────────────────────────────────

const CATEGORY_IDS = ['general', 'hygiene', 'scm', 'review'] as const;
type CategoryId = (typeof CATEGORY_IDS)[number];

const TOOLS_BY_CATEGORY: Record<CategoryId, ToolId[]> = {
  general: ['tldr'],
  hygiene: ['dead-code', 'lint', 'comments'],
  scm: ['branch-diff', 'diff-resolve', 'commit'],
  review: ['pr-review'],
};

/** Section headers in uppercase with inline badge (like Extensions INSTALLED/RECOMMENDED). */
const CATEGORY_LABELS: Record<CategoryId, string> = {
  general: 'GENERAL',
  hygiene: 'HYGIENE',
  scm: 'SCM',
  review: 'REVIEW',
};

// ─── Severity & tool icons ───────────────────────────────────────────────────

const SEVERITY_ICONS: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'lightbulb',
};

const TOOL_ICONS: Record<string, string> = {
  'dead-code': 'search',
  'lint': 'checklist',
  'comments': 'comment',
  'commit': 'git-commit',
  'tldr': 'book',
  'branch-diff': 'git-branch',
  'diff-resolve': 'git-merge',
  'pr-review': 'git-pull-request',
};

// ─── Tree node types ─────────────────────────────────────────────────────────

type AidevTreeNode = CategoryNode | ToolNode | FindingNode | ResultSummaryNode;

class CategoryNode {
  constructor(public readonly id: CategoryId) {}
}

class ToolNode {
  constructor(
    public readonly entry: ToolRegistryEntry,
    public readonly result: ScanResult | undefined,
  ) {}
}

class FindingNode {
  constructor(public readonly finding: Finding) {}
}

/** Single line for tools that don't have findings (tldr, branch-diff, commit). */
class ResultSummaryNode {
  constructor(public readonly result: ScanResult) {}
}

// ─── Inline status icons ────────────────────────────────────────────────────

/** Get checkmark icon based on state: spinning (running), check (clean), or count (findings). */
function getStatusIcon(result: ScanResult | undefined, isRunning: boolean): string {
  if (isRunning) return '$(sync~spin)';
  if (!result) return '';
  if (result.status === 'failed') return '$(error)';
  if (result.status === 'completed') {
    const n = result.findings.length;
    return n === 0 ? '$(check)' : `$(warning) ${String(n)}`;
  }
  return '';
}

/** Get status text for description. */
function getStatusText(result: ScanResult | undefined, isRunning: boolean): string {
  if (isRunning) return 'Running...';
  if (!result) return '';
  if (result.status === 'failed') return 'Failed';
  if (result.status === 'completed') {
    const n = result.findings.length;
    return n === 0 ? 'Clean' : `${String(n)} finding${n === 1 ? '' : 's'}`;
  }
  return '';
}

// ─── Tree items (vscode.TreeItem) ────────────────────────────────────────────

/** Section header with inline badge (e.g. GENERAL  0 — like Extensions INSTALLED/RECOMMENDED). */
function treeItemForCategory(id: CategoryId, badge: number): vscode.TreeItem {
  const item = new vscode.TreeItem(
    CATEGORY_LABELS[id],
    vscode.TreeItemCollapsibleState.Collapsed,
  );
  item.description = String(badge);
  item.tooltip = `${CATEGORY_LABELS[id]} — ${String(badge)} item(s)`;
  item.contextValue = 'aidev.category';
  return item;
}

function treeItemForTool(node: ToolNode, isRunning: boolean): vscode.TreeItem {
  const { entry, result } = node;
  const statusIcon = getStatusIcon(result, isRunning);
  const statusText = getStatusText(result, isRunning);
  
  // Create tree item with tool name
  const item = new vscode.TreeItem(
    entry.name,
    result && result.findings.length > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None,
  );
  
  item.iconPath = new vscode.ThemeIcon(TOOL_ICONS[entry.id] ?? 'beaker');
  
  // Show status icon and text in description, ellipsis menu icon at the end
  const descriptionParts: string[] = [];
  if (statusIcon) {
    descriptionParts.push(statusIcon);
  }
  if (statusText && !statusIcon.includes(statusText)) {
    descriptionParts.push(statusText);
  }
  // Add ellipsis icon for menu (right-click to access)
  descriptionParts.push('$(ellipsis)');
  item.description = descriptionParts.join(' ');
  
  // Build tooltip
  let tooltip = entry.description;
  if (isRunning) {
    tooltip = `${entry.description} — Running...`;
  } else if (statusText) {
    tooltip = `${entry.description} — ${statusText}`;
  }
  if (result?.status === 'failed' && result.error) {
    tooltip = `${tooltip}\n\nError: ${result.error}`;
  }
  item.tooltip = tooltip;
  
  // Set context value with tool ID for context menu commands
  item.contextValue = `aidev.tool.${entry.id}`;
  
  // Store tool ID in resourceUri for command arguments (workaround)
  item.resourceUri = vscode.Uri.parse(`aidev:tool/${entry.id}`);
  
  return item;
}


function treeItemForFinding(finding: Finding): vscode.TreeItem {
  const item = new vscode.TreeItem(finding.title, vscode.TreeItemCollapsibleState.None);
  item.description = `${finding.location.filePath}:${String(finding.location.startLine)}`;
  item.tooltip = finding.description;
  item.iconPath = new vscode.ThemeIcon(SEVERITY_ICONS[finding.severity] ?? 'info');

  if (finding.location.filePath && finding.location.startLine > 0) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let fileUri: vscode.Uri;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const isAbsolute =
        finding.location.filePath.startsWith('/') ||
        (process.platform === 'win32' && /^[A-Za-z]:/.test(finding.location.filePath));
      fileUri = isAbsolute
        ? vscode.Uri.file(finding.location.filePath)
        : vscode.Uri.file(join(workspaceRoot, finding.location.filePath));
    } else {
      fileUri = vscode.Uri.file(finding.location.filePath);
    }
    item.command = {
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
  return item;
}

function treeItemForResultSummary(result: ScanResult): vscode.TreeItem {
  const label = result.status === 'failed' ? result.error ?? 'Failed' : result.status;
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon(result.status === 'failed' ? 'error' : 'check');
  return item;
}

// ─── Categorized tree provider ───────────────────────────────────────────────

/**
 * Single AIDev sidebar tree: categories General, Hygiene, SCM;
 * each expands to tools; each tool can expand to findings or a result summary.
 */
export class AidevTreeProvider implements vscode.TreeDataProvider<AidevTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AidevTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly toolRunner: ToolRunner | undefined) {
    if (toolRunner) {
      toolRunner.onDidCompleteRun(() => this._onDidChangeTreeData.fire(undefined));
      toolRunner.onDidChangeRunningState(() => this._onDidChangeTreeData.fire(undefined));
    }
  }

  /** Total findings in this section (notification badge). */
  private getCategoryBadge(categoryId: CategoryId): number {
    const toolIds = TOOLS_BY_CATEGORY[categoryId];
    let total = 0;
    for (const toolId of toolIds) {
      const result = this.toolRunner?.getLastResult(toolId);
      if (result?.findings) total += result.findings.length;
    }
    return total;
  }

  getTreeItem(element: AidevTreeNode): vscode.TreeItem {
    if (element instanceof CategoryNode) {
      return treeItemForCategory(element.id, this.getCategoryBadge(element.id));
    }
    if (element instanceof ToolNode) {
      const isRunning = this.toolRunner?.isRunning(element.entry.id) ?? false;
      return treeItemForTool(element, isRunning);
    }
    if (element instanceof FindingNode) {
      return treeItemForFinding(element.finding);
    }
    if (element instanceof ResultSummaryNode) {
      return treeItemForResultSummary(element.result);
    }
    return new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);
  }

  getChildren(element?: AidevTreeNode): AidevTreeNode[] {
    if (!element) {
      return CATEGORY_IDS.map((id) => new CategoryNode(id));
    }

    if (element instanceof CategoryNode) {
      const toolIds = TOOLS_BY_CATEGORY[element.id];
      return toolIds.map((toolId) => {
        const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
        if (!entry) return null;
        const result = this.toolRunner?.getLastResult(toolId);
        return new ToolNode(entry, result);
      }).filter((n): n is ToolNode => n !== null);
    }

    if (element instanceof ToolNode) {
      // Show results directly under tool (no Run node - that's in the menu)
      if (!element.result) {
        return [];
      }
      const { result } = element;
      const resultNodes: AidevTreeNode[] =
        result.findings.length > 0
          ? result.findings.map((f) => new FindingNode(f))
          : [new ResultSummaryNode(result)];
      return resultNodes;
    }

    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register the single AIDev sidebar view (categorized: General, Hygiene, SCM).
 * Results are inlined under each tool; no separate Results panel.
 */
export function registerSidebar(
  _context: vscode.ExtensionContext,
  toolRunner?: ToolRunner,
): vscode.Disposable[] {
  const provider = new AidevTreeProvider(toolRunner);
  return [vscode.window.registerTreeDataProvider('aidev.toolsView', provider)];
}
