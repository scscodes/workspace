import { describe, it, expect, vi } from "vitest";
import {
  createSmartCommitHandler,
} from "../src/domains/git/handlers";
import {
  MockGitProvider,
  MockLogger,
  createMockContext,
  assertSuccess,
  assertFailure,
  createTestChanges,
} from "./fixtures";
import {
  ChangeGrouper,
  CommitMessageSuggester,
  BatchCommitter,
} from "../src/domains/git/service";
import { SmartCommitParams } from "../src/domains/git/types";

describe("git.smartCommit handler", () => {
  const ctx = createMockContext();

  it("rejects invalid parameter shapes", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const handler = createSmartCommitHandler(
      git as any,
      logger,
      new ChangeGrouper(),
      new CommitMessageSuggester(),
      new BatchCommitter(git as any, logger),
    );

    const resultAutoApprove = await handler(ctx, {
      autoApprove: "yes" as any,
    } as SmartCommitParams);
    const errAutoApprove = assertFailure(resultAutoApprove);
    expect(errAutoApprove.code).toBe("INVALID_PARAMS");
    expect(errAutoApprove.context).toBe("git.smartCommit");

    const resultBranch = await handler(ctx, {
      autoApprove: true,
      branch: { name: "main" } as any,
    } as SmartCommitParams);
    const errBranch = assertFailure(resultBranch);
    expect(errBranch.code).toBe("INVALID_PARAMS");
  });

  it("fails with NO_CHANGES when there are no file changes", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const handler = createSmartCommitHandler(
      git as any,
      logger,
      new ChangeGrouper(),
      new CommitMessageSuggester(),
      new BatchCommitter(git as any, logger),
    );

    // Default MockGitProvider has no changes
    const result = await handler(ctx, { autoApprove: true });
    const err = assertFailure(result);

    expect(err.code).toBe("NO_CHANGES");
    expect(err.context).toBe("git.smartCommit");
  });

  it("bubbles GitProvider getAllChanges error as GET_CHANGES_FAILED", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const handler = createSmartCommitHandler(
      git as any,
      logger,
      new ChangeGrouper(),
      new CommitMessageSuggester(),
      new BatchCommitter(git as any, logger),
    );

    vi.spyOn(git, "getAllChanges").mockResolvedValueOnce({
      kind: "err",
      error: {
        code: "GIT_STATUS_ERROR",
        message: "unable to read changes",
        context: "MockGitProvider.getAllChanges",
      },
    });

    const result = await handler(ctx, {});
    const err = assertFailure(result);

    expect(err.code).toBe("GET_CHANGES_FAILED");
    expect(err.context).toBe("git.smartCommit");
  });

  it("executes grouping, suggestion and batch commit on happy path", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();

    // Provide a small realistic change set
    const fileChanges = createTestChanges(3, "api", "M");
    git.setAllChanges(
      fileChanges.map((c) => ({
        path: c.path,
        status: c.status,
        additions: c.additions,
        deletions: c.deletions,
      })) as any
    );

    const grouper = new ChangeGrouper();
    const suggester = new CommitMessageSuggester();
    const committer = new BatchCommitter(git as any, logger);

    const handler = createSmartCommitHandler(
      git as any,
      logger,
      grouper,
      suggester,
      committer,
    );

    const result = await handler(ctx, { autoApprove: true });
    const batchResult = assertSuccess(result);

    expect(batchResult.totalFiles).toBe(3);
    expect(batchResult.totalGroups).toBeGreaterThanOrEqual(1);
    expect(batchResult.commits.length).toBeGreaterThanOrEqual(1);
    expect(typeof batchResult.duration).toBe("number");
  });

  it("forwards BatchCommitter errors unchanged", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();

    const grouper = {
      group: vi.fn().mockReturnValue([
        {
          id: "g1",
          files: [
            {
              path: "src/file.ts",
              status: "M",
              domain: "core",
              fileType: ".ts",
              additions: 10,
              deletions: 0,
            },
          ],
          suggestedMessage: {
            type: "fix",
            scope: "core",
            description: "desc",
            full: "fix(core): desc",
          },
          similarity: 1,
        },
      ]),
    } as unknown as ChangeGrouper;

    const suggester = {
      suggest: vi.fn().mockImplementation((group) => group.suggestedMessage),
    } as unknown as CommitMessageSuggester;

    const committer = {
      executeBatch: vi.fn().mockResolvedValue({
        kind: "err",
        error: {
          code: "BATCH_COMMIT_ERROR",
          message: "rollback failed",
          context: "BatchCommitter.executeBatch",
        },
      }),
    } as unknown as BatchCommitter;

    // Provide at least one change so handler goes past NO_CHANGES
    git.setAllChanges([
      {
        path: "src/file.ts",
        status: "M",
        additions: 1,
        deletions: 0,
      } as any,
    ]);

    const handler = createSmartCommitHandler(
      git as any,
      logger,
      grouper,
      suggester,
      committer,
    );

    const result = await handler(ctx, { autoApprove: true });
    const err = assertFailure(result);

    expect(err.code).toBe("BATCH_COMMIT_ERROR");
    expect(err.context).toBe("BatchCommitter.executeBatch");
  });
});

