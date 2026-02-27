/**
 * Hygiene Analytics Webview Script
 *
 * Message protocol:
 *   extension → webview:  { type: "init", payload: HygieneAnalyticsReport }
 *   webview → extension:  { type: "refresh" }
 *                         { type: "openSettings" }
 */

const vscode = typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

let report = null;
let charts = {};

// Category colour palette (matches CSS tokens)
const CAT_COLORS = {
  markdown: "#4fc3f7",
  source:   "#81c784",
  config:   "#ffb74d",
  log:      "#ff8a65",
  backup:   "#ce93d8",
  temp:     "#ef9a9a",
  artifact: "#f06292",
  other:    "#90a4ae",
};

// Temporal line colours
const TEMPORAL_COLORS = ["#e0e0e0", "#06b6d4", "#f59e0b", "#a78bfa", "#10b981"];

// ============================================================================
// Message listener
// ============================================================================

if (vscode) {
  window.addEventListener("message", (event) => {
    if (event.data.type === "init") {
      report = event.data.payload;
      renderUI();
    }
  });
}

// ============================================================================
// Top-level render
// ============================================================================

function renderUI() {
  if (!report) return;
  updateSummary();
  renderCategoryBar();
  renderTemporalChart();
  renderPruneTable();
  renderFilesTable();
}

// ============================================================================
// Summary cards
// ============================================================================

function updateSummary() {
  const s = report.summary;
  setText("totalFiles", s.totalFiles.toLocaleString());
  setText("totalSize",  fmtBytes(s.totalSizeBytes));
  setText("pruneCount", s.pruneCount.toLocaleString());
  setText("pruneSize",  fmtBytes(s.pruneEstimateSizeBytes) + " recoverable");

  // Active prune criteria
  const pc = report.pruneConfig;
  const parts = [
    `age ≥ ${pc.minAgeDays}d`,
    `size > ${pc.maxSizeMB} MB`,
    `categories: [${(pc.categories || []).join(", ")}]`,
  ];
  if (pc.minLineCount > 0) parts.push(`lines ≥ ${pc.minLineCount}`);
  setText("pruneCriteria", "Active criteria: " + parts.join(" · "));
}

// ============================================================================
// Chart 1 — Category Distribution (thin full-width horizontal stacked bar)
// ============================================================================

function renderCategoryBar() {
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;
  destroyChart("category");

  const byCategory = report.summary.byCategory || {};
  const categories = Object.keys(byCategory).filter((c) => byCategory[c].count > 0);
  if (categories.length === 0) return;

  const datasets = categories.map((cat) => ({
    label: cat,
    data: [byCategory[cat].count],
    backgroundColor: CAT_COLORS[cat] || "#90a4ae",
    borderWidth: 0,
  }));

  charts.category = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [""],
      datasets,
    },
    options: {
      indexAxis: "y",
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },   // custom HTML legend below
        tooltip: {
          callbacks: {
            label: (item) => {
              const cat = categories[item.datasetIndex];
              const stats = byCategory[cat];
              return ` ${cat}: ${stats.count} files (${fmtBytes(stats.sizeBytes)})`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, display: false },
        y: { stacked: true, display: false },
      },
    },
  });

  // Build custom HTML legend
  const legendEl = document.getElementById("categoryLegend");
  if (legendEl) {
    legendEl.innerHTML = categories.map((cat) => `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${CAT_COLORS[cat] || "#90a4ae"}"></span>
        <span>${cat} (${byCategory[cat].count})</span>
      </span>
    `).join("");
  }
}

// ============================================================================
// Chart 2 — Temporal activity (multi-line: Total + prune overlay + top extensions, 14 days)
// ============================================================================

function renderTemporalChart() {
  const ctx = document.getElementById("temporalChart");
  if (!ctx) return;
  destroyChart("temporal");

  const td = report.temporalData;
  if (!td || !td.buckets || td.buckets.length === 0) return;

  // Trim leading days that have zero activity; keep one buffer day for context.
  const firstActive = td.buckets.findIndex((b) => b.total > 0);
  const startIdx = firstActive > 0 ? Math.max(0, firstActive - 1) : 0;
  const buckets = td.buckets.slice(startIdx);

  const labels  = buckets.map((b) => b.label);
  const topExts = td.topExtensions || [];

  // Y-axis ceiling: next 100 above peak total (minimum 100)
  const yMax = Math.ceil(Math.max(...buckets.map((b) => b.total), 1) / 100) * 100;

  const datasets = [
    {
      label: "All files",
      data: buckets.map((b) => b.total),
      borderColor: TEMPORAL_COLORS[0],
      backgroundColor: "rgba(224,224,224,0.07)",
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      borderWidth: 2,
    },
    {
      label: "Prune candidates",
      data: buckets.map((b) => b.pruneCount || 0),
      borderColor: "#ffaa00",
      borderDash: [4, 4],
      backgroundColor: "transparent",
      tension: 0.3,
      fill: false,
      pointRadius: 2,
      borderWidth: 1.5,
    },
    ...topExts.map((ext, i) => ({
      label: ext || "(no ext)",
      data: buckets.map((b) => (b.byExtension || {})[ext] || 0),
      borderColor: TEMPORAL_COLORS[i + 1] || TEMPORAL_COLORS[TEMPORAL_COLORS.length - 1],
      backgroundColor: "transparent",
      tension: 0.3,
      fill: false,
      pointRadius: 2,
      borderWidth: 1.5,
    })),
  ];

  charts.temporal = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: "#d4d4d4",
            font: { size: 11 },
            padding: 12,
            boxWidth: 12,
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
        },
      },
      scales: {
        x: {
          grid:  { color: "rgba(255,255,255,0.07)" },
          ticks: {
            color: "#d4d4d4",
            font: { size: 10 },
            maxRotation: 45,
          },
        },
        y: {
          beginAtZero: true,
          max: yMax,
          grid:  { color: "rgba(255,255,255,0.07)" },
          ticks: { color: "#d4d4d4", stepSize: 100 },
          title: { display: true, text: "Files modified", color: "#d4d4d4", font: { size: 11 } },
        },
      },
    },
  });
}

