/**
 * Git Analytics Webview Script
 * Handles data visualization and user interactions
 */

// Reference to VS Code API (in real extension)
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let analyticsData = null;
let chartInstances = {};

// Top-5 vivid colors + gray for "Other"
const DONUT_PALETTE = ["#06b6d4", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#6b7280"];

/**
 * Post a refresh request to the extension with the current period selection.
 */
function postRefresh() {
  const period = document.getElementById("period")?.value || "3mo";
  vscode?.postMessage({ type: "refresh", payload: { period } });
}

/**
 * Listen for messages from the extension
 */
if (vscode) {
  window.addEventListener("message", (event) => {
    const msg = event.data;

    if (msg.type === "init") {
      analyticsData = msg.payload;
      renderUI();
    }
  });

  // Initial data arrives via the buffered "init" message posted by openPanel()
}

/**
 * Render entire UI
 */
function renderUI() {
  if (!analyticsData) {
    console.error("No analytics data available");
    return;
  }

  updateSummary();
  renderCharts();
  renderTables();
}

/**
 * Update summary cards with narrative averages
 */
function updateSummary() {
  const s = analyticsData.summary;

  setText("commitFreq",      s.commitFrequency.toFixed(1));
  setText("filesPerCommit",  s.totalCommits > 0
    ? (s.totalFilesModified / s.totalCommits).toFixed(1) : "—");
  setText("avgInsPerCommit", s.totalCommits > 0
    ? Math.round(s.totalLinesAdded   / s.totalCommits) : "—");
  setText("avgDelPerCommit", s.totalCommits > 0
    ? Math.round(s.totalLinesDeleted / s.totalCommits) : "—");
  setText("churnRate",       s.churnRate.toFixed(2));
}

/**
 * Render all charts
 */
function renderCharts() {
  renderChurnByFileTypeChart();
  renderChurnByDirectoryChart();
}

/**
 * Render churn grouped by file extension (donut, top 5 + Other)
 */
function renderChurnByFileTypeChart() {
  const ctx = document.getElementById("churnByTypeChart");
  if (!ctx) return;

  if (chartInstances.churnByType) {
    chartInstances.churnByType.destroy();
  }

  const files = analyticsData.files || [];
  const byExt = {};
  for (const f of files) {
    const parts = f.path.split(".");
    const ext = parts.length > 1 ? "." + parts.pop() : "(none)";
    byExt[ext] = (byExt[ext] || 0) + f.volatility;
  }

  const sorted = Object.entries(byExt).sort((a, b) => b[1] - a[1]);
  const top5   = sorted.slice(0, 5);
  const other  = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
  const labels = [...top5.map(([k]) => k), ...(other > 0 ? ["Other"] : [])];
  const data   = [...top5.map(([, v]) => v), ...(other > 0 ? [other] : [])];

  chartInstances.churnByType = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: DONUT_PALETTE.slice(0, data.length),
        borderColor: "#1e1e1e",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#d4d4d4", padding: 12, font: { size: 11 } },
        },
      },
    },
  });
}

/**
 * Render churn grouped by immediate parent directory (donut, top 5 + Other)
 *
 * Uses the direct parent folder of each file rather than the top-level
 * directory, so deeply-nested files (e.g. src/domains/git/service.ts)
 * are attributed to "git", not "src".
 */
function renderChurnByDirectoryChart() {
  const ctx = document.getElementById("churnByDirChart");
  if (!ctx) return;

  if (chartInstances.churnByDir) {
    chartInstances.churnByDir.destroy();
  }

  const files = analyticsData.files || [];
  const byDir = {};
  for (const f of files) {
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts[parts.length - 2] : "(root)";
    byDir[dir] = (byDir[dir] || 0) + f.volatility;
  }

  const sorted = Object.entries(byDir).sort((a, b) => b[1] - a[1]);
  const top5   = sorted.slice(0, 5);
  const other  = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
  const labels = [...top5.map(([k]) => k), ...(other > 0 ? ["Other"] : [])];
  const data   = [...top5.map(([, v]) => v), ...(other > 0 ? [other] : [])];

  chartInstances.churnByDir = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: DONUT_PALETTE.slice(0, data.length),
        borderColor: "#1e1e1e",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#d4d4d4", padding: 12, font: { size: 11 } },
        },
      },
    },
  });
}

/**
 * Render commits table with proportional churn bars
 */
