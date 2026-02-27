"use strict";
/**
 * Git Analytics Handler — Entry point for git.showAnalytics command
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShowAnalyticsHandler = createShowAnalyticsHandler;
exports.createExportJsonHandler = createExportJsonHandler;
exports.createExportCsvHandler = createExportCsvHandler;
const types_1 = require("../../types");
/**
 * Create the analytics handler
 */
function createShowAnalyticsHandler(analyzer, logger) {
    return async (_ctx, params = {}) => {
        try {
            // Default period to 3 months
            const period = params.period || "3mo";
            if (period !== "3mo" && period !== "6mo" && period !== "12mo") {
                return (0, types_1.failure)({
                    code: "INVALID_PERIOD",
                    message: `Invalid period: ${period}. Must be 3mo, 6mo, or 12mo`,
                    context: "ShowAnalyticsHandler",
                });
            }
            const options = {
                period,
                author: params.author,
                pathPattern: params.pathPattern,
            };
            logger.info(`Running analytics for period: ${options.period}`, "ShowAnalyticsHandler");
            const report = await analyzer.analyze(options);
            logger.info(`Analytics complete: ${report.summary.totalCommits} commits by ${report.summary.totalAuthors} authors`, "ShowAnalyticsHandler");
            return (0, types_1.success)(report);
        }
        catch (err) {
            const error = {
                code: "ANALYTICS_ERROR",
                message: `Failed to generate analytics: ${err instanceof Error ? err.message : String(err)}`,
                context: "ShowAnalyticsHandler",
                details: err,
            };
            logger.error(`Analytics failed: ${error.message}`, "ShowAnalyticsHandler", error);
            return (0, types_1.failure)(error);
        }
    };
}
/**
 * Create export handler for JSON
 */
function createExportJsonHandler(analyzer, _logger) {
    return async (_ctx, params = {}) => {
        try {
            const period = params.period || "3mo";
            if (period !== "3mo" && period !== "6mo" && period !== "12mo") {
                return (0, types_1.failure)({
                    code: "INVALID_PERIOD",
                    message: `Invalid period: ${period}. Must be 3mo, 6mo, or 12mo`,
                    context: "ExportJsonHandler",
                });
            }
            const options = {
                period,
                author: params.author,
                pathPattern: params.pathPattern,
            };
            const report = await analyzer.analyze(options);
            const json = analyzer.exportToJSON(report);
            return (0, types_1.success)(json);
        }
        catch (err) {
            return (0, types_1.failure)({
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
function createExportCsvHandler(analyzer, _logger) {
    return async (_ctx, params = {}) => {
        try {
            const period = params.period || "3mo";
            if (period !== "3mo" && period !== "6mo" && period !== "12mo") {
                return (0, types_1.failure)({
                    code: "INVALID_PERIOD",
                    message: `Invalid period: ${period}. Must be 3mo, 6mo, or 12mo`,
                    context: "ExportCsvHandler",
                });
            }
            const options = {
                period,
                author: params.author,
                pathPattern: params.pathPattern,
            };
            const report = await analyzer.analyze(options);
            const csv = analyzer.exportToCSV(report);
            return (0, types_1.success)(csv);
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "EXPORT_ERROR",
                message: `Failed to export CSV: ${err instanceof Error ? err.message : String(err)}`,
                context: "ExportCsvHandler",
                details: err,
            });
        }
    };
}
//# sourceMappingURL=analytics-handler.js.map