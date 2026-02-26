import { describe, it, expect, vi } from "vitest";
import {
  createStatusHandler,
  createPullHandler,
  createCommitHandler,
} from "../src/domains/git/handlers";
import { MockGitProvider, MockLogger, createMockContext, assertSuccess, assertFailure } from "./fixtures";
import { success, failure, GitStatus, GitPullResult } from "../src/types";

describe("Git basic handlers (status, pull, commit)", () => {
  const ctx = createMockContext();

  describe("createStatusHandler", () => {
    it("returns git status on success", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createStatusHandler(git as any, logger);

      const result = await handler(ctx, { branch: "main" });

      const status = assertSuccess(result);
      expect(status.branch).toBe("main");
      expect(status.isDirty).toBe(false);
    });

    it("forwards GitProvider error as-is", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createStatusHandler(git as any, logger);

      const errorStatus: GitStatus = {
        branch: "main",
        isDirty: false,
        staged: 0,
        unstaged: 0,
        untracked: 0,
      };

      vi.spyOn(git, "status").mockResolvedValueOnce(
        failure({
          code: "GIT_STATUS_UNAVAILABLE",
          message: "git status failed",
          context: "MockGitProvider.status",
        })
      );

      const result = await handler(ctx, {});
      const err = assertFailure(result);

      expect(err.code).toBe("GIT_STATUS_UNAVAILABLE");
      expect(err.message).toBe("git status failed");
    });

    it("wraps thrown errors with GIT_STATUS_ERROR", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createStatusHandler(git as any, logger);

      vi.spyOn(git, "status").mockImplementationOnce(() => {
        throw new Error("boom");
      });

      const result = await handler(ctx, {});
      const err = assertFailure(result);

      expect(err.code).toBe("GIT_STATUS_ERROR");
      expect(err.context).toBe("git.status");
      expect(err.message).toContain("Failed to fetch git status");
    });

    it("rejects non-string branch parameter", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createStatusHandler(git as any, logger);

      const result = await handler(ctx, { branch: 123 as any });
      const err = assertFailure(result);

      expect(err.code).toBe("INVALID_PARAMS");
      expect(err.context).toBe("git.status");
    });
  });

  describe("createPullHandler", () => {
    it("returns success on pull", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createPullHandler(git as any, logger);

      const result = await handler(ctx, { branch: "develop" });

      assertSuccess(result);
      const infoLogs = logger.getByLevel("info");
      expect(infoLogs.some((l) => (l.message || "").includes("Pull successful"))).toBe(
        true
      );
    });

    it("forwards GitProvider pull error as-is", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createPullHandler(git as any, logger);

      const pullError = failure<GitPullResult>({
        code: "GIT_PULL_FAILED",
        message: "upstream rejected",
        context: "MockGitProvider.pull",
      });

      vi.spyOn(git, "pull").mockResolvedValueOnce(pullError);

      const result = await handler(ctx, {});
      const err = assertFailure(result);

      expect(err.code).toBe("GIT_PULL_FAILED");
      expect(err.message).toBe("upstream rejected");
    });

    it("wraps thrown errors with GIT_PULL_ERROR", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createPullHandler(git as any, logger);

      vi.spyOn(git, "pull").mockImplementationOnce(() => {
        throw new Error("network down");
      });

      const result = await handler(ctx, {});
      const err = assertFailure(result);

      expect(err.code).toBe("GIT_PULL_ERROR");
      expect(err.context).toBe("git.pull");
      expect(err.message).toContain("Failed to pull from git");
    });

    it("rejects non-string branch parameter", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createPullHandler(git as any, logger);

      const result = await handler(ctx, { branch: { name: "dev" } as any });
      const err = assertFailure(result);

      expect(err.code).toBe("INVALID_PARAMS");
      expect(err.context).toBe("git.pull");
    });
  });

  describe("createCommitHandler", () => {
    it("requires non-empty commit message", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createCommitHandler(git as any, logger);

      const resultEmpty = await handler(ctx, { message: "" });
      const errEmpty = assertFailure(resultEmpty);
      expect(errEmpty.code).toBe("INVALID_PARAMS");
      expect(errEmpty.context).toBe("git.commit");

      const resultWhitespace = await handler(ctx, { message: "   " });
      const errWhitespace = assertFailure(resultWhitespace);
      expect(errWhitespace.code).toBe("INVALID_PARAMS");
    });

    it("rejects non-string branch parameter", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createCommitHandler(git as any, logger);

      const result = await handler(ctx, { message: "feat: test", branch: 42 as any });
      const err = assertFailure(result);

      expect(err.code).toBe("INVALID_PARAMS");
      expect(err.context).toBe("git.commit");
    });

    it("commits successfully when GitProvider succeeds", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createCommitHandler(git as any, logger);

      const result = await handler(ctx, { message: "feat: add feature", branch: "main" });

      assertSuccess(result);
      const infoLogs = logger.getByLevel("info");
      expect(
        infoLogs.some((l) => (l.message || "").includes('Committing with message'))
      ).toBe(true);
    });

    it("forwards GitProvider commit error as-is", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createCommitHandler(git as any, logger);

      vi.spyOn(git, "commit").mockResolvedValueOnce(
        failure<string>({
          code: "GIT_COMMIT_HOOK_FAILED",
          message: "pre-commit hook failed",
          context: "MockGitProvider.commit",
        })
      );

      const result = await handler(ctx, { message: "feat: something" });
      const err = assertFailure(result);

      expect(err.code).toBe("GIT_COMMIT_HOOK_FAILED");
      expect(err.message).toBe("pre-commit hook failed");
    });

    it("wraps thrown errors with GIT_COMMIT_ERROR", async () => {
      const git = new MockGitProvider();
      const logger = new MockLogger();
      const handler = createCommitHandler(git as any, logger);

      vi.spyOn(git, "commit").mockImplementationOnce(() => {
        throw new Error("disk full");
      });

      const result = await handler(ctx, { message: "feat: error" });
      const err = assertFailure(result);

      expect(err.code).toBe("GIT_COMMIT_ERROR");
      expect(err.context).toBe("git.commit");
      expect(err.message).toContain("Failed to commit to git");
    });
  });
});

