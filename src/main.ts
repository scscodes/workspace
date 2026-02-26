/**
 * VS Code Extension Entry Point
 * Activates domains, registers commands, sets up middleware.
 */

// In a real extension, import vscode:
// import * as vscode from 'vscode';

import { CommandRouter } from "./router";
import { Logger } from "./infrastructure/logger";
import { Config } from "./infrastructure/config";
import { CommandContext, GitProvider, WorkspaceProvider, Command } from "./types";
import { createGitDomain } from "./domains/git/service";
import { createHygieneDomain } from "./domains/hygiene/service";
import { createChatDomain } from "./domains/chat/service";
import { createWorkflowDomain } from "./domains/workflow/service";
import { createAgentDomain } from "./domains/agent/service";
import {
  createLoggingMiddleware,
  createAuditMiddleware,
} from "./cross-cutting/middleware";
import { StepRunner } from "./infrastructure/workflow-engine";

// ============================================================================
// Mock Providers (for demonstration; replace with vscode API wrappers)
// ============================================================================

class MockGitProvider implements GitProvider {
  async status(branch?: string) {
    return {
      kind: "ok" as const,
      value: {
        branch: branch || "main",
        isDirty: false,
        staged: 0,
        unstaged: 0,
        untracked: 0,
      },
    };
  }

  async pull(branch?: string) {
    return {
      kind: "ok" as const,
      value: {
        success: true,
        branch: branch || "main",
        message: "Already up to date",
      },
    };
  }

  async commit(_message: string, _branch?: string) {
    return { kind: "ok" as const, value: "abc123def456" };
  }

  async getChanges() {
    return {
      kind: "ok" as const,
      value: [
        { path: "src/main.ts", status: "modified" as const },
        { path: "README.md", status: "modified" as const },
      ],
    };
  }

  async getDiff(_paths?: string[]) {
    return {
      kind: "ok" as const,
      value: `diff --git a/src/main.ts b/src/main.ts
index 1234567..abcdefg 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
+// Sample diff
 // Content here`,
    };
  }

  async stage(_paths: string[]) {
    return { kind: "ok" as const, value: undefined };
  }

  async reset(_paths: string[] | { mode: string; ref: string }) {
    return { kind: "ok" as const, value: undefined };
  }

  async getAllChanges() {
    // Return realistic test data for smartCommit scenario
    return {
      kind: "ok" as const,
      value: [
        {
          path: "src/domains/git/change-grouper.ts",
          status: "A" as const,
          additions: 128,
          deletions: 0,
        },
        {
          path: "src/domains/git/message-suggester.ts",
          status: "A" as const,
          additions: 156,
          deletions: 0,
        },
        {
          path: "src/domains/git/types.ts",
          status: "A" as const,
          additions: 45,
          deletions: 0,
        },
        {
          path: "ARCHITECTURE.md",
          status: "M" as const,
          additions: 12,
          deletions: 8,
        },
        {
          path: "README.md",
          status: "M" as const,
          additions: 5,
          deletions: 0,
        },
        {
          path: "package.json",
          status: "M" as const,
          additions: 2,
          deletions: 1,
        },
        {
          path: "tsconfig.json",
          status: "M" as const,
          additions: 1,
          deletions: 0,
        },
        {
          path: "src/infrastructure/git-provider.ts",
          status: "M" as const,
          additions: 34,
          deletions: 12,
        },
      ],
    };
  }

  async fetch(_remote?: string) {
    // Mock fetch from remote
    return { kind: "ok" as const, value: undefined };
  }

  async getRemoteUrl(_remote?: string) {
    // Mock remote URL for GitHub
    return {
      kind: "ok" as const,
      value: "https://github.com/scscodes/builds.git",
    };
  }

  async getCurrentBranch() {
    // Mock current branch
    return { kind: "ok" as const, value: "main" };
  }

  async diff(revision: string, _options?: string[]) {
    // Mock diff output with name-status format
    if (revision === "HEAD..origin/main") {
      // Simulate inbound changes
      return {
        kind: "ok" as const,
        value: `M\tsrc/domains/git/service.ts
A\tsrc/domains/git/types.ts
M\tREADME.md`,
      };
    }
    // Default: unstaged changes
    return {
      kind: "ok" as const,
      value: `M\tsrc/main.ts
M\tsrc/router.ts`,
    };
  }
}

class MockWorkspaceProvider implements WorkspaceProvider {
  async findFiles(_pattern: string) {
    return { kind: "ok" as const, value: [] };
  }

  async readFile(_path: string) {
    return { kind: "ok" as const, value: "" };
  }

  async deleteFile(_path: string) {
    return { kind: "ok" as const, value: undefined };
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
export async function activate(_extensionPath: string): Promise<void> {

  // Initialize infrastructure layer
  const logger = new Logger();
  const config = new Config();
  await config.initialize();

  // Initialize providers
  const gitProvider = new MockGitProvider();
  const workspaceProvider = new MockWorkspaceProvider();

  // Create router
  const router = new CommandRouter(logger);

  // Register middleware
  router.use(createLoggingMiddleware(logger));
  router.use(createAuditMiddleware(logger));

  // Create step runner for workflow engine (allows workflows to dispatch commands)
  const stepRunner: StepRunner = async (command: Command, ctx: CommandContext) => {
    const result = await router.dispatch(command, ctx);
    if (result.kind === "ok") {
      return { kind: "ok" as const, value: (result.value as Record<string, unknown>) || {} };
    }
    return result as any;
  };

  // Register domains
  const gitDomain = createGitDomain(gitProvider, logger);
  const hygieneDomain = createHygieneDomain(workspaceProvider, logger);
  const chatDomain = createChatDomain(gitProvider, logger);
  const workflowDomain = createWorkflowDomain(logger, stepRunner);
  const agentDomain = createAgentDomain(logger);

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

  logger.info(
    `Extension activated with ${router.listDomains().length} domains`,
    "activate"
  );
  logger.info(
    `Registered ${router.listCommands().length} commands`,
    "activate"
  );

  // Store router in global state for command handlers
  // (In real code, attach to context.subscriptions)
  (globalThis as any).__vscodeRouter = router;
}

/**
 * Deactivate the extension.
 * Called when extension is unloaded.
 * In real code: export function deactivate()
 */
export async function deactivate(): Promise<void> {
  const router = (globalThis as any).__vscodeRouter as CommandRouter | undefined;
  if (router) {
    await router.teardown();
  }
}

// ============================================================================
// Exports for Testing / Integration
// ============================================================================

export { CommandRouter };
export { Logger } from "./infrastructure/logger";
export { Config } from "./infrastructure/config";
