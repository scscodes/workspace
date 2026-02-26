"use strict";
/**
 * Hygiene Domain Service — workspace cleanup and maintenance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HygieneDomainService = exports.HYGIENE_COMMANDS = void 0;
exports.createHygieneDomain = createHygieneDomain;
const types_1 = require("../../types");
const handlers_1 = require("./handlers");
/**
 * Hygiene domain commands.
 */
exports.HYGIENE_COMMANDS = [
    "hygiene.scan",
    "hygiene.cleanup",
];
class HygieneDomainService {
    constructor(workspaceProvider, logger) {
        this.name = "hygiene";
        this.handlers = {};
        this.scanIntervalMs = 60 * 60 * 1000; // 1 hour default
        this.logger = logger;
        // Initialize handlers
        this.handlers = {
            "hygiene.scan": (0, handlers_1.createScanHandler)(workspaceProvider, logger),
            "hygiene.cleanup": (0, handlers_1.createCleanupHandler)(workspaceProvider, logger),
        };
    }
    /**
     * Initialize domain — set up background scan scheduling.
     * In a real extension, this would register a timer.
     */
    async initialize() {
        try {
            this.logger.info("Initializing hygiene domain", "HygieneDomainService.initialize");
            // TODO: Schedule periodic workspace scan
            // setInterval(async () => {
            //   const scanResult = await this.handlers["hygiene.scan"](...)
            // }, this.scanIntervalMs)
            this.logger.info(`Hygiene scan scheduled every ${this.scanIntervalMs / 1000}s`, "HygieneDomainService.initialize");
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "HYGIENE_INIT_ERROR",
                message: "Failed to initialize hygiene domain",
                details: err,
                context: "HygieneDomainService.initialize",
            });
        }
    }
    /**
     * Cleanup — stop background scanning.
     */
    async teardown() {
        this.logger.debug("Tearing down hygiene domain", "HygieneDomainService.teardown");
        // TODO: Cancel periodic scans
    }
}
exports.HygieneDomainService = HygieneDomainService;
/**
 * Factory function — creates and returns hygiene domain service.
 */
function createHygieneDomain(workspaceProvider, logger) {
    return new HygieneDomainService(workspaceProvider, logger);
}
//# sourceMappingURL=service.js.map