function renderCommitsTable() {
  const tbody = document.getElementById("commitsTableBody");
  if (!tbody) return;

  const commits = (analyticsData.commits || []).slice(0, 50);
  const maxChurn = Math.max(...commits.map(c => c.insertions + c.deletions), 1);
  const MAX_BAR = 80; // px

  tbody.innerHTML = "";
  for (const c of commits) {
    const insW = Math.round((c.insertions / maxChurn) * MAX_BAR);
    const delW = Math.round((c.deletions  / maxChurn) * MAX_BAR);
    const row = tbody.insertRow();
    row.innerHTML = `
      <td><code class="hash">${escapeHtml(c.hash.slice(0, 7))}</code></td>
      <td>${escapeHtml(c.author)}</td>
      <td class="commit-msg">${escapeHtml(c.message.slice(0, 70))}</td>
      <td class="ins-count">+${c.insertions}</td>
      <td class="del-count">−${c.deletions}</td>
      <td>
        <div class="churn-bar">
          <div class="churn-ins" style="width:${insW}px"></div>
          <div class="churn-del" style="width:${delW}px"></div>
        </div>
      </td>
    `;
  }
}

/**
 * Render files table (top 50 by volatility)
 */
function renderFilesTable() {
  const tbody = document.getElementById("filesTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const files = analyticsData.files || [];
  for (let i = 0; i < Math.min(files.length, 50); i++) {
    const file = files[i];
    const row = tbody.insertRow();
    row.innerHTML = `
      <td><span class="path-link" data-path="${escapeHtml(file.path)}"><code>${escapeHtml(file.path)}</code></span></td>
      <td>${file.commitCount}</td>
      <td>+${file.insertions}</td>
      <td>-${file.deletions}</td>
      <td>${file.volatility.toFixed(1)}</td>
      <td><span class="risk-${file.risk}">${file.risk}</span></td>
    `;
  }
}

/**
 * Render both tables
 */
function renderTables() {
  renderCommitsTable();
  renderFilesTable();
}

/**
 * Event Listeners
 */

// Event delegation for click-to-open paths
document.addEventListener("click", (e) => {
  const link = e.target.closest(".path-link");
  if (link) vscode?.postMessage({ type: "openFile", payload: link.dataset.path });
});

document.getElementById("applyFilters")?.addEventListener("click", () => {
  const period      = document.getElementById("period")?.value || "3mo";
  const author      = document.getElementById("authorFilter")?.value || "";
  const pathPattern = document.getElementById("pathFilter")?.value || "";

  if (vscode) {
    vscode.postMessage({
      type: "filter",
      payload: {
        period,
        author: author || undefined,
        pathPattern: pathPattern || undefined,
      },
    });
  }
});

document.getElementById("refreshBtn")?.addEventListener("click", postRefresh);

document.getElementById("exportJson")?.addEventListener("click", () => {
  if (!analyticsData) return;
  const json = JSON.stringify(analyticsData, null, 2);
  download("git-analytics.json", json, "application/json");
});

document.getElementById("exportCsv")?.addEventListener("click", () => {
  if (!analyticsData) return;
  const csv = generateCSV();
  download("git-analytics.csv", csv, "text/csv");
});

/**
 * Helper: set text content of an element by id
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Helper: Download file
 */
function download(filename, content, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate CSV export
 */
function generateCSV() {
  const lines = [];

  lines.push("Git Analytics Report");
  lines.push(`Period,${analyticsData.period}`);
  lines.push(`Generated,${new Date(analyticsData.generatedAt).toISOString()}`);
  lines.push("");

  lines.push("Summary");
  const sum = analyticsData.summary;
  lines.push(
    "Total Commits,Total Authors,Total Files,Lines Added,Lines Deleted,Commit Frequency,Avg Commit Size,Churn Rate"
  );
  lines.push(
    `${sum.totalCommits},${sum.totalAuthors},${sum.totalFilesModified},${sum.totalLinesAdded},${sum.totalLinesDeleted},${sum.commitFrequency.toFixed(2)},${sum.averageCommitSize.toFixed(2)},${sum.churnRate.toFixed(2)}`
  );
  lines.push("");

  lines.push("Files");
  lines.push("Path,Commits,Insertions,Deletions,Volatility,Risk,Authors,Last Modified");
  for (const file of analyticsData.files.slice(0, 100)) {
    const authors = Array.from(file.authors || []).join(";");
    lines.push(
      `"${file.path}",${file.commitCount},${file.insertions},${file.deletions},${file.volatility.toFixed(2)},${file.risk},"${authors}",${new Date(file.lastModified).toISOString()}`
    );
  }
  lines.push("");

  lines.push("Authors");
  lines.push("Name,Commits,Insertions,Deletions,Files Changed,Last Active");
  for (const author of analyticsData.authors) {
    lines.push(
      `"${author.name}",${author.commits},${author.insertions},${author.deletions},${author.filesChanged},${new Date(author.lastActive).toISOString()}`
    );
  }

  return lines.join("\n");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

// Initialize on document load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (analyticsData) renderUI();
  });
} else {
  if (analyticsData) renderUI();
}
