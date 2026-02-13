import * as vscode from 'vscode';
import { TOOL_REGISTRY } from '@aidev/core';
import type { ScanResult } from '@aidev/core';
import type { ToolRunner } from '../tools/runner.js';
import type { SettingsManager } from '../settings/index.js';

/* ═══════════════════════════════════════════════════════════════════════════
 * AIDev Command Center v3 — "Godlike Sidepanel"
 *
 * Architecture:
 *   Extension (TypeScript)  ←→  Webview (HTML/JS)
 *   - Extension owns all VS Code API access
 *   - Webview owns all rendering
 *   - Communication via postMessage protocol
 *
 * What changed from v2:
 *   1. Inline diff preview with one-click apply for suggested fixes
 *   2. File-scoped filtering — findings follow your active editor
 *   3. Live scan progress — streaming indicator per tool
 *   4. Symbol breadcrumb — shows what function/class cursor is in
 *   5. Scan delta — "2 new, 1 fixed since last scan"
 *   6. Issue minimap — visual gutter showing where problems cluster
 *   7. Keyboard shortcut hints on action buttons
 *   8. Persisted webview state across tab switches
 *   9. Codicon integration for native VS Code icons
 *  10. Activity feed — compact timeline of recent actions
 * ═══════════════════════════════════════════════════════════════════════════ */

interface ActivityEntry {
  time: number;
  icon: string;
  text: string;
}