// ============================================================================
// Prune candidates table
// ============================================================================

function renderPruneTable() {
  const tbody = document.getElementById("pruneTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const candidates = report.pruneCandiates || [];
  if (candidates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:0.5;padding:12px">No prune candidates with active criteria</td></tr>`;
    return;
  }

  for (const f of candidates.slice(0, 100)) {
    const row = tbody.insertRow();
    row.className = "prune-row";
    row.innerHTML = `
      <td><span class="path-link" data-path="${esc(f.path)}"><code title="${esc(f.path)}">${esc(f.path)}</code></span></td>
      <td>${fmtBytes(f.sizeBytes)}</td>
      <td>${f.lineCount >= 0 ? f.lineCount.toLocaleString() : "—"}</td>
      <td>${f.ageDays}</td>
      <td><span class="cat-${f.category}">${f.category}</span></td>
    `;
  }
}

// ============================================================================
// All Files table — sortable, first 100
// ============================================================================

let sortCol = "sizeBytes";
let sortAsc  = false;

function renderFilesTable() {
  const tbody = document.getElementById("filesTableBody");
  if (!tbody) return;

  document.querySelectorAll("#filesTable th[data-col]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.col === sortCol) {
      th.classList.add(sortAsc ? "sort-asc" : "sort-desc");
    }
  });

  const files = [...(report.files || [])].slice(0, 100);

  files.sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "string")  return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    if (typeof av === "boolean") return sortAsc ? (av ? 1 : -1) : (av ? -1 : 1);
    const na = av === -1 ? 0 : av;
    const nb = bv === -1 ? 0 : bv;
    return sortAsc ? na - nb : nb - na;
  });

  tbody.innerHTML = "";

  for (const f of files) {
    const row = tbody.insertRow();
    if (f.isPruneCandidate) row.className = "prune-row";
    row.innerHTML = `
      <td><span class="path-link" data-path="${esc(f.path)}"><code title="${esc(f.path)}">${esc(f.path)}</code></span></td>
      <td>${fmtBytes(f.sizeBytes)}</td>
      <td>${f.lineCount >= 0 ? f.lineCount.toLocaleString() : "—"}</td>
      <td>${f.ageDays}</td>
      <td><span class="cat-${f.category}">${f.category}</span></td>
      <td>${f.isPruneCandidate ? '<span class="prune-yes">Yes</span>' : '<span class="prune-no">—</span>'}</td>
    `;
  }
}

// ============================================================================
// Event listeners
// ============================================================================

document.getElementById("refreshBtn")?.addEventListener("click", () => {
  vscode?.postMessage({ type: "refresh" });
});

document.getElementById("settingsBtn")?.addEventListener("click", () => {
  vscode?.postMessage({ type: "openSettings" });
});

document.getElementById("exportJsonBtn")?.addEventListener("click", () => {
  if (report) download("hygiene-analytics.json", JSON.stringify(report, null, 2), "application/json");
});

document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
  if (report) download("hygiene-analytics.csv", buildHygieneCsv(report.files), "text/csv");
});

// Event delegation for click-to-open paths
document.addEventListener("click", (e) => {
  const link = e.target.closest(".path-link");
  if (link) vscode?.postMessage({ type: "openFile", path: link.dataset.path });
});

document.querySelectorAll("#filesTable th[data-col]").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = col === "path" || col === "category";
    }
    if (report) renderFilesTable();
  });
});

// ============================================================================
// Helpers
// ============================================================================

function fmtBytes(bytes) {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + " GB";
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + " MB";
  if (bytes >= 1_024)          return (bytes / 1_024).toFixed(1) + " KB";
  return bytes + " B";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]
  ));
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function download(filename, content, mimeType) {
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

function buildHygieneCsv(files) {
  const header = "path,size_bytes,line_count,age_days,category,prune_candidate";
  const rows = (files || []).map((f) =>
    [f.path, f.sizeBytes, f.lineCount, f.ageDays, f.category, f.isPruneCandidate]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\r\n");
}
