/**
 * Hygiene Analytics Handler — entry point for hygiene.showAnalytics command.
 */

import { Handler, CommandContext, success, failure, Logger } from "../../types";
import { HygieneAnalyticsReport, PruneConfig, PRUNE_DEFAULTS } from "./analytics-types";
import { HygieneAnalyzer } from "./analytics-service";

export function createShowHygieneAnalyticsHandler(
  analyzer: HygieneAnalyzer,
  logger: Logger
): Handler<Partial<PruneConfig>, HygieneAnalyticsReport> {
  return async (ctx: CommandContext, params: Partial<PruneConfig> = {}) => {
    try {
      const workspaceRoot = ctx.workspaceFolders?.[0] ?? process.cwd();

      // Merge caller-supplied config with defaults
      const config: PruneConfig = {
        minAgeDays: params.minAgeDays ?? PRUNE_DEFAULTS.minAgeDays,
        maxSizeMB: params.maxSizeMB ?? PRUNE_DEFAULTS.maxSizeMB,
        minLineCount: params.minLineCount ?? PRUNE_DEFAULTS.minLineCount,
        categories: params.categories ?? PRUNE_DEFAULTS.categories,
      };

      const report = analyzer.analyze(workspaceRoot, config);

      logger.info(
        `Hygiene analytics: ${report.summary.totalFiles} files, ${report.summary.pruneCount} prune candidates`,
        "HygieneAnalyticsHandler"
      );

      return success(report);
    } catch (err) {
      return failure({
        code: "HYGIENE_ANALYTICS_ERROR",
        message: "Hygiene analytics failed",
        details: err,
        context: "hygiene.showAnalytics",
      });
    }
  };
}
