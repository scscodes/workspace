/**
 * Git Analytics Handler — Entry point for git.showAnalytics command
 */

import {
  Handler,
  CommandContext,
  success,
  failure,
  Logger,
} from "../../types";
import { AnalyticsOptions, GitAnalyticsReport } from "./analytics-types";
import { GitAnalyzer } from "./analytics-service";

/**
 * Create the analytics handler
 */
export function createShowAnalyticsHandler(
  analyzer: GitAnalyzer,
  logger: Logger
): Handler<AnalyticsOptions, GitAnalyticsReport> {
  return async (
    _ctx: CommandContext,
    params: Partial<AnalyticsOptions> = {}
  ) => {
    try {
      // Default period to 3 months
      const period = params.period || "3mo";
      if (period !== "3mo" && period !== "6mo" && period !== "12mo") {
        return failure({
          code: "INVALID_PERIOD",
          message: `Invalid period: ${period}. Must be 3mo, 6mo, or 12mo`,
          context: "ShowAnalyticsHandler",
        });
      }

      const options: AnalyticsOptions = {
        period,
        author: params.author,
        pathPattern: params.pathPattern,
      };

      logger.info(
        `Running analytics for period: ${options.period}`,
        "ShowAnalyticsHandler"
      );

      const report = await analyzer.analyze(options);

      logger.info(
        `Analytics complete: ${report.summary.totalCommits} commits by ${report.summary.totalAuthors} authors`,
        "ShowAnalyticsHandler"
      );

      return success(report);
    } catch (err) {
      const error = {
        code: "ANALYTICS_ERROR" as const,
        message: `Failed to generate analytics: ${err instanceof Error ? err.message : String(err)}`,
        context: "ShowAnalyticsHandler",
        details: err,
      };
      logger.error(
        `Analytics failed: ${error.message}`,
        "ShowAnalyticsHandler",
        error
      );
      return failure(error);
    }
  };
}

/**
 * Create export handler for JSON
 */
export function createExportJsonHandler(
  analyzer: GitAnalyzer,
  _logger: Logger
): Handler<AnalyticsOptions, string> {
  return async (
    _ctx: CommandContext,
    params: Partial<AnalyticsOptions> = {}
  ) => {
    try {
      const period = params.period || "3mo";
      const options: AnalyticsOptions = {
        period: period as any,
        author: params.author,
        pathPattern: params.pathPattern,
      };

      const report = await analyzer.analyze(options);
      const json = analyzer.exportToJSON(report);

      return success(json);
    } catch (err) {
      return failure({
        code: "EXPORT_ERROR",
        message: `Failed to export JSON: ${err instanceof Error ? err.message : String(err)}`,
        context: "ExportJsonHandler",
        details: err,
      });
    }
  };
}

/**
 * Create export handler for CSV
 */
export function createExportCsvHandler(
  analyzer: GitAnalyzer,
  _logger: Logger
): Handler<AnalyticsOptions, string> {
  return async (
    _ctx: CommandContext,
    params: Partial<AnalyticsOptions> = {}
  ) => {
    try {
      const period = params.period || "3mo";
      const options: AnalyticsOptions = {
        period: period as any,
        author: params.author,
        pathPattern: params.pathPattern,
      };

      const report = await analyzer.analyze(options);
      const csv = analyzer.exportToCSV(report);

      return success(csv);
    } catch (err) {
      return failure({
        code: "EXPORT_ERROR",
        message: `Failed to export CSV: ${err instanceof Error ? err.message : String(err)}`,
        context: "ExportCsvHandler",
        details: err,
      });
    }
  };
}
