/**
 * Hygiene Domain Service — workspace cleanup and maintenance.
 */
import { DomainService, HygieneCommandName, Handler, Logger, WorkspaceProvider, Result } from "../../types";
import { HygieneAnalyzer } from "./analytics-service";
/**
 * Hygiene domain commands.
 */
export declare const HYGIENE_COMMANDS: HygieneCommandName[];
export declare class HygieneDomainService implements DomainService {
    readonly name = "hygiene";
    handlers: Partial<Record<HygieneCommandName, Handler>>;
    analyzer: HygieneAnalyzer;
    private logger;
    private scanIntervalMs;
    constructor(workspaceProvider: WorkspaceProvider, logger: Logger);
    /**
     * Initialize domain — set up background scan scheduling.
     * In a real extension, this would register a timer.
     */
    initialize(): Promise<Result<void>>;
    /**
     * Cleanup — stop background scanning.
     */
    teardown(): Promise<void>;
}
/**
 * Factory function — creates and returns hygiene domain service.
 */
export declare function createHygieneDomain(workspaceProvider: WorkspaceProvider, logger: Logger): HygieneDomainService;
//# sourceMappingURL=service.d.ts.map