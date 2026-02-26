/**
 * Hygiene Domain Handlers — workspace cleanup and analysis.
 */
import { Handler, WorkspaceScan, Logger } from "../../types";
/**
 * Example: hygiene.scan — Analyze workspace for dead files, large logs.
 */
export declare function createScanHandler(_workspaceProvider: any, logger: Logger): Handler<any, WorkspaceScan>;
/**
 * Example: hygiene.cleanup — Remove dead files and logs.
 * Mutation operation with confirmation.
 */
export declare function createCleanupHandler(_workspaceProvider: any, logger: Logger): Handler<any, void>;
//# sourceMappingURL=handlers.d.ts.map