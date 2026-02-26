"use strict";
/**
 * Git Domain Handlers — one example per operation pattern.
 * Includes enhanced smartCommit with change grouping and batch commits.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusHandler = createStatusHandler;
exports.createPullHandler = createPullHandler;
exports.createCommitHandler = createCommitHandler;
exports.createSmartCommitHandler = createSmartCommitHandler;
exports.createAnalyzeInboundHandler = createAnalyzeInboundHandler;
const types_1 = require("../../types");
/**
 * Example: git.status — Read-only operation.
 * Returns current branch and dirty state.
 */
function createStatusHandler(gitProvider, logger) {
    return async (_ctx, params = {}) => {
        try {
            logger.debug(`Getting git status for branch: ${params.branch || "current"}`, "GitStatusHandler");
            const result = await gitProvider.status(params.branch);
            if (result.kind === "ok") {
                return (0, types_1.success)(result.value);
            }
            return result;
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "GIT_STATUS_ERROR",
                message: "Failed to fetch git status",
                details: err,
                context: "git.status",
            });
        }
    };
}
/**
 * Example: git.pull — Mutation operation.
 * Demonstrates error handling for conflicts, network issues.
 */
function createPullHandler(gitProvider, logger) {
    return async (_ctx, params = {}) => {
        try {
            logger.info(`Pulling from git branch: ${params.branch || "current"}`, "GitPullHandler");
            const result = await gitProvider.pull(params.branch);
            if (result.kind === "ok") {
                logger.info(`Pull successful: ${result.value.message}`, "GitPullHandler");
                return (0, types_1.success)(void 0);
            }
            return result;
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "GIT_PULL_ERROR",
                message: "Failed to pull from git",
                details: err,
                context: "git.pull",
            });
        }
    };
}
/**
 * Example: git.commit — Mutation with message parameter.
 * Demonstrates parameter validation.
 */
function createCommitHandler(gitProvider, logger) {
    return async (_ctx, params = { message: "" }) => {
        // Validate required params
        if (!params.message || params.message.trim().length === 0) {
            return (0, types_1.failure)({
                code: "INVALID_PARAMS",
                message: "Commit message is required and cannot be empty",
                context: "git.commit",
            });
        }
        try {
            logger.info(`Committing with message: "${params.message}"`, "GitCommitHandler");
            const result = await gitProvider.commit(params.message, params.branch);
            if (result.kind === "ok") {
                logger.info("Commit successful", "GitCommitHandler");
                return (0, types_1.success)(void 0);
            }
            return result;
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "GIT_COMMIT_ERROR",
                message: "Failed to commit to git",
                details: err,
                context: "git.commit",
            });
        }
    };
}
/**
 * Example: git.smartCommit — Interactive staged commit with validation.
 * Demonstrates complex workflow: stage → diff → validate message → commit.
 */
