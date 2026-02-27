"use strict";
/**
 * Analytics Webview Provider — opens a full-width editor panel (Welcome Screen style)
 * displaying git analytics with Chart.js visualizations.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HygieneAnalyticsWebviewProvider = exports.AnalyticsWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
class AnalyticsWebviewProvider {
    constructor(extensionUri, workspaceRoot, onFilter) {
        this.extensionUri = extensionUri;
        this.workspaceRoot = workspaceRoot;
        this.onFilter = onFilter;
        this.panel = null;
    }
    async openPanel(report) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        }
        else {
            this.panel = vscode.window.createWebviewPanel("meridian.analytics", "Git Analytics — Meridian", vscode.ViewColumn.One, {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "out", "domains", "git", "analytics-ui"),
                ],
                retainContextWhenHidden: true,
            });
            this.panel.onDidDispose(() => {
                this.panel = null;
            });
            this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
            this.panel.webview.html = this.buildHtml(this.panel.webview);
        }
        this.panel.webview.postMessage({ type: "init", payload: report });
    }
    buildHtml(webview) {
        const uiDir = vscode.Uri.joinPath(this.extensionUri, "out", "domains", "git", "analytics-ui");
        const htmlPath = path.join(uiDir.fsPath, "index.html");
        let html = fs.readFileSync(htmlPath, "utf-8");
        const nonce = crypto.randomBytes(16).toString("base64");
        const cspSource = webview.cspSource;
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "styles.css"));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "script.js"));
        // Inject CSP nonce and source
        html = html.replace(/\{\{NONCE\}\}/g, nonce);
        html = html.replace(/\{\{WEBVIEW_CSP_SOURCE\}\}/g, cspSource);
        // Rewrite local asset references to webview URIs
        html = html.replace(/href="styles\.css"/g, `href="${cssUri}"`);
        html = html.replace(/src="script\.js"/g, `src="${jsUri}"`);
        return html;
    }
    async handleMessage(msg) {
        if (msg.type === "filter") {
            try {
                const report = await this.onFilter(msg.payload);
                this.panel?.webview.postMessage({ type: "init", payload: report });
            }
            catch {
                // Filter failure is non-fatal — panel keeps current data
            }
        }
        else if (msg.type === "openFile") {
            const abs = path.join(this.workspaceRoot, msg.payload);
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(abs));
        }
    }
}
exports.AnalyticsWebviewProvider = AnalyticsWebviewProvider;
// ============================================================================
// Hygiene Analytics Webview Provider
// ============================================================================
class HygieneAnalyticsWebviewProvider {
    constructor(extensionUri, onRefresh) {
        this.extensionUri = extensionUri;
        this.onRefresh = onRefresh;
        this.panel = null;
        this.workspaceRoot = "";
    }
    async openPanel(report) {
        this.workspaceRoot = report.workspaceRoot;
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        }
        else {
            this.panel = vscode.window.createWebviewPanel("meridian.hygiene.analytics", "Hygiene Analytics — Meridian", vscode.ViewColumn.One, {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "out", "domains", "hygiene", "analytics-ui"),
                ],
                retainContextWhenHidden: true,
            });
            this.panel.onDidDispose(() => {
                this.panel = null;
            });
            this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
            this.panel.webview.html = this.buildHtml(this.panel.webview);
        }
        this.panel.webview.postMessage({ type: "init", payload: report });
    }
    buildHtml(webview) {
        const uiDir = vscode.Uri.joinPath(this.extensionUri, "out", "domains", "hygiene", "analytics-ui");
        const htmlPath = path.join(uiDir.fsPath, "index.html");
        let html = fs.readFileSync(htmlPath, "utf-8");
        const nonce = crypto.randomBytes(16).toString("base64");
        const cspSource = webview.cspSource;
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "styles.css"));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(uiDir, "script.js"));
        html = html.replace(/\{\{NONCE\}\}/g, nonce);
        html = html.replace(/\{\{WEBVIEW_CSP_SOURCE\}\}/g, cspSource);
        html = html.replace(/href="styles\.css"/g, `href="${cssUri}"`);
        html = html.replace(/src="script\.js"/g, `src="${jsUri}"`);
        return html;
    }
    async handleMessage(msg) {
        if (msg.type === "refresh") {
            try {
                const report = await this.onRefresh();
                this.panel?.webview.postMessage({ type: "init", payload: report });
            }
            catch {
                // Refresh failure is non-fatal
            }
        }
        else if (msg.type === "openSettings") {
            vscode.commands.executeCommand("workbench.action.openSettings", "meridian.hygiene");
        }
        else if (msg.type === "openFile") {
            const abs = path.join(this.workspaceRoot, msg.path);
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(abs));
        }
        else if (msg.type === "revealFile") {
            const abs = path.join(this.workspaceRoot, msg.path);
            vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(abs));
        }
    }
}
exports.HygieneAnalyticsWebviewProvider = HygieneAnalyticsWebviewProvider;
//# sourceMappingURL=webview-provider.js.map