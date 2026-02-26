/**
 * Webview Provider — Manages VS Code webview panels for analytics UI
 *
 * This is a mock implementation for the scaffold. In a real extension,
 * this would implement vscode.WebviewViewProvider and vscode.WebviewPanelSerializer.
 */
import { GitAnalyticsReport, AnalyticsWebviewMessage } from "../domains/git/analytics-types";
/**
 * Mock webview panel that simulates VS Code's WebviewPanel
 */
export interface MockWebviewPanel {
    webview: {
        html: string;
        onDidReceiveMessage: (callback: (message: any) => void) => void;
        postMessage: (message: any) => Promise<void>;
    };
    title: string;
    visible: boolean;
    onDidDispose: (callback: () => void) => void;
}
/**
 * Analytics Webview Provider
 * Manages the UI panel and data/message flow
 */
export declare class AnalyticsWebviewProvider {
    private title;
    private htmlContent;
    private panel;
    private analytics;
    constructor(title?: string, htmlContent?: string);
    /**
     * Get or create webview panel
     */
    getPanel(): MockWebviewPanel;
    /**
     * Get current analytics data
     */
    getAnalyticsData(): GitAnalyticsReport | null;
    /**
     * Create a mock webview panel
     */
    private createPanel;
    /**
     * Set analytics data and send to webview
     */
    setAnalyticsData(analytics: GitAnalyticsReport): void;
    /**
     * Handle message from webview
     */
    handleWebviewMessage(message: AnalyticsWebviewMessage): void;
    /**
     * Dispose webview
     */
    dispose(): void;
    /**
     * Get the HTML content for the webview
     */
    static getWebviewHTML(): string;
}
//# sourceMappingURL=webview-provider.d.ts.map