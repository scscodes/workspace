/**
 * Git Analytics Webview Script
 * Handles data visualization and user interactions
 */

// Reference to VS Code API (in real extension)
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let analyticsData = null;
let chartInstances = {};

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
 * Update summary cards
 */
function updateSummary() {
  const sum = analyticsData.summary;

  document.getElementById("totalCommits").textContent = sum.totalCommits;
  document.getElementById("totalAuthors").textContent = sum.totalAuthors;
  document.getElementById("totalFiles").textContent = sum.totalFilesModified;
  document.getElementById("churnRate").textContent = sum.churnRate.toFixed(2);
}

/**
 * Render all charts
 */
function renderCharts() {
  renderCommitFrequencyChart();
  renderChurnFilesChart();
  renderAuthorChart();
  renderVolatilityChart();
}

/**
 * Render commit frequency line chart
 */
function renderCommitFrequencyChart() {
  const ctx = document.getElementById("commitFrequencyChart");
  if (!ctx) return;

  // Destroy previous instance
  if (chartInstances.commitFrequency) {
    chartInstances.commitFrequency.destroy();
  }

  const freq = analyticsData.commitFrequency;
  chartInstances.commitFrequency = new Chart(ctx, {
    type: "line",
    data: {
      labels: freq.labels,
      datasets: [
        {
          label: "Commits",
          data: freq.data,
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14, 165, 233, 0.1)",
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: "#0ea5e9",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#d4d4d4",
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#d4d4d4",
          },
        },
        x: {
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#d4d4d4",
          },
        },
      },
    },
  });
}

/**
 * Render churn files horizontal bar chart
 */
function renderChurnFilesChart() {
  const ctx = document.getElementById("churnFilesChart");
  if (!ctx) return;

  if (chartInstances.churnFiles) {
    chartInstances.churnFiles.destroy();
  }

  const churnFiles = analyticsData.churnFiles || [];
  const labels = churnFiles.map((f) => f.path.split("/").pop());
  const data = churnFiles.map((f) => f.volatility);

  chartInstances.churnFiles = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volatility",
          data: data,
          backgroundColor: "#f59e0b",
          borderColor: "#d97706",
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#d4d4d4",
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#d4d4d4",
          },
        },
      },
    },
  });
}

/**
 * Render author contributions pie chart
 */
function renderAuthorChart() {
  const ctx = document.getElementById("authorChart");
  if (!ctx) return;

  if (chartInstances.authors) {
    chartInstances.authors.destroy();
  }

  const authors = analyticsData.topAuthors || [];
  const colors = [
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#6366f1",
  ];

  chartInstances.authors = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: authors.map((a) => a.name),
      datasets: [
        {
          data: authors.map((a) => a.commits),
          backgroundColor: colors.slice(0, authors.length),
          borderColor: "#1e1e1e",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#d4d4d4",
            padding: 15,
            font: {
              size: 12,
            },
          },
        },
      },
    },
  });
}

/**
 * Render volatility scatter chart
 */
function renderVolatilityChart() {
  const ctx = document.getElementById("volatilityChart");
  if (!ctx) return;

  if (chartInstances.volatility) {
    chartInstances.volatility.destroy();
  }

  const files = analyticsData.files || [];
  const highRisk = files.filter((f) => f.risk === "high").slice(0, 20);

  chartInstances.volatility = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "High Risk Files",
          data: highRisk.map((f) => ({
            x: f.commitCount,
            y: f.volatility,
          })),
          backgroundColor: "#ff5555",
          borderColor: "#cc0000",
          borderWidth: 1,
          pointRadius: 6,
        },
        {
          label: "Medium Risk Files",
          data: files
            .filter((f) => f.risk === "medium")
            .slice(0, 20)
            .map((f) => ({
              x: f.commitCount,
              y: f.volatility,
            })),
          backgroundColor: "#ffaa00",
          borderColor: "#dd8800",
          borderWidth: 1,
          pointRadius: 5,
        },
        {
          label: "Low Risk Files",
          data: files
            .filter((f) => f.risk === "low")
            .slice(0, 10)
            .map((f) => ({
              x: f.commitCount,
              y: f.volatility,
            })),
          backgroundColor: "#00dd00",
          borderColor: "#00aa00",
          borderWidth: 1,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: "#d4d4d4",
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Commit Count",
            color: "#d4d4d4",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#d4d4d4",
          },
        },
        y: {
          title: {
            display: true,
            text: "Volatility",
            color: "#d4d4d4",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#d4d4d4",
          },
        },
      },
    },
  });
}

/**
 * Render files table
 */
function renderTables() {
  const tbody = document.getElementById("filesTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const files = analyticsData.files || [];
  const maxRows = 50;

  for (let i = 0; i < Math.min(files.length, maxRows); i++) {
    const file = files[i];
    const row = tbody.insertRow();

    row.innerHTML = `
      <td><code>${escapeHtml(file.path)}</code></td>
      <td>${file.commitCount}</td>
      <td>+${file.insertions}</td>
      <td>-${file.deletions}</td>
      <td>${file.volatility.toFixed(1)}</td>
      <td><span class="risk-${file.risk}">${file.risk}</span></td>
    `;
  }
}

/**
 * Event Listeners
 */

document.getElementById("applyFilters")?.addEventListener("click", () => {
  const period = document.getElementById("period")?.value || "3mo";
  const author = document.getElementById("authorFilter")?.value || "";
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

  // Header
  lines.push("Git Analytics Report");
  lines.push(`Period,${analyticsData.period}`);
  lines.push(`Generated,${new Date(analyticsData.generatedAt).toISOString()}`);
  lines.push("");

  // Summary
  lines.push("Summary");
  const sum = analyticsData.summary;
  lines.push(
    "Total Commits,Total Authors,Total Files,Lines Added,Lines Deleted,Commit Frequency,Avg Commit Size,Churn Rate"
  );
  lines.push(
    `${sum.totalCommits},${sum.totalAuthors},${sum.totalFilesModified},${sum.totalLinesAdded},${sum.totalLinesDeleted},${sum.commitFrequency.toFixed(2)},${sum.averageCommitSize.toFixed(2)},${sum.churnRate.toFixed(2)}`
  );
  lines.push("");

  // Files
  lines.push("Files");
  lines.push(
    "Path,Commits,Insertions,Deletions,Volatility,Risk,Authors,Last Modified"
  );

  for (const file of analyticsData.files.slice(0, 100)) {
    const authors = Array.from(file.authors || []).join(";");
    lines.push(
      `"${file.path}",${file.commitCount},${file.insertions},${file.deletions},${file.volatility.toFixed(2)},${file.risk},"${authors}",${new Date(file.lastModified).toISOString()}`
    );
  }
  lines.push("");

  // Authors
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
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Initialize on document load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (analyticsData) {
      renderUI();
    }
  });
} else {
  if (analyticsData) {
    renderUI();
  }
}