export class AidevSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aidev.sidebarView';
  private _view?: vscode.WebviewView;
  private _results = new Map<string, ScanResult>();
  private _previousCounts = new Map<string, number>();
  private _runningTools = new Set<string>();
  private _activity: ActivityEntry[] = [];
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _settings: SettingsManager,
    private readonly _toolRunner: ToolRunner,
  ) {
    this._toolRunner.onDidCompleteRun((result) => {
      const prevCount = this._previousCounts.get(result.toolId) ?? 0;
      this._previousCounts.set(result.toolId, this._results.get(result.toolId)?.findings.length ?? 0);
      this._results.set(result.toolId, result);
      this._runningTools.delete(result.toolId);

      const delta = result.findings.length - prevCount;
      const deltaText = prevCount === 0
        ? `${result.findings.length} findings`
        : delta > 0
          ? `${delta} new, ${result.findings.length} total`
          : delta < 0
            ? `${Math.abs(delta)} fixed, ${result.findings.length} remaining`
            : `${result.findings.length} (unchanged)`;

      this._pushActivity(
        result.status === 'completed' ? 'pass' : 'error',
        `${TOOL_REGISTRY.find(t => t.id === result.toolId)?.name ?? result.toolId}: ${deltaText}`,
      );

      this._postMessage({ type: 'scanComplete', toolId: result.toolId });
      this._postMessage({ type: 'result', data: this._serializeResults() });
      this._postMessage({ type: 'activity', data: this._activity.slice(-20) });
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    const codiconsUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'),
    );

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };
    webviewView.webview.html = this._getHtml(codiconsUri.toString());

    // ── Live tracking ──
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this._pushContext();
        this._pushDiagnostics();
        this._pushSymbol();
      }),
      vscode.window.onDidChangeTextEditorSelection(() => this._pushSymbol()),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this._pushContext();
        this._pushDiagnostics();
        this._pushActivity('save', `Saved ${vscode.workspace.asRelativePath(doc.uri)}`);
      }),
      vscode.workspace.onDidChangeTextDocument(() => this._pushDiagnostics()),
      vscode.languages.onDidChangeDiagnostics(() => this._pushDiagnostics()),
      this._settings.onDidChange(() => this._postMessage({ type: 'settings', data: { mode: this._settings.current.mode } })),
    );

    webviewView.onDidDispose(() => {
      this._disposables.forEach(d => d.dispose());
      this._disposables = [];
    });

    webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));
  }

  // ── Message handling ────────────────────────────────────────────────────

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'runTool': {
        const entry = TOOL_REGISTRY.find(t => t.id === msg.toolId);
        if (!entry) break;
        this._runningTools.add(msg.toolId);
        this._postMessage({ type: 'scanStart', toolId: msg.toolId });
        vscode.commands.executeCommand(entry.commandId);
        break;
      }
      case 'openFile': {
        if (!msg.filePath) break;
        const uri = vscode.Uri.file(msg.filePath);
        const opts: vscode.TextDocumentShowOptions = msg.line
          ? { selection: new vscode.Range(msg.line - 1, 0, msg.line - 1, 0) }
          : {};
        vscode.window.showTextDocument(uri, opts);
        break;
      }
      case 'applyFix': {
        await this._applyFix(msg.finding);
        break;
      }
      case 'exportResults': {
        vscode.commands.executeCommand('aidev.exportResults');
        break;
      }
      case 'executeCommand': {
        vscode.commands.executeCommand(msg.command, ...(msg.args ?? []));
        break;
      }
      case 'ready': {
        this._pushInit();
        this._pushContext();
        this._pushDiagnostics();
        this._pushSymbol();
        break;
      }
    }
  }

  // ── Fix application ─────────────────────────────────────────────────────

  private async _applyFix(finding: { filePath: string; fix: { replacement: string; location: { filePath: string; startLine: number; startColumn: number; endLine: number; endColumn: number } } }): Promise<void> {
    const fix = finding.fix;
    if (!fix?.location) return;

    const uri = vscode.Uri.file(fix.location.filePath);
    await vscode.workspace.openTextDocument(uri); // ensure loaded
    const edit = new vscode.WorkspaceEdit();
    const range = new vscode.Range(
      fix.location.startLine - 1,
      fix.location.startColumn ?? 0,
      fix.location.endLine - 1,
      fix.location.endColumn ?? 0,
    );
    edit.replace(uri, range, fix.replacement);
    const applied = await vscode.workspace.applyEdit(edit);

    if (applied) {
      this._pushActivity('check', `Applied fix in ${vscode.workspace.asRelativePath(uri)}`);
      this._postMessage({ type: 'fixApplied', findingId: finding.fix.location.filePath + ':' + fix.location.startLine });
    } else {
      vscode.window.showErrorMessage('AIDev: Failed to apply fix.');
    }
  }

  // ── Data pushers ────────────────────────────────────────────────────────

  private _postMessage(msg: unknown): void {
    this._view?.webview.postMessage(msg);
  }

  private _pushInit(): void {
    this._postMessage({
      type: 'init',
      data: {
        tools: TOOL_REGISTRY.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          commandId: t.commandId,
        })),
        results: this._serializeResults(),
        mode: this._settings.current.mode,
        activity: this._activity.slice(-20),
        running: Array.from(this._runningTools),
      },
    });
  }

  private async _pushContext(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const wsFolders = vscode.workspace.workspaceFolders;

    const ctx: Record<string, unknown> = {
      hasWorkspace: !!wsFolders?.length,
      workspaceName: wsFolders?.[0]?.name ?? null,
    };

    if (editor) {
      const doc = editor.document;
      const relPath = vscode.workspace.asRelativePath(doc.uri);
      ctx.file = {
        name: relPath.split('/').pop(),
        path: relPath,
        fullPath: doc.uri.fsPath,
        language: doc.languageId,
        lineCount: doc.lineCount,
        isDirty: doc.isDirty,
        isUntitled: doc.isUntitled,
      };
      ctx.cursor = {
        line: editor.selection.active.line + 1,
        col: editor.selection.active.character + 1,
      };
    }

    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (gitExt?.isActive) {
        const git = gitExt.exports.getAPI(1);
        const repo = git.repositories[0];
        if (repo) {
          ctx.git = {
            branch: repo.state.HEAD?.name ?? 'detached',
            ahead: repo.state.HEAD?.ahead ?? 0,
            behind: repo.state.HEAD?.behind ?? 0,
            changes: repo.state.workingTreeChanges?.length ?? 0,
            staged: repo.state.indexChanges?.length ?? 0,
          };
        }
      }
    } catch { /* git not available */ }

    this._postMessage({ type: 'context', data: ctx });
  }

  private _pushDiagnostics(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._postMessage({ type: 'diagnostics', data: { counts: {}, items: [], total: 0 } });
      return;
    }

    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    const counts: Record<string, number> = { error: 0, warning: 0, info: 0, hint: 0 };
    const sevMap: Record<number, string> = {
      [vscode.DiagnosticSeverity.Error]: 'error',
      [vscode.DiagnosticSeverity.Warning]: 'warning',
      [vscode.DiagnosticSeverity.Information]: 'info',
      [vscode.DiagnosticSeverity.Hint]: 'hint',
    };

    const items = diags.slice(0, 30).map(d => {
      const sev = sevMap[d.severity] ?? 'info';
      counts[sev] = (counts[sev] ?? 0) + 1;
      return {
        severity: sev,
        message: d.message.slice(0, 150),
        line: d.range.start.line + 1,
        source: d.source ?? '',
      };
    });

    // Count remaining
    for (const d of diags.slice(30)) {
      const sev = sevMap[d.severity] ?? 'info';
      counts[sev] = (counts[sev] ?? 0) + 1;
    }

    this._postMessage({ type: 'diagnostics', data: { counts, items, total: diags.length } });
  }

  private async _pushSymbol(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._postMessage({ type: 'symbol', data: null });
      return;
    }

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri,
      );
      if (!symbols?.length) {
        this._postMessage({ type: 'symbol', data: null });
        return;
      }

      const pos = editor.selection.active;
      const chain = this._findSymbolChain(symbols, pos);
      this._postMessage({
        type: 'symbol',
        data: chain.length
          ? chain.map(s => ({ name: s.name, kind: vscode.SymbolKind[s.kind], detail: s.detail }))
          : null,
      });
    } catch {
      this._postMessage({ type: 'symbol', data: null });
    }
  }

  private _findSymbolChain(symbols: vscode.DocumentSymbol[], pos: vscode.Position): vscode.DocumentSymbol[] {
    for (const sym of symbols) {
      if (sym.range.contains(pos)) {
        const deeper = this._findSymbolChain(sym.children, pos);
        return [sym, ...deeper];
      }
    }
    return [];
  }

  private _pushActivity(icon: string, text: string): void {
    this._activity.push({ time: Date.now(), icon, text });
    if (this._activity.length > 50) this._activity = this._activity.slice(-30);
    this._postMessage({ type: 'activity', data: this._activity.slice(-20) });
  }

  private _serializeResults(): Record<string, {
    status: string;
    count: number;
    findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: string;
      filePath: string;
      startLine: number;
      endLine: number;
      fix: { description: string; replacement: string; location: any } | null;
      meta: Record<string, unknown> | undefined;
    }>;
  }> {
    const out: Record<string, any> = {};
    for (const [id, result] of this._results) {
      out[id] = {
        status: result.status,
        count: result.findings.length,
        findings: result.findings.map(f => ({
          id: f.id,
          title: f.title,
          description: f.description,
          severity: f.severity,
          filePath: f.location.filePath,
          startLine: f.location.startLine,
          endLine: f.location.endLine,
          fix: f.suggestedFix ? {
            description: f.suggestedFix.description,
            replacement: f.suggestedFix.replacement,
            location: f.suggestedFix.location,
          } : null,
          meta: f.metadata,
        })),
      };
    }
    return out;
  }

  // ── HTML ────────────────────────────────────────────────────────────────

  private _getHtml(codiconsUri: string): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="${codiconsUri}" rel="stylesheet" />
