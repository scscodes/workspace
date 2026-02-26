import { describe, it, expect, vi } from "vitest";
import { GitDomainService, GIT_COMMANDS } from "../src/domains/git/service";
import {
  MockGitProvider,
  MockLogger,
} from "./fixtures";
import { failure, success } from "../src/types";

describe("GitDomainService", () => {
  it("registers all expected git command handlers", () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();

    const domain = new GitDomainService(git as any, logger);

    const registeredCommands = Object.keys(domain.handlers);
    for (const cmd of GIT_COMMANDS) {
      expect(registeredCommands).toContain(cmd);
      expect(typeof domain.handlers[cmd]).toBe("function");
    }

    // Analytics commands are also expected
    expect(registeredCommands).toContain("git.showAnalytics");
    expect(registeredCommands).toContain("git.exportJson");
    expect(registeredCommands).toContain("git.exportCsv");
  });

  it("initialize() calls gitProvider.status and returns ok on success", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const domain = new GitDomainService(git as any, logger);

    const statusSpy = vi.spyOn(git, "status");

    const result = await domain.initialize!();
    const value = success(undefined);

    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("ok");
  });

  it("initialize() returns GIT_UNAVAILABLE when status fails", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const domain = new GitDomainService(git as any, logger);

    vi.spyOn(git, "status").mockResolvedValueOnce(
      failure({
        code: "GIT_STATUS_ERROR",
        message: "git not found",
        context: "MockGitProvider.status",
      })
    );

    const result = await domain.initialize!();
    expect(result.kind).toBe("err");
    if (result.kind === "err") {
      expect(result.error.code).toBe("GIT_UNAVAILABLE");
      expect(result.error.context).toBe("GitDomainService.initialize");
    }
  });

  it("teardown() completes without throwing", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const domain = new GitDomainService(git as any, logger);

    await expect(domain.teardown!()).resolves.toBeUndefined();
  });
});

