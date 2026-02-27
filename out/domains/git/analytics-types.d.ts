/**
 * Git Analytics Types — Data model for analytics reporting
 */
/**
 * Analytics time period
 */
export type AnalyticsPeriod = "3mo" | "6mo" | "12mo";
/**
 * Risk level for files based on volatility
 */
export type FileRiskLevel = "high" | "medium" | "low";
/**
 * Trend direction
 */
export type TrendDirection = "up" | "stable" | "down";
/**
 * Individual commit metric from git history
 */
export interface CommitFileChange {
    path: string;
    insertions: number;
    deletions: number;
}
export interface CommitMetric {
    hash: string;
    author: string;
    date: Date;
    filesChanged: number;
    insertions: number;
    deletions: number;
    message: string;
    files: CommitFileChange[];
}
/**
 * File-level statistics aggregated over period
 */
export interface FileMetric {
    path: string;
    commitCount: number;
    insertions: number;
    deletions: number;
    volatility: number;
    authors: Set<string>;
    lastModified: Date;
    risk: FileRiskLevel;
}
/**
 * Author contribution statistics
 */
export interface AuthorMetric {
    name: string;
    commits: number;
    insertions: number;
    deletions: number;
    filesChanged: number;
    lastActive: Date;
}
/**
 * Trend data: slope analysis of commit and volatility metrics
 */
export interface CommitTrend {
    slope: number;
    direction: TrendDirection;
    confidence: number;
}
export interface VolatilityTrend {
    slope: number;
    direction: TrendDirection;
}
export interface TrendData {
    commitTrend: CommitTrend;
    volatilityTrend: VolatilityTrend;
}
/**
 * Summary statistics across entire period
 */
export interface AnalyticsSummary {
    totalCommits: number;
    totalAuthors: number;
    totalFilesModified: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    commitFrequency: number;
    averageCommitSize: number;
    churnRate: number;
}
/**
 * Complete analytics report
 */
export interface GitAnalyticsReport {
    period: AnalyticsPeriod;
    generatedAt: Date;
    summary: AnalyticsSummary;
    commits: CommitMetric[];
    files: FileMetric[];
    authors: AuthorMetric[];
    trends: TrendData;
    commitFrequency: {
        labels: string[];
        data: number[];
    };
    churnFiles: FileMetric[];
    topAuthors: AuthorMetric[];
}
/**
 * Options for running analysis
 */
export interface AnalyticsOptions {
    period: AnalyticsPeriod;
    author?: string;
    pathPattern?: string;
}
/**
 * Cached analytics result with timestamp
 */
export interface CachedAnalytics {
    report: GitAnalyticsReport;
    cachedAt: Date;
    key: string;
}
/**
 * Webview message format
 */
export type AnalyticsWebviewMessageType = "init" | "filter" | "export";
export interface AnalyticsWebviewMessage {
    type: AnalyticsWebviewMessageType;
    payload?: {
        period?: AnalyticsPeriod;
        author?: string;
        pathPattern?: string;
        format?: "json" | "csv";
    };
}
//# sourceMappingURL=analytics-types.d.ts.map