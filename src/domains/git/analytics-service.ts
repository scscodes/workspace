/**
 * Git Analytics Service — Parse git history and generate telemetry
 */

// Declare require for Node.js module access
declare const require: any;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require("child_process");
import {
  AnalyticsPeriod,
  AnalyticsOptions,
  AnalyticsSummary,
  AuthorMetric,
  CachedAnalytics,
  CommitMetric,
  FileMetric,
  GitAnalyticsReport,
  TrendData,
} from "./analytics-types";

export class GitAnalyzer {
  private cacheMap: Map<string, CachedAnalytics> = new Map();
  private cacheTTLMs = 10 * 60 * 1000; // 10 minutes

  /**
   * Generate cache key from options
   */
  private getCacheKey(opts: AnalyticsOptions): string {
    const parts = [opts.period, opts.author || "all", opts.pathPattern || "all"];
    return parts.join("|");
  }

  /**
   * Main entry point: analyze git history over period
   */
  async analyze(opts: AnalyticsOptions): Promise<GitAnalyticsReport> {
    const cacheKey = this.getCacheKey(opts);

    // Check cache
    const cached = this.cacheMap.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt.getTime() < this.cacheTTLMs) {
      return cached.report;
    }

    // Calculate date range
    const since = this.getPeriodStartDate(opts.period);
    const until = new Date();

    // Parse git log
    const commits = this.parseGitLog(since, until, opts);

    // Aggregate metrics
    const files = this.aggregateFiles(commits);
    const authors = this.aggregateAuthors(commits);

    // Calculate trends
    const trends = this.calculateTrends(commits);

    // Build summary
    const summary = this.buildSummary(commits, files, authors, since, until);

    // Build frequency data
    const commitFrequency = this.buildCommitFrequency(commits);

    // Top 10 churn files
    const churnFiles = files.sort((a, b) => b.volatility - a.volatility).slice(0, 10);

