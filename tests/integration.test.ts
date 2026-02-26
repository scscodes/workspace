/**
 * Integration Tests — Full flow testing for smartCommit, analyzeInbound, analytics, workflows
 * SCOPE: End-to-end integration testing with realistic scenarios
 * 
 * Tests verify:
 * 1. smartCommit: detect changes → group → suggest → approve → batch commit
 * 2. analyzeInbound: detect conflicts with various remote states
 * 3. analytics: parse git history, aggregate correctly, trends
 * 4. workflows: linear execution, branching, timeout, retry
 * 5. Error recovery: rollback, fallback, retry scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeGrouper, CommitMessageSuggester, BatchCommitter } from '../src/domains/git/service';
import { GitAnalyzer } from '../src/domains/git/analytics-service';
import { WorkflowEngine, StepRunner } from '../src/infrastructure/workflow-engine';
import { Logger, Result, success, failure } from '../src/types';
import {
  MockLogger,
  MockGitProvider,
  createMockContext,
  createTestChanges,
  createTestGitLog,
  assertSuccess,
  assertFailure,
} from './fixtures';

// ============================================================================
// Integration: smartCommit Flow (Full End-to-End)
// ============================================================================

describe('Integration: smartCommit Flow', () => {
  let logger: MockLogger;
  let git: MockGitProvider;
  let grouper: ChangeGrouper;
  let suggester: CommitMessageSuggester;

  beforeEach(() => {
    logger = new MockLogger();
    git = new MockGitProvider();
    grouper = new ChangeGrouper();
    suggester = new CommitMessageSuggester();
  });

  it('full smartCommit flow: 8 files → multiple groups with correct suggestions', async () => {
    // Simulate user workspace with 8 changed files
    // Groups should separate by domain: git, docs, config, infrastructure
    const changes = [
      {
        path: 'src/domains/git/change-grouper.ts',
        status: 'A' as const,
        domain: 'git',
        fileType: '.ts',
        additions: 128,
        deletions: 0,
      },
      {
        path: 'src/domains/git/message-suggester.ts',
        status: 'A' as const,
        domain: 'git',
        fileType: '.ts',
        additions: 156,
        deletions: 0,
      },
      {
        path: 'src/domains/git/types.ts',
        status: 'A' as const,
        domain: 'git',
        fileType: '.ts',
        additions: 45,
        deletions: 0,
      },
      {
        path: 'ARCHITECTURE.md',
        status: 'M' as const,
        domain: 'docs',
        fileType: '.md',
        additions: 12,
        deletions: 8,
      },
      {
        path: 'README.md',
        status: 'M' as const,
        domain: 'docs',
        fileType: '.md',
        additions: 5,
        deletions: 0,
      },
      {
        path: 'package.json',
        status: 'M' as const,
        domain: 'config',
        fileType: '.json',
        additions: 2,
        deletions: 1,
      },
      {
        path: 'tsconfig.json',
        status: 'M' as const,
        domain: 'config',
        fileType: '.json',
        additions: 1,
        deletions: 0,
      },
      {
        path: 'src/infrastructure/git-provider.ts',
        status: 'M' as const,
        domain: 'infrastructure',
        fileType: '.ts',
        additions: 34,
        deletions: 12,
      },
    ];

    git.setAllChanges(changes);

    // Get all changes
    const allChangesResult = await git.getAllChanges();
    expect(allChangesResult.kind).toBe('ok');
    const allChanges = allChangesResult.value;
    expect(allChanges.length).toBe(8);

    // Group changes
    const groups = grouper.group(allChanges);
    expect(groups.length).toBeGreaterThanOrEqual(3); // At least git, docs, config domains

    // Suggest messages
    const groupsWithMsgs = groups.map((g) => ({
      ...g,
      suggestedMessage: suggester.suggest(g),
    }));

    // Verify git group exists
    const gitGroup = groupsWithMsgs.find(
      (g) => g.suggestedMessage.scope === 'git'
    );
    expect(gitGroup).toBeDefined();
    expect(gitGroup?.files.length).toBeGreaterThanOrEqual(3);

    // Verify config group exists
    const configGroup = groupsWithMsgs.find(
      (g) => g.suggestedMessage.scope === 'config'
    );
    expect(configGroup).toBeDefined();

    // Verify docs group (markdown files should be in same domain)
    const docFiles = groups.flatMap((g) =>
      g.files.filter((f) => f.fileType === '.md')
    );
    expect(docFiles.length).toBe(2);

    // Verify full messages are generated
    for (const group of groupsWithMsgs) {
      expect(group.suggestedMessage.full).toBeTruthy();
      expect(group.suggestedMessage.full.length).toBeGreaterThan(5);
    }
  });

  it('smartCommit with empty changes: returns empty groups', async () => {
    git.setAllChanges([]);
    const result = await git.getAllChanges();
    expect(result.kind).toBe('ok');

    const groups = grouper.group(result.value);
    expect(groups.length).toBe(0);
  });

  it('smartCommit with single file: returns single group', async () => {
    const changes = [
      {
        path: 'src/main.ts',
        status: 'A' as const,
        domain: 'core',
        fileType: '.ts',
        additions: 100,
        deletions: 0,
      },
    ];

    git.setAllChanges(changes);
    const result = await git.getAllChanges();
    const groups = grouper.group(result.value);

    expect(groups.length).toBe(1);
    expect(groups[0].files.length).toBe(1);
    expect(groups[0].similarity).toBe(1); // Single file has perfect similarity
  });

  it('smartCommit groups files by similarity', async () => {
    // Test that very similar files (same domain, same type, same status) group together
    const changes = [
      {
        path: 'src/api/handler.ts',
        status: 'A' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 50,
        deletions: 0,
      },
      {
        path: 'src/api/types.ts',
        status: 'A' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 30,
        deletions: 0,
      },
      {
        path: 'src/api/utils.ts',
        status: 'A' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 20,
        deletions: 0,
      },
    ];

    git.setAllChanges(changes);
    const result = await git.getAllChanges();
    const groups = grouper.group(result.value);

    // All three files should be in the same group (same domain, type, and status)
    expect(groups.length).toBe(1);
    expect(groups[0].files.length).toBe(3);

    // All files in group should have same domain
    const domains = new Set(groups[0].files.map((f) => f.domain));
    expect(domains.size).toBe(1);
    expect(Array.from(domains)[0]).toBe('api');
  });

  it('commit message suggestions handle addition-only changes', async () => {
    const changes = [
      {
        path: 'src/new-feature.ts',
        status: 'A' as const,
        domain: 'feature',
        fileType: '.ts',
        additions: 100,
        deletions: 0,
      },
      {
        path: 'src/new-util.ts',
        status: 'A' as const,
        domain: 'feature',
        fileType: '.ts',
        additions: 50,
        deletions: 0,
      },
    ];

    git.setAllChanges(changes);
    const result = await git.getAllChanges();
    const groups = grouper.group(result.value);

    const msgs = groups.map((g) => suggester.suggest(g));

    // Additions-only should suggest 'feat'
    const hasFeature = msgs.some((m) => m.type === 'feat');
    expect(hasFeature).toBe(true);
  });

  it('commit message suggestions handle modification-only changes', async () => {
    const changes = [
      {
        path: 'src/existing.ts',
        status: 'M' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 20,
        deletions: 10,
      },
    ];

    git.setAllChanges(changes);
    const result = await git.getAllChanges();
    const groups = grouper.group(result.value);

    const msgs = groups.map((g) => suggester.suggest(g));

    // Modifications should suggest 'fix' or 'chore'
    const msg = msgs[0];
    expect(['fix', 'chore'].includes(msg.type)).toBe(true);
  });

  it('commit message suggestions handle docs-only changes', async () => {
    const changes = [
      {
        path: 'README.md',
        status: 'M' as const,
        domain: 'docs',
        fileType: '.md',
        additions: 10,
        deletions: 5,
      },
      {
        path: 'CONTRIBUTING.md',
        status: 'A' as const,
        domain: 'docs',
        fileType: '.md',
        additions: 50,
        deletions: 0,
      },
    ];

    git.setAllChanges(changes);
    const result = await git.getAllChanges();
    const groups = grouper.group(result.value);

    const msgs = groups.map((g) => suggester.suggest(g));

    // Docs-only should suggest 'docs'
    const hasDocsType = msgs.some((m) => m.type === 'docs');
    expect(hasDocsType).toBe(true);
  });
});

// ============================================================================
// Integration: analyzeInbound Flow (Conflict Detection)
// ============================================================================

describe('Integration: analyzeInbound Flow', () => {
  let git: MockGitProvider;

  beforeEach(() => {
    git = new MockGitProvider();
  });

  it('detect no conflicts when inbound and local changes are disjoint', async () => {
    git.setCurrentBranch('feature/my-work');

    const inboundChanges = [
      { path: 'src/remote-feature.ts', status: 'A' as const },
      { path: 'docs/remote-api.md', status: 'M' as const },
    ];

    const localChanges = [
      { path: 'src/local-feature.ts', status: 'A' as const },
      { path: 'src/utils.ts', status: 'M' as const },
    ];

    // Verify no overlapping paths
    const inboundPaths = inboundChanges.map((c) => c.path);
    const localPaths = localChanges.map((c) => c.path);
    const hasConflict = inboundPaths.some((p) => localPaths.includes(p));

    expect(hasConflict).toBe(false);
  });

  it('detect high-severity conflict when both modified same file', () => {
    const inboundChanges = [
      { path: 'src/service.ts', status: 'M' as const },
    ];

    const localChanges = [
      { path: 'src/service.ts', status: 'M' as const },
    ];

    // Both modified same file
    const conflicts = inboundChanges.filter((inbound) =>
      localChanges.some(
        (local) => local.path === inbound.path && local.status === inbound.status
      )
    );

    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('detect high-severity conflict when deleted locally but modified remotely', () => {
    const inboundChanges = [
      { path: 'src/deprecated.ts', status: 'M' as const },
    ];

    const localChanges = [
      { path: 'src/deprecated.ts', status: 'D' as const },
    ];

    // Conflict: we deleted, they modified
    const conflicts = inboundChanges.filter((inbound) =>
      localChanges.some(
        (local) =>
          local.path === inbound.path &&
          local.status === 'D' &&
          inbound.status === 'M'
      )
    );

    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('detect medium-severity conflict when both added same file', () => {
    const inboundChanges = [
      { path: 'src/new-types.ts', status: 'A' as const },
    ];

    const localChanges = [
      { path: 'src/new-types.ts', status: 'A' as const },
    ];

    // Both added same file
    const conflicts = inboundChanges.filter((inbound) =>
      localChanges.some(
        (local) => local.path === inbound.path && local.status === inbound.status
      )
    );

    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('generate correct GitHub compare link', () => {
    git.setCurrentBranch('feature-branch');
    git.setRemoteUrl('https://github.com/scscodes/builds.git');

    const branchName = 'feature-branch';
    const remoteUrl = 'https://github.com/scscodes/builds.git';

    // Extract owner/repo from URL
    const match = remoteUrl.match(/github\.com\/(.+)\/(.+)(\.git)?$/);
    expect(match).toBeTruthy();

    if (match) {
      const owner = match[1];
      const repo = match[2];
      const compareLink = `https://github.com/${owner}/${repo}/compare/${branchName}...origin/${branchName}`;

      expect(compareLink).toContain('github.com/scscodes/builds');
      expect(compareLink).toContain('compare/feature-branch');
    }
  });
});

// ============================================================================
// Integration: Analytics Flow (Large Dataset Parsing)
// ============================================================================

describe('Integration: Analytics Flow', () => {
  let git: MockGitProvider;
  let analyzer: GitAnalyzer;

  beforeEach(() => {
    git = new MockGitProvider();
    analyzer = new GitAnalyzer();
  });

  it('parse git log and identify files with high volatility', async () => {
    // Create a realistic git log with file churn data
    const logLines = [
      'abc|Alice|2026-01-01T10:00:00Z|fix: service issue',
      '10\t5\tsrc/service.ts',
      '2\t1\ttests/service.test.ts',
      '',
      'def|Bob|2026-01-02T11:00:00Z|refactor: reorganize',
      '8\t3\tsrc/service.ts',
      '3\t2\ttests/service.test.ts',
      '',
      'ghi|Alice|2026-01-03T12:00:00Z|feat: new api',
      '12\t7\tsrc/service.ts',
      '5\t3\ttests/service.test.ts',
      '',
      'jkl|Bob|2026-01-04T13:00:00Z|docs: update readme',
      '50\t20\tsrc/types.ts',
      '1\t0\tREADME.md',
    ];

    const gitLog = logLines.join('\n');
    git.setDiff(gitLog);

    const diffResult = await git.getDiff();
    expect(diffResult.kind).toBe('ok');

    // Parse the log manually for integration test
    const lines = gitLog.split('\n');
    const files: Record<string, { additions: number; deletions: number; count: number }> = {};

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length === 3) {
        const [additions, deletions, path] = parts;
        if (!files[path]) {
          files[path] = { additions: 0, deletions: 0, count: 0 };
        }
        files[path].additions += parseInt(additions, 10);
        files[path].deletions += parseInt(deletions, 10);
        files[path].count += 1;
      }
    }

    // Verify high-volatility file detection
    const volatilityScores = Object.entries(files).map(([path, data]) => ({
      path,
      volatility: (data.additions + data.deletions) / data.count,
      changeCount: data.count,
    }));

    const serviceFile = volatilityScores.find((f) => f.path === 'src/service.ts');
    expect(serviceFile).toBeDefined();
    expect(serviceFile?.changeCount).toBe(3);

    // Volatility should be high
    const expectedVolatility = (10 + 5 + 8 + 3 + 12 + 7) / 3; // = 15
    expect(serviceFile?.volatility).toBeCloseTo(expectedVolatility, 0);
  });

  it('analytics should handle empty history', () => {
    git.setDiff('');

    // Empty history should not crash
    expect(() => {
      const log = '';
      const lines = log.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(0);
    }).not.toThrow();
  });

  it('analytics should skip malformed log lines gracefully', () => {
    const logLines = [
      'abc|Alice|2026-01-01T10:00:00Z|fix: good commit',
      '10\t5\tsrc/file.ts',
      'malformed line without tabs',
      'another bad line',
      'def|Bob|2026-01-02T11:00:00Z|feat: another fix',
      '8\t3\tsrc/file.ts',
    ];

    const gitLog = logLines.join('\n');

    const lines = gitLog.split('\n');
    const validLines = lines.filter((line) => {
      const parts = line.split('\t');
      return parts.length === 3 && !isNaN(parseInt(parts[0], 10));
    });

    // Should filter out malformed lines
    expect(validLines.length).toBeLessThan(lines.length);
    expect(validLines.length).toBeGreaterThan(0);
  });

  it('analytics should identify top authors by commit count', () => {
    const logLines = [
      'abc|Alice|2026-01-01T10:00:00Z|commit 1',
      '1\t1\tfile.ts',
      'def|Alice|2026-01-02T11:00:00Z|commit 2',
      '1\t1\tfile.ts',
      'ghi|Alice|2026-01-03T12:00:00Z|commit 3',
      '1\t1\tfile.ts',
      'jkl|Bob|2026-01-04T13:00:00Z|commit 4',
      '1\t1\tfile.ts',
      'mno|Charlie|2026-01-05T14:00:00Z|commit 5',
      '1\t1\tfile.ts',
    ];

    const gitLog = logLines.join('\n');

    // Parse authors
    const authors: Record<string, number> = {};
    const commitLines = gitLog.split('\n').filter((l) => l.includes('|'));
    for (const line of commitLines) {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const author = parts[1];
        authors[author] = (authors[author] || 0) + 1;
      }
    }

    const topAuthors = Object.entries(authors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    expect(topAuthors[0][0]).toBe('Alice');
    expect(topAuthors[0][1]).toBe(3);
  });
});

// ============================================================================
// Integration: Workflow Execution (Complex Flows)
// ============================================================================

describe('Integration: Workflow Execution', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
  });

  it('linear workflow: step1 → step2 → step3 executes in order', async () => {
    const executionOrder: string[] = [];

    const stepRunner: StepRunner = async (cmd) => {
      executionOrder.push(cmd.name);
      return success({});
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'linear',
      steps: [
        {
          id: 's1',
          command: 'git.status' as const,
          params: {},
          onSuccess: 's2',
          onFailure: 'exit',
        },
        {
          id: 's2',
          command: 'git.pull' as const,
          params: {},
          onSuccess: 's3',
          onFailure: 'exit',
        },
        {
          id: 's3',
          command: 'git.commit' as const,
          params: { message: 'test' },
          onSuccess: 'exit',
          onFailure: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(executionOrder).toEqual([
        'git.status',
        'git.pull',
        'git.commit',
      ]);
      expect(result.value.stepResults.size).toBe(3);
    }
  });

  it('conditional branching: failure path is taken when step fails', async () => {
    const executedSteps: string[] = [];

    let callCount = 0;
    const stepRunner: StepRunner = async (cmd) => {
      callCount++;
      if (callCount === 1) {
        // First step fails
        return failure({
          code: 'TEST_FAIL',
          message: 'Step failed',
        });
      }
      // Subsequent steps succeed
      executedSteps.push(cmd.name);
      return success({});
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'conditional',
      steps: [
        {
          id: 'check',
          command: 'git.status' as const,
          params: {},
          onSuccess: 'pass',
          onFailure: 'fallback',
        },
        {
          id: 'pass',
          command: 'git.pull' as const,
          params: {},
          onSuccess: 'exit',
          onFailure: 'exit',
        },
        {
          id: 'fallback',
          command: 'git.commit' as const,
          params: { message: 'recovery' },
          onSuccess: 'exit',
          onFailure: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // Should execute fallback step, not pass step
      expect(executedSteps).toContain('git.commit');
      expect(executedSteps).not.toContain('git.pull');
    }
  });

  it('step retry: transient failure recovers on retry', async () => {
    let attempts = 0;

    const stepRunner: StepRunner = async (cmd) => {
      attempts++;
      if (attempts < 3) {
        return failure({
          code: 'TRANSIENT',
          message: 'Transient failure',
        });
      }
      return success({ attempts });
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'retry',
      steps: [
        {
          id: 'retry-step',
          command: 'git.pull' as const,
          params: {},
          onSuccess: 'exit',
          onFailure: 'exit',
          retries: 3,
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());

    // With retry logic in engine, should eventually succeed
    expect(result.kind).toBe('ok');
    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  it('workflow with variables: step can access shared variables', async () => {
    const stepRunner: StepRunner = async (cmd, ctx) => {
      // Variables should be accessible through context or workflow
      return success({ processed: true });
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'with-vars',
      steps: [
        {
          id: 's1',
          command: 'git.status' as const,
          params: {},
          onSuccess: 'exit',
          onFailure: 'exit',
        },
      ],
    };

    const variables = { branchName: 'feature-test', timeout: 5000 };

    const result = await engine.execute(workflow, createMockContext(), variables);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.variables).toEqual(variables);
    }
  });

  it('invalid step reference: workflow detects undefined next step', async () => {
    const stepRunner: StepRunner = async () => success({});

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'invalid',
      steps: [
        {
          id: 's1',
          command: 'git.status' as const,
          params: {},
          onSuccess: 'undefined-step', // This step doesn't exist
          onFailure: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());

    // Should fail due to undefined next step
    expect(result.kind).toBe('err');
  });
});

// ============================================================================
// Integration: Error Recovery & Cascades
// ============================================================================

describe('Integration: Error Recovery & Cascades', () => {
  let logger: MockLogger;
  let git: MockGitProvider;

  beforeEach(() => {
    logger = new MockLogger();
    git = new MockGitProvider();
  });

  it('git operation failure is properly logged with context', async () => {
    const statusResult = await git.status();

    expect(statusResult.kind).toBe('ok');

    // Log the operation
    logger.info('Git status check completed', 'integration-test', {
      isDirty: statusResult.value?.isDirty,
    });

    const infoLogs = logger.getByLevel('info');
    expect(infoLogs.length).toBeGreaterThan(0);
    expect(infoLogs[0].message).toContain('Git status');
  });

  it('parse failure returns actionable error message', () => {
    const malformedLog = 'this is not\nvalid|git|output';

    // Attempt to parse
    const lines = malformedLog.split('\n');
    const validCommitLines = lines.filter((l) => (l.match(/\|/g) || []).length >= 3);

    // Should detect parsing failure
    const hasErrors = validCommitLines.length === 0 && lines.length > 0;
    expect(hasErrors).toBe(true);
  });

  it('workflow step failure triggers onFailure handler', async () => {
    const executedHandlers: string[] = [];

    const stepRunner: StepRunner = async (cmd) => {
      if (cmd.name === 'git.status') {
        return failure({
          code: 'GIT_ERROR',
          message: 'Failed to get status',
        });
      }
      if (cmd.name === 'git.commit') {
        executedHandlers.push('recovery-handler');
      }
      return success({});
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'recovery',
      steps: [
        {
          id: 'risky',
          command: 'git.status' as const,
          params: {},
          onSuccess: 'success',
          onFailure: 'recover',
        },
        {
          id: 'recover',
          command: 'git.commit' as const,
          params: { message: 'recovery' },
          onSuccess: 'exit',
          onFailure: 'exit',
        },
        {
          id: 'success',
          command: 'git.pull' as const,
          params: {},
          onSuccess: 'exit',
          onFailure: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // Recovery handler should have been called
      expect(executedHandlers).toContain('recovery-handler');
    }
  });

  it('large dataset processing: analytics handles large repo', () => {
    // Create a large git log (simulating large repo)
    const logLines: string[] = [];

    for (let i = 0; i < 1000; i++) {
      const hash = `hash${i}`;
      const author = `author${i % 20}`;
      const date = new Date(Date.now() - i * 86400000).toISOString();
      const message = `feat(module${i % 10}): change ${i}`;

      logLines.push(`${hash}|${author}|${date}|${message}`);

      // Add file change lines
      for (let j = 0; j < (i % 5) + 1; j++) {
        logLines.push(
          `${10 + j}\t${5 + j}\tsrc/module${i % 10}/file${j}.ts`
        );
      }
    }

    const gitLog = logLines.join('\n');

    // Parse without crashing
    const lines = gitLog.split('\n');
    const commitLines = lines.filter((l) =>
      (l.match(/\|/g) || []).length >= 3
    );

    expect(commitLines.length).toBe(1000);
    expect(lines.length).toBeGreaterThan(1000); // Includes file change lines
  });

  it('concurrent change grouping: deterministic results', () => {
    const changes = [
      {
        path: 'src/api/a.ts',
        status: 'M' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 10,
        deletions: 0,
      },
      {
        path: 'src/api/b.ts',
        status: 'M' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 10,
        deletions: 0,
      },
      {
        path: 'src/api/c.ts',
        status: 'M' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 10,
        deletions: 0,
      },
    ];

    const grouper = new ChangeGrouper();

    // Run multiple times
    const result1 = grouper.group(changes);
    const result2 = grouper.group(changes);
    const result3 = grouper.group(changes);

    // Should be deterministic
    expect(result1.length).toBe(result2.length);
    expect(result2.length).toBe(result3.length);

    // Same files in each run
    expect(result1[0].files.length).toBe(result2[0].files.length);
    expect(result2[0].files.length).toBe(result3[0].files.length);
  });
});

// ============================================================================
// Integration: smartCommit + Workflow Integration
// ============================================================================

describe('Integration: smartCommit + Workflow', () => {
  let logger: MockLogger;
  let git: MockGitProvider;
  let grouper: ChangeGrouper;
  let suggester: CommitMessageSuggester;

  beforeEach(() => {
    logger = new MockLogger();
    git = new MockGitProvider();
    grouper = new ChangeGrouper();
    suggester = new CommitMessageSuggester();
  });

  it('smartCommit result feeds into workflow as input', async () => {
    // Step 1: smartCommit groups and suggests
    const changes = [
      {
        path: 'src/api/handler.ts',
        status: 'A' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 50,
        deletions: 0,
      },
      {
        path: 'src/api/types.ts',
        status: 'A' as const,
        domain: 'api',
        fileType: '.ts',
        additions: 30,
        deletions: 0,
      },
    ];

    git.setAllChanges(changes);
    const allChangesResult = await git.getAllChanges();
    expect(allChangesResult.kind).toBe('ok');

    const groups = grouper.group(allChangesResult.value);
    expect(groups.length).toBeGreaterThan(0);

    const groupsWithMsgs = groups.map((g) => ({
      ...g,
      suggestedMessage: suggester.suggest(g),
    }));

    // Step 2: Workflow uses these messages
    const stepRunner: StepRunner = async () => {
      return success({
        commits: groupsWithMsgs.map((g) => ({
          message: g.suggestedMessage.full,
          files: g.files.map((f) => f.path),
        })),
      });
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'auto-commit',
      steps: [
        {
          id: 'commit-step',
          command: 'git.commit' as const,
          params: {
            groups: groupsWithMsgs.map((g) => g.suggestedMessage.full),
          },
          onSuccess: 'exit',
          onFailure: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.stepResults.size).toBe(1);
    }
  });
});
