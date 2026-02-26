import { describe, it, expect, vi } from "vitest";
import {
  createShowAnalyticsHandler,
  createExportJsonHandler,
  createExportCsvHandler,
} from "../src/domains/git/analytics-handler";
import { MockLogger, createMockContext, assertSuccess, assertFailure } from "./fixtures";
import { GitAnalyzer } from "../src/domains/git/analytics-service";
import { GitAnalyticsReport } from "../src/domains/git/analytics-types";

describe("git analytics handlers", () => {
  const ctx = createMockContext();

  function createFakeReport(): GitAnalyticsReport {
    const now = new Date();
    return {
      period: "3mo",
      generatedAt: now,
      summary: {
        totalCommits: 10,
        totalAuthors: 2,
        totalFilesModified: 5,
        totalLinesAdded: 100,
        totalLinesDeleted: 20,
        commitFrequency: 1,
        averageCommitSize: 12,
        churnRate: 5,
      },
      commits: [],
      files: [],
      authors: [],
      trends: {
        commitTrend: { slope: 0, direction: "stable", confidence: 0.5 },
        volatilityTrend: { slope: 0, direction: "stable" },
      },
      commitFrequency: { labels: [], data: [] },
      churnFiles: [],
      topAuthors: [],
    };
  }

  describe("createShowAnalyticsHandler", () => {
    it("returns analytics report for valid period", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();
      const analyzeSpy = vi
        .spyOn(analyzer, "analyze")
        .mockResolvedValueOnce(createFakeReport());

      const handler = createShowAnalyticsHandler(analyzer, logger);

      const result = await handler(ctx, { period: "6mo", author: "alice" });
      const report = assertSuccess(result);

      expect(analyzeSpy).toHaveBeenCalledWith({
        period: "6mo",
        author: "alice",
        pathPattern: undefined,
      });
      expect(report.summary.totalCommits).toBe(10);
    });

    it("validates period and returns INVALID_PERIOD error", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();
      const handler = createShowAnalyticsHandler(analyzer, logger);

      const result = await handler(ctx, { period: "1w" as any });
      const err = assertFailure(result);

      expect(err.code).toBe("INVALID_PERIOD");
      expect(err.context).toBe("ShowAnalyticsHandler");
    });

    it("wraps analyzer errors with ANALYTICS_ERROR", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();

      vi.spyOn(analyzer, "analyze").mockRejectedValueOnce(
        new Error("git log failed")
      );

      const handler = createShowAnalyticsHandler(analyzer, logger);
      const result = await handler(ctx, { period: "3mo" });
      const err = assertFailure(result);

      expect(err.code).toBe("ANALYTICS_ERROR");
      expect(err.context).toBe("ShowAnalyticsHandler");
      expect(err.message).toContain("Failed to generate analytics");
    });
  });

  describe("createExportJsonHandler", () => {
    it("exports analytics report as JSON", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();
      const report = createFakeReport();

      vi.spyOn(analyzer, "analyze").mockResolvedValueOnce(report);
      const exportSpy = vi
        .spyOn(analyzer, "exportToJSON")
        .mockReturnValueOnce('{"ok":true}');

      const handler = createExportJsonHandler(analyzer, logger as any);
      const result = await handler(ctx, { period: "12mo" });
      const json = assertSuccess(result);

      expect(exportSpy).toHaveBeenCalledWith(report);
      expect(json).toBe('{"ok":true}');
    });

    it("wraps errors from analyzer/export with EXPORT_ERROR", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();

      vi.spyOn(analyzer, "analyze").mockRejectedValueOnce(
        new Error("boom")
      );

      const handler = createExportJsonHandler(analyzer, logger as any);
      const result = await handler(ctx, { period: "3mo" });
      const err = assertFailure(result);

      expect(err.code).toBe("EXPORT_ERROR");
      expect(err.context).toBe("ExportJsonHandler");
    });
  });

  describe("createExportCsvHandler", () => {
    it("exports analytics report as CSV", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();
      const report = createFakeReport();

      vi.spyOn(analyzer, "analyze").mockResolvedValueOnce(report);
      const exportSpy = vi
        .spyOn(analyzer, "exportToCSV")
        .mockReturnValueOnce("csv-data");

      const handler = createExportCsvHandler(analyzer, logger as any);
      const result = await handler(ctx, { period: "3mo" });
      const csv = assertSuccess(result);

      expect(exportSpy).toHaveBeenCalledWith(report);
      expect(csv).toBe("csv-data");
    });

    it("wraps errors from analyzer/export with EXPORT_ERROR", async () => {
      const logger = new MockLogger();
      const analyzer = new GitAnalyzer();

      vi.spyOn(analyzer, "analyze").mockRejectedValueOnce(
        new Error("csv fail")
      );

      const handler = createExportCsvHandler(analyzer, logger as any);
      const result = await handler(ctx, { period: "3mo" });
      const err = assertFailure(result);

      expect(err.code).toBe("EXPORT_ERROR");
      expect(err.context).toBe("ExportCsvHandler");
    });
  });
});

