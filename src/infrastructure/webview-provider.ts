/**
 * Analytics Webview Provider — opens a full-width editor panel (Welcome Screen style)
 * displaying git analytics with Chart.js visualizations.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { GitAnalyticsReport, AnalyticsOptions } from "../domains/git/analytics-types";
import { HygieneAnalyticsReport } from "../domains/hygiene/analytics-types";

export class AnalyticsWebviewProvider {
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceRoot: string,
    private readonly onFilter: (opts: AnalyticsOptions) => Promise<GitAnalyticsReport>
  ) {}

  async openPanel(report: GitAnalyticsReport): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        "meridian.analytics",
        "Git Analytics — Meridian",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.extensionUri, "out", "domains", "git", "analytics-ui"),
          ],
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });

      this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
      this.panel.webview.html = this.buildHtml(this.panel.webview);
    }

    this.panel.webview.postMessage({ type: "init", payload: report });
  }

  private buildHtml(webview: vscode.Webview): string {
    const uiDir = vscode.Uri.joinPath(
      this.extensionUri,
      "out",
      "domains",
      "git",
      "analytics-ui"
    );

    const htmlPath = path.join(uiDir.fsPath, "index.html");
    let html = fs.readFileSync(htmlPath, "utf-8");

    const nonce = crypto.randomBytes(16).toString("base64");
    const cspSource = webview.cspSource;

    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "styles.css"));
    const jsUri  = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "script.js"));

    // Inject CSP nonce and source
    html = html.replace(/\{\{NONCE\}\}/g, nonce);
    html = html.replace(/\{\{WEBVIEW_CSP_SOURCE\}\}/g, cspSource);

    // Rewrite local asset references to webview URIs
    html = html.replace(/href="styles\.css"/g, `href="${cssUri}"`);
    html = html.replace(/src="script\.js"/g, `src="${jsUri}"`);

    return html;
  }

  private async handleMessage(msg: { type: string; payload?: unknown }): Promise<void> {
    if (msg.type === "filter") {
      try {
        const report = await this.onFilter(msg.payload as AnalyticsOptions);
        this.panel?.webview.postMessage({ type: "init", payload: report });
      } catch {
        // Filter failure is non-fatal — panel keeps current data
      }
    } else if (msg.type === "openFile") {
      const abs = path.join(this.workspaceRoot, msg.payload as string);
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(abs));
    }
  }
}

// ============================================================================
// Hygiene Analytics Webview Provider
// ============================================================================

export class HygieneAnalyticsWebviewProvider {
  private panel: vscode.WebviewPanel | null = null;
  private workspaceRoot = "";

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onRefresh: () => Promise<HygieneAnalyticsReport>
  ) {}

  async openPanel(report: HygieneAnalyticsReport): Promise<void> {
    this.workspaceRoot = report.workspaceRoot;
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        "meridian.hygiene.analytics",
        "Hygiene Analytics — Meridian",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.extensionUri, "out", "domains", "hygiene", "analytics-ui"),
          ],
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });

      this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
      this.panel.webview.html = this.buildHtml(this.panel.webview);
    }

    this.panel.webview.postMessage({ type: "init", payload: report });
  }

  private buildHtml(webview: vscode.Webview): string {
    const uiDir = vscode.Uri.joinPath(
      this.extensionUri,
      "out",
      "domains",
      "hygiene",
      "analytics-ui"
    );

    const htmlPath = path.join(uiDir.fsPath, "index.html");
    let html = fs.readFileSync(htmlPath, "utf-8");

    const nonce = crypto.randomBytes(16).toString("base64");
    const cspSource = webview.cspSource;

    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "styles.css"));
    const jsUri  = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "script.js"));

    html = html.replace(/\{\{NONCE\}\}/g, nonce);
    html = html.replace(/\{\{WEBVIEW_CSP_SOURCE\}\}/g, cspSource);
    html = html.replace(/href="styles\.css"/g, `href="${cssUri}"`);
    html = html.replace(/src="script\.js"/g, `src="${jsUri}"`);

    return html;
  }

  private async handleMessage(msg: { type: string; path?: string }): Promise<void> {
    if (msg.type === "refresh") {
      try {
        const report = await this.onRefresh();
        this.panel?.webview.postMessage({ type: "init", payload: report });
      } catch {
        // Refresh failure is non-fatal
      }
    } else if (msg.type === "openSettings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "meridian.hygiene");
    } else if (msg.type === "openFile") {
      const abs = path.join(this.workspaceRoot, msg.path as string);
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(abs));
    } else if (msg.type === "revealFile") {
      const abs = path.join(this.workspaceRoot, msg.path as string);
      vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(abs));
    }
  }
}
