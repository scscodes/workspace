/**
 * Hygiene Domain Handlers — workspace cleanup and analysis.
 */
import { Handler, WorkspaceScan, WorkspaceProvider, Logger } from "../../types";
/**
 * hygiene.scan — Analyze workspace for dead files, large files, and stale logs.
 * Uses WorkspaceProvider.findFiles() with patterns from HYGIENE_SETTINGS.
 * Large-file detection reads file content to measure byte length (no stat API available).
 */
export declare function createScanHandler(workspaceProvider: WorkspaceProvider, logger: Logger): Handler<Record<string, never>, WorkspaceScan>;
export interface CleanupParams {
    dryRun?: boolean;
    files?: string[];
}
export interface CleanupResult {
    dryRun: boolean;
    files: string[];
    deleted: string[];
    failed: Array<{
        path: string;
        reason: string;
    }>;
}
/**
 * hygiene.cleanup — Remove specified files from the workspace.
 * Safety: requires an explicit file list; never deletes without one.
 * If dryRun=true, returns the list of files that WOULD be deleted without touching the FS.
 */
export declare function createCleanupHandler(workspaceProvider: WorkspaceProvider, logger: Logger): Handler<CleanupParams, CleanupResult>;
//# sourceMappingURL=handlers.d.ts.map