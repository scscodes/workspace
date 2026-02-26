/**
 * Git Analytics Handler — Entry point for git.showAnalytics command
 */
import { Handler, Logger } from "../../types";
import { AnalyticsOptions, GitAnalyticsReport } from "./analytics-types";
import { GitAnalyzer } from "./analytics-service";
/**
 * Create the analytics handler
 */
export declare function createShowAnalyticsHandler(analyzer: GitAnalyzer, logger: Logger): Handler<AnalyticsOptions, GitAnalyticsReport>;
/**
 * Create export handler for JSON
 */
export declare function createExportJsonHandler(analyzer: GitAnalyzer, _logger: Logger): Handler<AnalyticsOptions, string>;
/**
 * Create export handler for CSV
 */
export declare function createExportCsvHandler(analyzer: GitAnalyzer, _logger: Logger): Handler<AnalyticsOptions, string>;
//# sourceMappingURL=analytics-handler.d.ts.map