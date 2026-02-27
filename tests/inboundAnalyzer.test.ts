import { describe, it, expect, vi } from "vitest";
import { InboundAnalyzer } from "../src/domains/git/service";
import { MockGitProvider, MockLogger, assertSuccess, assertFailure } from "./fixtures";
import { success, failure } from "../src/types";

describe("InboundAnalyzer.analyze", () => {
  it("returns up-to-date summary when there are no inbound changes", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "diff").mockResolvedValueOnce(success(""));

    const result = await analyzer.analyze();
    const analysis = assertSuccess(result);

    expect(analysis.totalInbound).toBe(0);
    expect(analysis.totalLocal).toBe(0);
    expect(analysis.conflicts.length).toBe(0);
    expect(analysis.summary.description).toBe("Remote branch is up-to-date");
    expect(analysis.summary.recommendations[0]).toContain("No remote changes");
  });

  it("returns inbound-only changes with no conflicts when local diff is empty", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "diff").mockResolvedValueOnce(
      success("M\tsrc/shared.ts\nA\tsrc/added.ts")
    );
    vi.spyOn(git, "getDiff").mockResolvedValueOnce(success(""));

    const result = await analyzer.analyze();
    const analysis = assertSuccess(result);

    expect(analysis.totalInbound).toBe(2);
    expect(analysis.totalLocal).toBe(0);
    expect(analysis.conflicts.length).toBe(0);
    expect(analysis.summary.recommendations).toContain(
      "✅ No conflicts detected. Safe to pull."
    );
  });

  it("detects M/M conflicts as high severity", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "diff").mockResolvedValueOnce(
      success("M\tsrc/conflict.ts")
    );
    vi.spyOn(git, "getAllChanges").mockResolvedValueOnce(
      success([{ path: "src/conflict.ts", status: "M", additions: 5, deletions: 2 }])
    );

    const result = await analyzer.analyze();
    const analysis = assertSuccess(result);

    expect(analysis.conflicts.length).toBe(1);
    const conflict = analysis.conflicts[0];
    expect(conflict.path).toBe("src/conflict.ts");
    expect(conflict.localStatus).toBe("M");
    expect(conflict.remoteStatus).toBe("M");
    expect(conflict.severity).toBe("high");
    expect(conflict.localChanges).toBeGreaterThan(0);
    expect(conflict.remoteChanges).toBeGreaterThan(0);
  });

  it("detects A/A conflicts as medium severity", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "diff").mockResolvedValueOnce(
      success("A\tsrc/feature.ts")
    );
    vi.spyOn(git, "getAllChanges").mockResolvedValueOnce(
      success([{ path: "src/feature.ts", status: "A", additions: 10, deletions: 0 }])
    );

    const result = await analyzer.analyze();
    const analysis = assertSuccess(result);

    expect(analysis.conflicts.length).toBe(1);
    const conflict = analysis.conflicts[0];
    expect(conflict.localStatus).toBe("A");
    expect(conflict.remoteStatus).toBe("A");
    expect(conflict.severity).toBe("medium");
  });

  it("gracefully handles malformed diff lines", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "diff").mockResolvedValueOnce(
      success("not-a-valid-line\nM\tsrc/valid.ts")
    );
    vi.spyOn(git, "getDiff").mockResolvedValueOnce(success(""));

    const result = await analyzer.analyze();
    const analysis = assertSuccess(result);

    expect(analysis.totalInbound).toBe(1);
    expect(analysis.conflicts.length).toBe(0);
  });

  it("propagates provider errors from fetch", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "fetch").mockResolvedValueOnce(
      failure({
        code: "GIT_FETCH_ERROR",
        message: "network down",
        context: "MockGitProvider.fetch",
      })
    );

    const result = await analyzer.analyze();
    const err = assertFailure(result);

    expect(err.code).toBe("GIT_FETCH_ERROR");
    expect(err.message).toBe("network down");
  });

  it("returns INBOUND_ANALYSIS_ERROR when current branch is invalid", async () => {
    const git = new MockGitProvider();
    const logger = new MockLogger();
    const analyzer = new InboundAnalyzer(git as any, logger);

    vi.spyOn(git, "getCurrentBranch").mockResolvedValueOnce(
      success("")
    );

    const result = await analyzer.analyze();
    const err = assertFailure(result);

    expect(err.code).toBe("INBOUND_ANALYSIS_ERROR");
    expect(err.context).toBe("InboundAnalyzer.analyze");
  });
});

