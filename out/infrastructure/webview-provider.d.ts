/**
 * Analytics Webview Provider — opens a full-width editor panel (Welcome Screen style)
 * displaying git analytics with Chart.js visualizations.
 */
import * as vscode from "vscode";
import { GitAnalyticsReport, AnalyticsOptions } from "../domains/git/analytics-types";
import { HygieneAnalyticsReport } from "../domains/hygiene/analytics-types";
export declare class AnalyticsWebviewProvider {
    private readonly extensionUri;
    private readonly workspaceRoot;
    private readonly onFilter;
    private panel;
    constructor(extensionUri: vscode.Uri, workspaceRoot: string, onFilter: (opts: AnalyticsOptions) => Promise<GitAnalyticsReport>);
    openPanel(report: GitAnalyticsReport): Promise<void>;
    private buildHtml;
    private handleMessage;
}
export declare class HygieneAnalyticsWebviewProvider {
    private readonly extensionUri;
    private readonly onRefresh;
    private panel;
    private workspaceRoot;
    constructor(extensionUri: vscode.Uri, onRefresh: () => Promise<HygieneAnalyticsReport>);
    openPanel(report: HygieneAnalyticsReport): Promise<void>;
    private buildHtml;
    private handleMessage;
}
//# sourceMappingURL=webview-provider.d.ts.map