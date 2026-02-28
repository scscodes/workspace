/**
 * Git Analytics Service — Parse git history and generate telemetry
 */
import { AnalyticsOptions, GitAnalyticsReport } from "./analytics-types";
export declare class GitAnalyzer {
    private readonly workspaceRoot;
    private cacheMap;
    private cacheTTLMs;
    constructor(workspaceRoot?: string);
    /**
     * Generate cache key from options
     */
    private getCacheKey;
    /**
     * Main entry point: analyze git history over period
     */
    analyze(opts: AnalyticsOptions): Promise<GitAnalyticsReport>;
    /**
     * Parse git log with numstat format
     * Format: git log --pretty=format:"%H|%an|%ai|%s" --numstat
     * Output:
     *   hash|author|date|message
     *   5   3   src/file.ts
     *   2   1   src/other.ts
     */
    private parseGitLog;
    /**
     * Process numstat lines for a commit
     */
    private aggregateCommitFiles;
    /**
     * Check if commit matches path pattern filter
     */
    private matchesPathPattern;
    /**
     * Aggregate file-level statistics
     */
    private aggregateFiles;
    /**
     * Aggregate author-level statistics
     */
    private aggregateAuthors;
    /**
     * Calculate trend metrics
     */
    private calculateTrends;
    /**
     * Get trend direction from slope
     */
    private getDirection;
    /**
     * Calculate average volatility for a set of commits
     */
    private getAverageVolatility;
    /**
     * Build summary statistics
     */
    private buildSummary;
    /**
     * Build commit frequency time series data
     */
    private buildCommitFrequency;
    /**
     * Get week key for grouping (YYYY-W##)
     */
    private getWeekKey;
    /**
     * Get period start date
     */
    private getPeriodStartDate;
    /**
     * Clear cache
     */
    clearCache(): void;
    /**
     * Export analytics to JSON
     */
    exportToJSON(report: GitAnalyticsReport): string;
    /**
     * Export analytics to CSV
     */
    exportToCSV(report: GitAnalyticsReport): string;
}
//# sourceMappingURL=analytics-service.d.ts.map