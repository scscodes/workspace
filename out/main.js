"use strict";
/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.Logger = exports.CommandRouter = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
// In a real extension, import vscode:
// import * as vscode from 'vscode';
const router_1 = require("./router");
Object.defineProperty(exports, "CommandRouter", { enumerable: true, get: function () { return router_1.CommandRouter; } });
const logger_1 = require("./infrastructure/logger");
const config_1 = require("./infrastructure/config");
const service_1 = require("./domains/git/service");
const service_2 = require("./domains/hygiene/service");
const service_3 = require("./domains/chat/service");
const service_4 = require("./domains/workflow/service");
const service_5 = require("./domains/agent/service");
const middleware_1 = require("./cross-cutting/middleware");
// ============================================================================
// Mock Providers (for demonstration; replace with vscode API wrappers)
// ============================================================================
class MockGitProvider {
    async status(branch) {
        return {
            kind: "ok",
            value: {
                branch: branch || "main",
                isDirty: false,
                staged: 0,
                unstaged: 0,
                untracked: 0,
            },
        };
    }
    async pull(branch) {
        return {
            kind: "ok",
            value: {
                success: true,
                branch: branch || "main",
                message: "Already up to date",
            },
        };
    }
    async commit(_message, _branch) {
        return { kind: "ok", value: "abc123def456" };
    }
    async getChanges() {
        return {
            kind: "ok",
            value: [
                { path: "src/main.ts", status: "modified" },
                { path: "README.md", status: "modified" },
            ],
        };
    }
    async getDiff(_paths) {
        return {
            kind: "ok",
            value: `diff --git a/src/main.ts b/src/main.ts
index 1234567..abcdefg 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
+// Sample diff
 // Content here`,
        };
    }
    async stage(_paths) {
        return { kind: "ok", value: undefined };
    }
    async reset(_paths) {
        return { kind: "ok", value: undefined };
    }
    async getAllChanges() {
        // Return realistic test data for smartCommit scenario
        return {
            kind: "ok",
            value: [
                {
                    path: "src/domains/git/change-grouper.ts",
                    status: "A",
                    additions: 128,
                    deletions: 0,
                },
                {
                    path: "src/domains/git/message-suggester.ts",
                    status: "A",
                    additions: 156,
                    deletions: 0,
                },
                {
                    path: "src/domains/git/types.ts",
                    status: "A",
                    additions: 45,
                    deletions: 0,
                },
                {
                    path: "ARCHITECTURE.md",
                    status: "M",
                    additions: 12,
                    deletions: 8,
                },
                {
                    path: "README.md",
                    status: "M",
                    additions: 5,
                    deletions: 0,
                },
                {
                    path: "package.json",
                    status: "M",
                    additions: 2,
                    deletions: 1,
                },
                {
                    path: "tsconfig.json",
                    status: "M",
                    additions: 1,
                    deletions: 0,
                },
                {
                    path: "src/infrastructure/git-provider.ts",
                    status: "M",
                    additions: 34,
                    deletions: 12,
                },
            ],
        };
    }
    async fetch(_remote) {
        // Mock fetch from remote
        return { kind: "ok", value: undefined };
    }
    async getRemoteUrl(_remote) {
        // Mock remote URL for GitHub
        return {
            kind: "ok",
            value: "https://github.com/scscodes/builds.git",
        };
    }
    async getCurrentBranch() {
        // Mock current branch
        return { kind: "ok", value: "main" };
    }
    async diff(revision, _options) {
        // Mock diff output with name-status format
        if (revision === "HEAD..origin/main") {
            // Simulate inbound changes
            return {
                kind: "ok",
                value: `M\tsrc/domains/git/service.ts
A\tsrc/domains/git/types.ts
M\tREADME.md`,
            };
        }
        // Default: unstaged changes
        return {
            kind: "ok",
            value: `M\tsrc/main.ts
M\tsrc/router.ts`,
        };
    }
}
class MockWorkspaceProvider {
    async findFiles(_pattern) {
        return { kind: "ok", value: [] };
    }
    async readFile(_path) {
        return { kind: "ok", value: "" };
    }
    async deleteFile(_path) {
        return { kind: "ok", value: undefined };
    }
}
// ============================================================================
// Extension Activation
// ============================================================================
/**
 * Activate the extension.
 * Called by VS Code when activation event is triggered.
 * In real code: export async function activate(context: vscode.ExtensionContext)
 */
async function activate(_extensionPath) {
    // Initialize infrastructure layer
    const logger = new logger_1.Logger();
    const config = new config_1.Config();
    await config.initialize();
    // Initialize providers
    const gitProvider = new MockGitProvider();
    const workspaceProvider = new MockWorkspaceProvider();
    // Create router
    const router = new router_1.CommandRouter(logger);
    // Register middleware
    router.use((0, middleware_1.createLoggingMiddleware)(logger));
    router.use((0, middleware_1.createAuditMiddleware)(logger));
    // Create step runner for workflow engine (allows workflows to dispatch commands)
    const stepRunner = async (command, ctx) => {
        const result = await router.dispatch(command, ctx);
        if (result.kind === "ok") {
            return { kind: "ok", value: result.value || {} };
        }
        return result;
    };
    // Register domains
    const gitDomain = (0, service_1.createGitDomain)(gitProvider, logger);
    const hygieneDomain = (0, service_2.createHygieneDomain)(workspaceProvider, logger);
    const chatDomain = (0, service_3.createChatDomain)(gitProvider, logger);
    const workflowDomain = (0, service_4.createWorkflowDomain)(logger, stepRunner);
    const agentDomain = (0, service_5.createAgentDomain)(logger);
    router.registerDomain(gitDomain);
    router.registerDomain(hygieneDomain);
    router.registerDomain(chatDomain);
    router.registerDomain(workflowDomain);
    router.registerDomain(agentDomain);
    // Validate all domains
    const validationResult = await router.validateDomains();
    if (validationResult.kind === "err") {
        logger.error("Domain validation failed", "activate", validationResult.error);
        throw new Error(validationResult.error.message);
    }
    // In real extension, register VS Code commands:
    // context.subscriptions.push(
    //   vscode.commands.registerCommand('git.status', async () => {
    //     const result = await router.dispatch(
    //       { name: 'git.status', params: {} },
    //       getCommandContext()
    //     );
    //   })
    // );
    logger.info(`Extension activated with ${router.listDomains().length} domains`, "activate");
    logger.info(`Registered ${router.listCommands().length} commands`, "activate");
    // Store router in global state for command handlers
    // (In real code, attach to context.subscriptions)
    globalThis.__vscodeRouter = router;
}
/**
 * Deactivate the extension.
 * Called when extension is unloaded.
 * In real code: export function deactivate()
 */
async function deactivate() {
    const router = globalThis.__vscodeRouter;
    if (router) {
        await router.teardown();
    }
}
var logger_2 = require("./infrastructure/logger");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return logger_2.Logger; } });
var config_2 = require("./infrastructure/config");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_2.Config; } });
//# sourceMappingURL=main.js.map