    // Top 5 authors
    const topAuthors = authors
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 5);

    const report: GitAnalyticsReport = {
      period: opts.period,
      generatedAt: new Date(),
      summary,
      commits,
      files,
      authors,
      trends,
      commitFrequency,
      churnFiles,
      topAuthors,
    };

    // Cache result
    this.cacheMap.set(cacheKey, {
      report,
      cachedAt: new Date(),
      key: cacheKey,
    });

    return report;
  }

  /**
   * Parse git log with numstat format
   * Format: git log --pretty=format:"%H|%an|%ai|%s" --numstat
   * Output:
   *   hash|author|date|message
   *   5   3   src/file.ts
   *   2   1   src/other.ts
   */
  private parseGitLog(
    since: Date,
    until: Date,
    opts: AnalyticsOptions
  ): CommitMetric[] {
    try {
      const sinceStr = since.toISOString().split("T")[0];
      const untilStr = until.toISOString().split("T")[0];

      let cmd = `git log --since="${sinceStr}" --until="${untilStr}" --pretty=format:"%H|%an|%ai|%s" --numstat`;

      // Filter by author if specified
      if (opts.author) {
        cmd += ` --author="${opts.author}"`;
      }

      const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });

      const commits: CommitMetric[] = [];
      let currentCommit: Partial<CommitMetric> | null = null;
      const commitLines = new Map<string, string[]>();

      // Parse output line by line
      for (const line of output.split("\n")) {
        if (!line.trim()) continue;

        // Commit header line: hash|author|date|message
        if (line.includes("|")) {
          // Save previous commit if exists
          if (currentCommit && currentCommit.hash) {
            const filesLines = commitLines.get(currentCommit.hash) || [];
            this.aggregateCommitFiles(currentCommit as CommitMetric, filesLines);
            if (opts.pathPattern === undefined || this.matchesPathPattern(currentCommit as CommitMetric, opts.pathPattern)) {
              commits.push(currentCommit as CommitMetric);
            }
          }

          const parts = line.split("|");
          if (parts.length >= 4) {
            currentCommit = {
              hash: parts[0],
              author: parts[1],
              date: new Date(parts[2]),
              message: parts[3],
              filesChanged: 0,
              insertions: 0,
              deletions: 0,
            };
            commitLines.set(parts[0], []);
          }
        } else if (currentCommit && currentCommit.hash) {
          // File change line: "insertions\tdeletions\tpath"
          const lines = commitLines.get(currentCommit.hash) || [];
          lines.push(line);
          commitLines.set(currentCommit.hash, lines);
        }
      }

      // Process last commit
      if (currentCommit && currentCommit.hash) {
        const filesLines = commitLines.get(currentCommit.hash) || [];
        this.aggregateCommitFiles(currentCommit as CommitMetric, filesLines);
        if (opts.pathPattern === undefined || this.matchesPathPattern(currentCommit as CommitMetric, opts.pathPattern)) {
          commits.push(currentCommit as CommitMetric);
        }
      }

      return commits;
    } catch (err) {
      // Return empty if git command fails (e.g., no commits in range)
      return [];
    }
  }

  /**
   * Process numstat lines for a commit
   */
  private aggregateCommitFiles(
    commit: CommitMetric,
    lines: string[]
  ): void {
    let filesChanged = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const insertions = parseInt(parts[0]) || 0;
        const deletions = parseInt(parts[1]) || 0;

        totalInsertions += insertions;
        totalDeletions += deletions;
        filesChanged++;
      }
    }

    commit.filesChanged = filesChanged;
    commit.insertions = totalInsertions;
    commit.deletions = totalDeletions;
  }

  /**
   * Check if commit matches path pattern filter
   */
  private matchesPathPattern(_commit: CommitMetric, _pattern: string): boolean {
    // For now, simple path filtering
    // In a full implementation, would parse numstat and check file paths
    return true; // TODO: implement path filtering
  }

  /**
   * Aggregate file-level statistics
   */
  private aggregateFiles(commits: CommitMetric[]): FileMetric[] {
    const fileMap = new Map<string, FileMetric>();

    // For now, use commit-level stats
    // In a full implementation, would parse numstat per commit
    // to get per-file stats
    for (const commit of commits) {
      // Placeholder: would need to parse actual file paths from numstat
      const path = `commit/${commit.hash}`;
      if (!fileMap.has(path)) {
        fileMap.set(path, {
          path,
          commitCount: 0,
          insertions: 0,
          deletions: 0,
          volatility: 0,
          authors: new Set(),
          lastModified: commit.date,
          risk: "low",
        });
      }

      const metric = fileMap.get(path)!;
      metric.commitCount++;
      metric.insertions += commit.insertions;
      metric.deletions += commit.deletions;
      metric.authors.add(commit.author);
      if (commit.date > metric.lastModified) {
        metric.lastModified = commit.date;
      }
    }

    // Calculate volatility and risk
    for (const metric of fileMap.values()) {
      metric.volatility =
        metric.commitCount > 0
          ? (metric.insertions + metric.deletions) / metric.commitCount
          : 0;

      // Determine risk level
      if (metric.volatility > 100) {
        metric.risk = "high";
      } else if (metric.volatility > 30) {
        metric.risk = "medium";
      } else {
        metric.risk = "low";
      }
    }

    return Array.from(fileMap.values()).sort(
      (a, b) => b.volatility - a.volatility
    );
  }

  /**
   * Aggregate author-level statistics
   */
  private aggregateAuthors(commits: CommitMetric[]): AuthorMetric[] {
    const authorMap = new Map<string, AuthorMetric>();

    for (const commit of commits) {
      if (!authorMap.has(commit.author)) {
        authorMap.set(commit.author, {
          name: commit.author,
          commits: 0,
          insertions: 0,
          deletions: 0,
          filesChanged: 0,
          lastActive: commit.date,
        });
      }

      const metric = authorMap.get(commit.author)!;
      metric.commits++;
      metric.insertions += commit.insertions;
      metric.deletions += commit.deletions;
      metric.filesChanged += commit.filesChanged;
      if (commit.date > metric.lastActive) {
        metric.lastActive = commit.date;
      }
    }

    return Array.from(authorMap.values()).sort(
      (a, b) => b.commits - a.commits
    );
  }

  /**
   * Calculate trend metrics
   */
  private calculateTrends(commits: CommitMetric[]): TrendData {
    // Simple slope calculation: compare first half vs second half
    const mid = Math.floor(commits.length / 2);
    const firstHalf = commits.slice(0, mid);
    const secondHalf = commits.slice(mid);

    const firstAvg = firstHalf.length > 0 ? firstHalf.length / 4 : 0; // Normalize to weeks
    const secondAvg = secondHalf.length > 0 ? secondHalf.length / 4 : 0;

    const commitSlope = secondAvg - firstAvg;
    const commitDirection = this.getDirection(commitSlope);

    // Volatility trend
    const firstVolatility = this.getAverageVolatility(firstHalf);
    const secondVolatility = this.getAverageVolatility(secondHalf);
    const volatilitySlope = secondVolatility - firstVolatility;
    const volatilityDirection = this.getDirection(volatilitySlope);

    return {
      commitTrend: {
        slope: commitSlope,
        direction: commitDirection,
        confidence: 0.75,
      },
      volatilityTrend: {
        slope: volatilitySlope,
        direction: volatilityDirection,
      },
    };
  }

  /**
   * Get trend direction from slope
   */
  private getDirection(slope: number): "up" | "stable" | "down" {
    if (slope > 0.5) return "up";
    if (slope < -0.5) return "down";
    return "stable";
  }

  /**
   * Calculate average volatility for a set of commits
   */
  private getAverageVolatility(commits: CommitMetric[]): number {
    if (commits.length === 0) return 0;
    const total = commits.reduce(
      (sum, c) => sum + (c.insertions + c.deletions),
      0
    );
    return total / commits.length;
  }

  /**
   * Build summary statistics
   */
  private buildSummary(
    commits: CommitMetric[],
    files: FileMetric[],
    authors: AuthorMetric[],
    since: Date,
    until: Date
  ): AnalyticsSummary {
    const weeksDiff = (until.getTime() - since.getTime()) / (7 * 24 * 60 * 60 * 1000);

    const totalInsertions = commits.reduce((sum, c) => sum + c.insertions, 0);
    const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);

    return {
      totalCommits: commits.length,
      totalAuthors: authors.length,
      totalFilesModified: files.length,
      totalLinesAdded: totalInsertions,
      totalLinesDeleted: totalDeletions,
      commitFrequency: weeksDiff > 0 ? commits.length / weeksDiff : 0,
      averageCommitSize:
        commits.length > 0
          ? (totalInsertions + totalDeletions) / commits.length
          : 0,
      churnRate: files.reduce((sum, f) => sum + f.volatility, 0) / files.length || 0,
    };
  }

  /**
   * Build commit frequency time series data
   */
  private buildCommitFrequency(
    commits: CommitMetric[]
  ): { labels: string[]; data: number[] } {
    // Group commits by week
    const weekMap = new Map<string, number>();

    for (const commit of commits) {
      const weekKey = this.getWeekKey(commit.date);
      weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
    }

    // Sort by date and create labels/data
    const sorted = Array.from(weekMap.entries()).sort();
    const labels = sorted.map(([key]) => key);
    const data = sorted.map(([, count]) => count);

    return { labels, data };
  }

  /**
   * Get week key for grouping (YYYY-W##)
   */
  private getWeekKey(date: Date): string {
    const d = new Date(date);
    const week = Math.ceil(d.getDate() / 7);
    return `${d.getFullYear()}-W${week.toString().padStart(2, "0")}`;
  }

  /**
   * Get period start date
   */
  private getPeriodStartDate(period: AnalyticsPeriod): Date {
    const now = new Date();
    const months = period === "3mo" ? 3 : period === "6mo" ? 6 : 12;
    return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cacheMap.clear();
  }

  /**
   * Export analytics to JSON
   */
  exportToJSON(report: GitAnalyticsReport): string {
    return JSON.stringify(report, (_key, value) => {
      // Convert Sets to arrays for serialization
      if (value instanceof Set) {
        return Array.from(value);
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2);
  }

  /**
   * Export analytics to CSV
   */
  exportToCSV(report: GitAnalyticsReport): string {
    const lines: string[] = [];

    // Summary section
    lines.push("Git Analytics Report");
    lines.push(`Period,${report.period}`);
    lines.push(`Generated,${report.generatedAt.toISOString()}`);
    lines.push("");

    // Summary stats
    lines.push("Summary");
    lines.push(
      `Total Commits,Total Authors,Total Files Modified,Lines Added,Lines Deleted,Commit Frequency (per week),Avg Commit Size,Churn Rate`
    );
    const sum = report.summary;
    lines.push(
      `${sum.totalCommits},${sum.totalAuthors},${sum.totalFilesModified},${sum.totalLinesAdded},${sum.totalLinesDeleted},${sum.commitFrequency.toFixed(2)},${sum.averageCommitSize.toFixed(2)},${sum.churnRate.toFixed(2)}`
    );
    lines.push("");

    // Files section
    lines.push("Files");
    lines.push(
      "Path,Commits,Insertions,Deletions,Volatility,Risk,Authors,Last Modified"
    );
    for (const file of report.files.slice(0, 100)) {
      lines.push(
        `"${file.path}",${file.commitCount},${file.insertions},${file.deletions},${file.volatility.toFixed(2)},${file.risk},"${Array.from(file.authors).join(";")}",${file.lastModified.toISOString()}`
      );
    }
    lines.push("");

    // Authors section
    lines.push("Authors");
    lines.push("Name,Commits,Insertions,Deletions,Files Changed,Last Active");
    for (const author of report.authors) {
      lines.push(
        `"${author.name}",${author.commits},${author.insertions},${author.deletions},${author.filesChanged},${author.lastActive.toISOString()}`
      );
    }

    return lines.join("\n");
  }
}