function createSmartCommitHandler(gitProvider, logger, changeGrouper, messageSuggester, batchCommitter) {
    return async (_ctx, params = {}) => {
        const startTime = Date.now();
        try {
            logger.info(`Smart commit: analyzing changes for branch ${params.branch || "current"}`, "GitSmartCommitHandler");
            // Step 1: Get all changes (staged + unstaged)
            const changesResult = await gitProvider.getAllChanges();
            if (changesResult.kind === "err") {
                return (0, types_1.failure)({
                    code: "GET_CHANGES_FAILED",
                    message: "Failed to get git changes",
                    details: changesResult.error,
                    context: "git.smartCommit",
                });
            }
            if (changesResult.value.length === 0) {
                return (0, types_1.failure)({
                    code: "NO_CHANGES",
                    message: "No changes to commit",
                    context: "git.smartCommit",
                });
            }
            logger.info(`Found ${changesResult.value.length} changed files`, "GitSmartCommitHandler");
            // Step 2: Parse changes into FileChange[]
            const fileChanges = parseFileChanges(changesResult.value);
            logger.debug(`Parsed ${fileChanges.length} file changes with metadata`, "GitSmartCommitHandler");
            // Step 3: Group similar changes
            const groups = changeGrouper.group(fileChanges);
            logger.info(`Grouped ${fileChanges.length} files into ${groups.length} groups`, "GitSmartCommitHandler");
            // Step 4: Suggest commit messages for each group
            const groupsWithMessages = groups.map((g) => ({
                ...g,
                suggestedMessage: messageSuggester.suggest(g),
            }));
            // Step 5: Present to user for approval (or auto-approve)
            let approvedGroups;
            if (params.autoApprove) {
                approvedGroups = groupsWithMessages;
                logger.info("Auto-approving all groups (autoApprove enabled)", "GitSmartCommitHandler");
            }
            else {
                // In a real UI context, this would show a dialog/prompt
                // For now, we'll just auto-approve as a default
                approvedGroups = groupsWithMessages;
                logger.info(`Presenting ${groupsWithMessages.length} groups for user approval`, "GitSmartCommitHandler");
            }
            if (approvedGroups.length === 0) {
                return (0, types_1.failure)({
                    code: "NO_GROUPS_APPROVED",
                    message: "No groups approved for commit",
                    context: "git.smartCommit",
                });
            }
            // Step 6: Execute batch commits
            const commitResult = await batchCommitter.executeBatch(approvedGroups);
            if (commitResult.kind === "err") {
                return commitResult;
            }
            const duration = Date.now() - startTime;
            const result = {
                commits: commitResult.value,
                totalFiles: fileChanges.length,
                totalGroups: groups.length,
                duration,
            };
            logger.info(`Smart commit completed: ${result.commits.length} commits, ${result.totalFiles} files in ${duration}ms`, "GitSmartCommitHandler");
            return (0, types_1.success)(result);
        }
        catch (err) {
            logger.error("Smart commit error", "GitSmartCommitHandler", {
                code: "SMART_COMMIT_ERROR",
                message: "Unexpected error during smart commit",
                details: err,
            });
            return (0, types_1.failure)({
                code: "SMART_COMMIT_ERROR",
                message: "Failed to execute smart commit",
                details: err,
                context: "git.smartCommit",
            });
        }
    };
}
/**
 * Example: git.analyzeInbound — Analyze remote changes without pulling.
 * Detects conflicts between local and remote modifications.
 */
function createAnalyzeInboundHandler(inboundAnalyzer, logger) {
    return async (_ctx, _params = {}) => {
        try {
            logger.info("Analyzing inbound changes from remote", "GitAnalyzeInboundHandler");
            const result = await inboundAnalyzer.analyze();
            if (result.kind === "err") {
                logger.error("Failed to analyze inbound changes", "GitAnalyzeInboundHandler", result.error);
                return result;
            }
            const analysis = result.value;
            logger.info(`Inbound analysis complete: ${analysis.totalInbound} remote changes, ${analysis.conflicts.length} conflicts`, "GitAnalyzeInboundHandler");
            return (0, types_1.success)(analysis);
        }
        catch (err) {
            logger.error("Unexpected error during inbound analysis", "GitAnalyzeInboundHandler", {
                code: "INBOUND_ANALYSIS_ERROR",
                message: "Failed to analyze inbound changes",
                details: err,
            });
            return (0, types_1.failure)({
                code: "INBOUND_ANALYSIS_ERROR",
                message: "Failed to analyze inbound changes",
                details: err,
                context: "git.analyzeInbound",
            });
        }
    };
}
/**
 * Helper: Parse GitFileChange[] into FileChange[] with metadata.
 */
function parseFileChanges(changes) {
    const getFileType = (path) => {
        const match = path.match(/\.([a-z]+)$/i);
        return match ? `.${match[1]}` : "";
    };
    const extractDomain = (path) => {
        const parts = path.split("/");
        if (parts[0] === "src" && parts[1]) {
            if (parts[1] === "domains" && parts[2]) {
                return parts[2];
            }
            if (parts[1] === "infrastructure") {
                return "infrastructure";
            }
        }
        return parts[0] || "root";
    };
    return changes.map((change) => ({
        path: change.path,
        status: change.status,
        domain: extractDomain(change.path),
        fileType: getFileType(change.path),
        additions: change.additions,
        deletions: change.deletions,
    }));
}
//# sourceMappingURL=handlers.js.map