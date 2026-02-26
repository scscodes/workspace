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
export class AnalyticsWebviewProvider {
  private panel: MockWebviewPanel | null = null;
  private analytics: GitAnalyticsReport | null = null;

  constructor(
    private title: string = "Git Analytics",
    private htmlContent: string = ""
  ) {}

  /**
   * Get or create webview panel
   */
  getPanel(): MockWebviewPanel {
    if (!this.panel) {
      this.panel = this.createPanel();
    }
    return this.panel;
  }

  /**
   * Get current analytics data
   */
  getAnalyticsData(): GitAnalyticsReport | null {
    return this.analytics;
  }

  /**
   * Create a mock webview panel
   */
  private createPanel(): MockWebviewPanel {
    const panel: MockWebviewPanel = {
      title: this.title,
      visible: true,
      webview: {
        html: this.htmlContent,
        onDidReceiveMessage: (callback: (message: any) => void) => {
          // Store the callback for later message routing
          (this.panel as any)._messageCallback = callback;
        },
        postMessage: async (_message: any) => {
          // Simulate async message delivery
          // In a real extension, this would send to the actual webview
          return Promise.resolve();
        },
      },
      onDidDispose: (callback: () => void) => {
        // Store dispose callback
        (this.panel as any)._disposeCallback = callback;
      },
    };

    return panel;
  }

  /**
   * Set analytics data and send to webview
   */
  setAnalyticsData(analytics: GitAnalyticsReport): void {
    this.analytics = analytics;

    if (this.panel) {
      const initMessage: AnalyticsWebviewMessage = {
        type: "init",
        payload: analytics,
      };

      this.panel.webview.postMessage(initMessage);
    }
  }

  /**
   * Handle message from webview
   */
  handleWebviewMessage(message: AnalyticsWebviewMessage): void {
    switch (message.type) {
      case "filter":
        // Trigger re-analysis with filters
        // In real implementation, would dispatch command
        console.log("Filter request:", message.payload);
        break;

      case "export":
        // Handle export request
        // In real implementation, would trigger export handler
        console.log("Export request:", message.payload);
        break;

      case "init":
        // Initialization message from webview
        console.log("Webview initialized");
        break;
    }
  }

  /**
   * Dispose webview
   */
  dispose(): void {
    if (this.panel) {
      const disposeCallback = (this.panel as any)._disposeCallback;
      if (disposeCallback) {
        disposeCallback();
      }
      this.panel = null;
    }
  }

  /**
   * Get the HTML content for the webview
   */
  static getWebviewHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Git Analytics</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="analytics-panel">
    <h1>📊 Git Analytics Report</h1>
    
    <div class="filters">
      <label>Period: <select id="period">
        <option value="3mo">Last 3 Months</option>
        <option value="6mo">Last 6 Months</option>
        <option value="12mo">Last 12 Months</option>
      </select></label>
      
      <label>Author: <input id="authorFilter" placeholder="(all)" /></label>
      
      <label>Path: <input id="pathFilter" placeholder="src/" /></label>
      
      <button id="applyFilters">Apply</button>
      <button id="exportJson">Export JSON</button>
      <button id="exportCsv">Export CSV</button>
    </div>
    
    <div class="summary-cards">
      <div class="card">
        <h3>Commits</h3>
        <p class="value" id="totalCommits">—</p>
      </div>
      <div class="card">
        <h3>Authors</h3>
        <p class="value" id="totalAuthors">—</p>
      </div>
      <div class="card">
        <h3>Files Modified</h3>
        <p class="value" id="totalFiles">—</p>
      </div>
      <div class="card">
        <h3>Churn Rate</h3>
        <p class="value" id="churnRate">—</p>
      </div>
    </div>
    
    <div class="charts">
      <div class="chart-container">
        <h3>📈 Commit Frequency Over Time</h3>
        <canvas id="commitFrequencyChart"></canvas>
      </div>
      
      <div class="chart-container">
        <h3>🔥 Top 10 Churn Files</h3>
        <canvas id="churnFilesChart"></canvas>
      </div>
      
      <div class="chart-container">
        <h3>👥 Author Contributions</h3>
        <canvas id="authorChart"></canvas>
      </div>
      
      <div class="chart-container">
        <h3>📊 Problem Files (High Volatility)</h3>
        <canvas id="volatilityChart"></canvas>
      </div>
    </div>
    
    <div class="table-container">
      <h3>All Files</h3>
      <table id="filesTable">
        <thead>
          <tr>
            <th>Path</th>
            <th>Commits</th>
            <th>+Lines</th>
            <th>-Lines</th>
            <th>Volatility</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody id="filesTableBody"></tbody>
      </table>
    </div>
  </div>
  
  <script src="script.js"></script>
</body>
</html>`;
  }
}