<style>
:root {
  --bg: var(--vscode-sideBar-background);
  --fg: var(--vscode-sideBar-foreground);
  --border: var(--vscode-panel-border, rgba(128,128,128,0.15));
  --badge-bg: var(--vscode-badge-background);
  --badge-fg: var(--vscode-badge-foreground);
  --btn-bg: var(--vscode-button-background);
  --btn-fg: var(--vscode-button-foreground);
  --btn-hover: var(--vscode-button-hoverBackground);
  --error: var(--vscode-errorForeground, #f44);
  --warn: var(--vscode-editorWarning-foreground, #fa0);
  --info: var(--vscode-editorInfo-foreground, #4af);
  --hint: var(--vscode-focusBorder, #888);
  --hover: var(--vscode-list-hoverBackground);
  --editor-bg: var(--vscode-editor-background);
  --editor-font: var(--vscode-editor-font-family, monospace);
  --success: var(--vscode-terminal-ansiGreen, #4a4);
  --muted: var(--vscode-descriptionForeground, rgba(128,128,128,0.7));
  --link: var(--vscode-textLink-foreground, #4fc1ff);
  --deletion-bg: var(--vscode-diffEditor-removedTextBackground, rgba(255,0,0,0.15));
  --insertion-bg: var(--vscode-diffEditor-insertedTextBackground, rgba(0,255,0,0.15));
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: 12px;
  color: var(--fg);
  background: var(--bg);
  overflow-y: auto;
  line-height: 1.45;
}

/* ── Zones ── */
.zone { border-bottom: 1px solid var(--border); }
.zone-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px 4px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px;
  color: var(--muted); cursor: pointer; user-select: none;
}
.zone-header:hover { color: var(--fg); }
.zone-header .codicon { font-size: 10px; transition: transform 0.15s; }
.zone-header.collapsed .codicon { transform: rotate(-90deg); }
.zone-body { padding: 0 10px 8px; }
.zone-body.collapsed { display: none; }

/* ── Context Zone ── */
.ctx-file { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
.ctx-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctx-lang {
  font-size: 9px; padding: 1px 5px; border-radius: 3px;
  background: var(--badge-bg); color: var(--badge-fg);
  text-transform: uppercase; flex-shrink: 0;
}
.ctx-dirty { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); flex-shrink: 0; }
.ctx-path { font-size: 10px; color: var(--muted); font-family: var(--editor-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctx-meta { display: flex; gap: 10px; margin-top: 4px; font-size: 10px; color: var(--muted); flex-wrap: wrap; }
.ctx-meta span { display: flex; align-items: center; gap: 2px; }

/* Symbol breadcrumb */
.ctx-symbol {
  margin-top: 4px; padding: 3px 6px;
  background: var(--editor-bg); border-radius: 3px;
  font-size: 10px; font-family: var(--editor-font); color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ctx-symbol .kind { opacity: 0.5; font-size: 9px; }

/* Git bar */
.git-bar {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  padding: 4px 6px; background: var(--editor-bg); border-radius: 3px; font-size: 11px;
}
.git-branch { font-weight: 600; font-family: var(--editor-font); }
.git-stat { font-size: 10px; color: var(--muted); }
.git-stat.up { color: var(--success); }
.git-stat.down { color: var(--warn); }
.git-stat.mod { color: var(--info); }

.no-file { padding: 10px; color: var(--muted); font-style: italic; }

/* ── Diagnostics ── */
.diag-counts { display: flex; gap: 6px; font-size: 11px; font-weight: 600; }
.diag-counts .e { color: var(--error); }
.diag-counts .w { color: var(--warn); }
.diag-counts .i { color: var(--info); }
.diag-item {
  display: flex; align-items: flex-start; gap: 5px;
  padding: 2px 0; cursor: pointer; font-size: 11px;
}
.diag-item:hover { color: var(--fg); }
.diag-sev { width: 3px; min-height: 14px; border-radius: 1px; flex-shrink: 0; margin-top: 1px; }
.diag-sev.error { background: var(--error); }
.diag-sev.warning { background: var(--warn); }
.diag-sev.info { background: var(--info); }
.diag-sev.hint { background: var(--hint); }
.diag-msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
.diag-ln { font-family: var(--editor-font); font-size: 10px; color: var(--muted); flex-shrink: 0; }
.diag-clean { padding: 4px 0; font-size: 11px; color: var(--success); }

/* Issue minimap */
.minimap {
  height: 4px; margin-top: 4px; border-radius: 2px;
  background: var(--editor-bg); position: relative; overflow: hidden;
}
.minimap-mark {
  position: absolute; top: 0; width: 2px; height: 100%; border-radius: 1px;
}
.minimap-mark.error { background: var(--error); }
.minimap-mark.warning { background: var(--warn); }
.minimap-mark.info { background: var(--info); }

/* ── Actions ── */
.action-row { display: flex; flex-wrap: wrap; gap: 4px; }
.action-btn {
  font-size: 11px; padding: 3px 8px; border-radius: 3px;
  border: 1px solid var(--border); background: transparent;
  color: var(--fg); cursor: pointer; font-family: inherit;
  white-space: nowrap; transition: background 0.1s;
  display: flex; align-items: center; gap: 4px;
}
.action-btn:hover { background: var(--hover); }
.action-btn.primary { background: var(--btn-bg); color: var(--btn-fg); border-color: var(--btn-bg); }
.action-btn.primary:hover { background: var(--btn-hover); }
.action-btn .shortcut {
  font-size: 9px; opacity: 0.4; font-family: var(--editor-font);
}

/* ── Intel (scan results) ── */
.filter-row {
  display: flex; gap: 3px; margin-bottom: 6px; flex-wrap: wrap;
}
.filter-chip {
  font-size: 10px; padding: 2px 6px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent;
  color: var(--muted); cursor: pointer; font-family: inherit;
  transition: all 0.1s;
}
.filter-chip:hover { border-color: var(--fg); color: var(--fg); }
.filter-chip.active { background: var(--badge-bg); color: var(--badge-fg); border-color: transparent; }
.filter-chip.file-scope { background: var(--btn-bg); color: var(--btn-fg); border-color: transparent; }

.result-group { margin-bottom: 6px; }
.result-group-hdr {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; font-size: 11px; margin-bottom: 2px; cursor: pointer;
}
.result-group-hdr:hover { color: var(--link); }
.result-count {
  font-size: 9px; padding: 1px 5px; border-radius: 8px;
  background: var(--badge-bg); color: var(--badge-fg); font-weight: 600;
}
.result-count.has-errors { background: var(--error); color: #fff; }

/* Scan progress */
.scan-progress {
  height: 2px; background: var(--editor-bg); border-radius: 1px;
  margin-bottom: 4px; overflow: hidden;
}
.scan-progress-bar {
  height: 100%; width: 30%; border-radius: 1px;
  background: var(--btn-bg);
  animation: progress-slide 1.2s ease-in-out infinite;
}
@keyframes progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(433%); }
}

/* Findings */
.finding {
  padding: 4px 6px; margin-bottom: 2px;
  border-left: 2px solid transparent; border-radius: 0 3px 3px 0;
  cursor: pointer; font-size: 11px; transition: background 0.1s;
}
.finding:hover { background: var(--hover); }
.finding.error { border-color: var(--error); }
.finding.warning { border-color: var(--warn); }
.finding.info { border-color: var(--info); }
.finding.hint { border-color: var(--hint); }
.finding-top { display: flex; align-items: center; justify-content: space-between; }
.finding-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.finding-loc { opacity: 0.4; font-size: 10px; font-family: var(--editor-font); flex-shrink: 0; margin-left: 6px; }
.finding-desc { font-size: 10px; color: var(--muted); margin-top: 1px; display: none; }
.finding.expanded .finding-desc { display: block; }

/* Inline diff */
.finding-diff {
  margin-top: 4px; border-radius: 3px; overflow: hidden;
  font-family: var(--editor-font); font-size: 11px; line-height: 1.5;
  display: none;
}
.finding.expanded .finding-diff { display: block; }
.diff-line { padding: 0 6px; white-space: pre; overflow-x: auto; }
.diff-del { background: var(--deletion-bg); }
.diff-add { background: var(--insertion-bg); }
.diff-actions {
  display: flex; gap: 4px; padding: 4px 6px;
  background: var(--editor-bg); border-top: 1px solid var(--border);
}
.diff-btn {
  font-size: 10px; padding: 2px 8px; border-radius: 3px;
  border: none; cursor: pointer; font-family: inherit;
}
.diff-btn.apply { background: var(--success); color: #fff; }
.diff-btn.apply:hover { filter: brightness(1.1); }
.diff-btn.dismiss { background: transparent; color: var(--muted); border: 1px solid var(--border); }

/* ── Activity Feed ── */
.activity-item {
  font-size: 10px; color: var(--muted); padding: 1px 0;
  display: flex; align-items: center; gap: 4px;
}
.activity-time { font-family: var(--editor-font); opacity: 0.5; flex-shrink: 0; }

.empty-msg { color: var(--muted); font-style: italic; font-size: 11px; padding: 2px 0; }
</style>
</head>
<body>

<!-- Zone 1: Context -->
<div class="zone" id="z-context">
  <div class="zone-header" onclick="toggle('context')">
    <span><i class="codicon codicon-file"></i> Context</span>
    <i class="codicon codicon-chevron-down"></i>
  </div>
  <div class="zone-body" id="zb-context">
    <div class="no-file" id="ctx-content">No file open</div>
  </div>
</div>

<!-- Zone 2: Diagnostics -->
<div class="zone" id="z-diag">
  <div class="zone-header" onclick="toggle('diag')">
    <span><i class="codicon codicon-warning"></i> Problems</span>
    <span class="diag-counts" id="diag-counts"></span>
  </div>
  <div class="zone-body" id="zb-diag">
    <div id="diag-list"><span class="diag-clean"><i class="codicon codicon-pass"></i> Clean</span></div>
    <div class="minimap" id="minimap"></div>
  </div>
</div>

<!-- Zone 3: Actions -->
<div class="zone" id="z-actions">
  <div class="zone-header" onclick="toggle('actions')">
    <span><i class="codicon codicon-play"></i> Actions</span>
    <i class="codicon codicon-chevron-down"></i>
  </div>
  <div class="zone-body" id="zb-actions">
    <div class="action-row" id="actions"></div>
  </div>
</div>

<!-- Zone 4: Intel -->
<div class="zone" id="z-intel">
  <div class="zone-header" onclick="toggle('intel')">
    <span><i class="codicon codicon-lightbulb"></i> Intel <span id="intel-total" style="opacity:0.5"></span></span>
    <i class="codicon codicon-chevron-down"></i>
  </div>
  <div class="zone-body" id="zb-intel">
    <div class="filter-row" id="filters"></div>
    <div id="intel-body"><span class="empty-msg">Run a scan to see findings.</span></div>
  </div>
</div>

<!-- Zone 5: Activity -->
<div class="zone" id="z-activity">
  <div class="zone-header collapsed" onclick="toggle('activity')">
    <span><i class="codicon codicon-pulse"></i> Activity</span>
    <i class="codicon codicon-chevron-down"></i>
  </div>
  <div class="zone-body collapsed" id="zb-activity">
    <div id="activity-list"><span class="empty-msg">No activity yet.</span></div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
function post(msg) { vscode.postMessage(msg); }

let S = {
  tools: [], results: {}, ctx: {}, mode: '',
  running: new Set(),
  filters: { severity: null, fileScope: false },
  expanded: new Set(),
  collapsed: new Set(),
};

function esc(s) { return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }

// ── Zone toggle ──
function toggle(zone) {
  const hdr = document.querySelector('#z-' + zone + ' .zone-header');
  const body = document.getElementById('zb-' + zone);
  hdr.classList.toggle('collapsed');
  body.classList.toggle('collapsed');
}

// ── Context ──
function renderContext(ctx) {
  S.ctx = ctx;
  const el = document.getElementById('ctx-content');
  if (!ctx.file) { el.className = 'no-file'; el.innerHTML = 'No file open'; renderActions(); return; }

  el.className = '';
  const f = ctx.file;
  let h = '<div class="ctx-file">' +
    '<span class="ctx-name">' + esc(f.name) + '</span>' +
    (f.isDirty ? '<span class="ctx-dirty" title="Unsaved"></span>' : '') +
    '<span class="ctx-lang">' + esc(f.language) + '</span></div>' +
    '<div class="ctx-path">' + esc(f.path) + '</div>' +
    '<div class="ctx-meta"><span>' + f.lineCount + ' lines</span>';
  if (ctx.cursor) h += '<span>Ln ' + ctx.cursor.line + ':' + ctx.cursor.col + '</span>';
  h += '</div>';

  if (ctx.git) {
    const g = ctx.git;
    h += '<div class="git-bar"><span class="git-branch"><i class="codicon codicon-git-branch"></i> ' + esc(g.branch) + '</span>';
    if (g.ahead > 0) h += '<span class="git-stat up">↑' + g.ahead + '</span>';
    if (g.behind > 0) h += '<span class="git-stat down">↓' + g.behind + '</span>';
    if (g.changes > 0) h += '<span class="git-stat mod">' + g.changes + 'M</span>';
    if (g.staged > 0) h += '<span class="git-stat">' + g.staged + 'S</span>';
    h += '</div>';
  }

  el.innerHTML = h;
  renderActions();
}

// ── Symbol breadcrumb ──
function renderSymbol(chain) {
  let existing = document.getElementById('ctx-symbol');
  if (!chain || !chain.length) { if (existing) existing.remove(); return; }

  const text = chain.map(s => '<span class="kind">' + s.kind + '</span> ' + esc(s.name)).join(' › ');
  if (existing) { existing.innerHTML = text; }
  else {
    const el = document.createElement('div');
    el.className = 'ctx-symbol'; el.id = 'ctx-symbol'; el.innerHTML = text;
    document.getElementById('ctx-content').appendChild(el);
  }
}

// ── Diagnostics ──
function renderDiagnostics(diag) {
  const counts = diag.counts || {};
  const items = diag.items || [];

  // Counts
  const ce = document.getElementById('diag-counts');
  let cp = [];
  if (counts.error > 0) cp.push('<span class="e">' + counts.error + 'E</span>');
  if (counts.warning > 0) cp.push('<span class="w">' + counts.warning + 'W</span>');
  if (counts.info > 0) cp.push('<span class="i">' + counts.info + 'I</span>');
  ce.innerHTML = cp.join('');

  // List
  const le = document.getElementById('diag-list');
  if (!items.length) { le.innerHTML = '<span class="diag-clean"><i class="codicon codicon-pass"></i> Clean</span>'; }
  else {
    le.innerHTML = items.map(d => {
      const fp = S.ctx.file ? S.ctx.file.fullPath : '';
      return '<div class="diag-item" onclick="post({type:\\'openFile\\',filePath:\\'' +
        fp.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'") +
        '\\',line:' + d.line + '})">' +
        '<div class="diag-sev ' + d.severity + '"></div>' +
        '<span class="diag-msg">' + esc(d.message) + '</span>' +
        '<span class="diag-ln">:' + d.line + '</span></div>';
    }).join('');
  }

  // Minimap
  const mm = document.getElementById('minimap');
  if (!items.length || !S.ctx.file) { mm.innerHTML = ''; return; }
  const lc = S.ctx.file.lineCount || 1;
  mm.innerHTML = items.map(d => {
    const pct = ((d.line / lc) * 100).toFixed(1);
    return '<div class="minimap-mark ' + d.severity + '" style="left:' + pct + '%"></div>';
  }).join('');
}

// ── Actions ──
function renderActions() {
  const el = document.getElementById('actions');
  const btns = [];
  const hasFile = !!S.ctx.file;
  const lang = hasFile ? S.ctx.file.language : '';
  const supported = ['typescript','javascript','python','typescriptreact','javascriptreact'].includes(lang);

  if (hasFile && supported) {
    btns.push(mkBtn('<i class="codicon codicon-search"></i> Dead Code', '', () => post({type:'runTool',toolId:'dead-code'})));
    btns.push(mkBtn('<i class="codicon codicon-checklist"></i> Lint', '', () => post({type:'runTool',toolId:'lint'})));
    btns.push(mkBtn('<i class="codicon codicon-comment"></i> Comments', '', () => post({type:'runTool',toolId:'comments'})));
  }

  if (S.ctx.git) {
    if (S.ctx.git.changes > 0 || S.ctx.git.staged > 0) {
      btns.push(mkBtn('<i class="codicon codicon-git-commit"></i> Commit', 'primary', () => post({type:'runTool',toolId:'commit'})));
    }
    btns.push(mkBtn('<i class="codicon codicon-book"></i> TLDR', '', () => post({type:'runTool',toolId:'tldr'})));
    btns.push(mkBtn('<i class="codicon codicon-git-compare"></i> Diff', '', () => post({type:'runTool',toolId:'branch-diff'})));
  }

  if (Object.keys(S.results).length > 0) {
    btns.push(mkBtn('<i class="codicon codicon-export"></i> Export', '', () => post({type:'exportResults'})));
  }

  el.innerHTML = '';
  btns.forEach(b => el.appendChild(b));
  if (!btns.length) el.innerHTML = '<span class="empty-msg">Open a supported file to see actions.</span>';
}

function mkBtn(label, cls, onclick) {
  const btn = document.createElement('button');
  btn.className = 'action-btn' + (cls ? ' ' + cls : '');
  btn.innerHTML = label;
  btn.onclick = onclick;
  return btn;
}

// ── Filters ──
function renderFilters() {
  const el = document.getElementById('filters');
  const sevs = ['error','warning','info','hint'];
  const colors = { error: 'var(--error)', warning: 'var(--warn)', info: 'var(--info)', hint: 'var(--hint)' };

  let h = '<button class="filter-chip' + (S.filters.fileScope ? ' file-scope' : '') +
    '" onclick="toggleFileScope()"><i class="codicon codicon-file"></i> This file</button>';

  sevs.forEach(s => {
    h += '<button class="filter-chip' + (S.filters.severity === s ? ' active' : '') +
      '" onclick="toggleSeverity(\\'' + s + '\\')" style="' +
      (S.filters.severity === s ? 'border-color:' + colors[s] : '') +
      '">' + s.charAt(0).toUpperCase() + '</button>';
  });

  el.innerHTML = h;
}

function toggleSeverity(s) {
  S.filters.severity = S.filters.severity === s ? null : s;
  renderFilters();
  renderIntel();
}

function toggleFileScope() {
  S.filters.fileScope = !S.filters.fileScope;
  renderFilters();
  renderIntel();
}

// ── Intel ──
function renderIntel() {
  const el = document.getElementById('intel-body');
  const totalEl = document.getElementById('intel-total');
  const entries = Object.entries(S.results);

  if (!entries.length) {
    el.innerHTML = '<span class="empty-msg">Run a scan to see findings.</span>';
    totalEl.textContent = '';
    return;
  }

  const currentFile = S.ctx.file?.fullPath;
  let totalFiltered = 0;
  let html = '';

  for (const [toolId, r] of entries) {
    const tool = S.tools.find(t => t.id === toolId);
    const name = tool ? tool.name : toolId;
    let findings = r.findings || [];

    // Apply filters
    if (S.filters.fileScope && currentFile) {
      findings = findings.filter(f => f.filePath === currentFile);
    }
    if (S.filters.severity) {
      findings = findings.filter(f => f.severity === S.filters.severity);
    }

    if (!findings.length && S.filters.fileScope) continue; // hide empty groups in file scope

    totalFiltered += findings.length;
    const isRunning = S.running.has(toolId);
    const hasErrors = findings.some(f => f.severity === 'error');

    html += '<div class="result-group">';

    // Progress bar if scanning
    if (isRunning) {
      html += '<div class="scan-progress"><div class="scan-progress-bar"></div></div>';
    }

    html += '<div class="result-group-hdr"><span>' + esc(name) + '</span>' +
      '<span class="result-count' + (hasErrors ? ' has-errors' : '') + '">' +
      (isRunning ? '...' : findings.length) + '</span></div>';

    // Findings (max 15)
    const shown = Math.min(findings.length, 15);
    for (let j = 0; j < shown; j++) {
      const f = findings[j];
      const fid = f.id;
      const isExp = S.expanded.has(fid);
      const fileName = (f.filePath || '').split('/').pop() || '';

      html += '<div class="finding ' + f.severity + (isExp ? ' expanded' : '') + '" data-fid="' + fid + '">';
      html += '<div class="finding-top" onclick="toggleFinding(\\'' + fid + '\\')">';
      html += '<span class="finding-title">' + esc(f.title) + '</span>';
      html += '<span class="finding-loc">' + esc(fileName) + ':' + f.startLine + '</span>';
      html += '</div>';
      html += '<div class="finding-desc">' + esc(f.description) + '</div>';

      // Inline diff if fix available
      if (f.fix) {
        html += '<div class="finding-diff">';
        html += '<div class="diff-line diff-del">- ' + esc(f.fix.description) + '</div>';
        html += '<div class="diff-line diff-add">+ ' + esc(f.fix.replacement.split('\\n')[0]) + '</div>';
        html += '<div class="diff-actions">';
        html += '<button class="diff-btn apply" onclick="applyFix(event, \\'' + fid + '\\')"><i class="codicon codicon-check"></i> Apply</button>';
        html += '<button class="diff-btn dismiss" onclick="dismissFix(event, \\'' + fid + '\\')">Dismiss</button>';
        html += '</div></div>';
      }

      html += '</div>';
    }

    if (findings.length > 15) {
      html += '<div style="font-size:10px;color:var(--muted);padding:2px 6px;">+' +
        (findings.length - 15) + ' more</div>';
    }

    html += '</div>';
  }

  el.innerHTML = html || '<span class="empty-msg">No findings match filters.</span>';
  totalEl.textContent = totalFiltered > 0 ? '(' + totalFiltered + ')' : '';
}

function toggleFinding(fid) {
  if (S.expanded.has(fid)) S.expanded.delete(fid);
  else S.expanded.add(fid);

  const el = document.querySelector('[data-fid="' + fid + '"]');
  if (el) el.classList.toggle('expanded');

  // Also jump to the finding's location
  const finding = findFindingById(fid);
  if (finding) post({type:'openFile', filePath: finding.filePath, line: finding.startLine});
}

function findFindingById(fid) {
  for (const r of Object.values(S.results)) {
    const f = (r.findings || []).find(x => x.id === fid);
    if (f) return f;
  }
  return null;
}

function applyFix(e, fid) {
  e.stopPropagation();
  const f = findFindingById(fid);
  if (f?.fix) post({type:'applyFix', finding: {filePath: f.filePath, fix: f.fix}});
}

function dismissFix(e, fid) {
  e.stopPropagation();
  S.expanded.delete(fid);
  const el = document.querySelector('[data-fid="' + fid + '"]');
  if (el) el.classList.remove('expanded');
}

// ── Activity ──
function renderActivity(items) {
  const el = document.getElementById('activity-list');
  if (!items.length) { el.innerHTML = '<span class="empty-msg">No activity yet.</span>'; return; }

  const icons = { pass: 'pass', error: 'error', check: 'check', save: 'save', info: 'info' };
  el.innerHTML = items.slice().reverse().map(a => {
    const t = new Date(a.time);
    const ts = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');
    const ico = icons[a.icon] || 'circle-outline';
    return '<div class="activity-item"><span class="activity-time">' + ts + '</span>' +
      '<i class="codicon codicon-' + ico + '"></i> ' + esc(a.text) + '</div>';
  }).join('');
}

// ── Message handler ──
window.addEventListener('message', e => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      S.tools = m.data.tools;
      S.results = m.data.results;
      S.mode = m.data.mode;
      (m.data.running || []).forEach(id => S.running.add(id));
      renderActions();
      renderFilters();
      renderIntel();
      renderActivity(m.data.activity || []);
      break;
    case 'context':
      renderContext(m.data);
      break;
    case 'symbol':
      renderSymbol(m.data);
      break;
    case 'diagnostics':
      renderDiagnostics(m.data);
      break;
    case 'result':
      S.results = m.data;
      renderIntel();
      renderActions();
      break;
    case 'scanStart':
      S.running.add(m.toolId);
      renderIntel();
      break;
    case 'scanComplete':
      S.running.delete(m.toolId);
      renderIntel();
      break;
    case 'fixApplied':
      // visual feedback — could flash the finding green
      break;
    case 'activity':
      renderActivity(m.data);
      break;
    case 'settings':
      S.mode = m.data.mode;
      break;
  }
});

post({type:'ready'});
</script>
</body>
</html>`;
  }
}
