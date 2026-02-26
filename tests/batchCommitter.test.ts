/**
 * BatchCommitter Tests (4 tests)
 * Testing batch commit execution and rollback semantics
 */

import { describe, it, expect } from 'vitest';
import { BatchCommitter } from '../src/domains/git/service';
import { MockGitProvider, MockLogger, assertSuccess, assertFailure } from './fixtures';

describe('BatchCommitter', () => {
  // Test 1: executeBatch() commits all groups
  it('should execute batch and commit all groups', async () => {
    const gitProvider = new MockGitProvider();
    const logger = new MockLogger();
    const committer = new BatchCommitter(gitProvider, logger);

    const groups = [
      {
        id: 'group-1',
        files: [
          { path: 'src/api/v1.ts', status: 'M', domain: 'api', fileType: '.ts' },
          { path: 'src/api/v2.ts', status: 'M', domain: 'api', fileType: '.ts' },
        ],
        suggestedMessage: {
          type: 'fix',
          scope: 'api',
          description: 'update endpoints',
          full: 'fix(api): update endpoints',
        },
        similarity: 0.9,
      },
      {
        id: 'group-2',
        files: [
          { path: 'src/auth/login.ts', status: 'A', domain: 'auth', fileType: '.ts' },
        ],
        suggestedMessage: {
          type: 'feat',
          scope: 'auth',
          description: 'add login handler',
          full: 'feat(auth): add login handler',
        },
        similarity: 1,
      },
    ];

    const result = await committer.executeBatch(groups);
    const commits = assertSuccess(result);

    expect(commits.length).toBe(2);
    expect(commits[0].message).toBe('fix(api): update endpoints');
    expect(commits[1].message).toBe('feat(auth): add login handler');
    expect(gitProvider.getStagedPaths()).toContain('src/auth/login.ts');
  });

  // Test 2: rollback() on stage failure
  it('should rollback when staging fails', async () => {
    const gitProvider = new MockGitProvider();
    const logger = new MockLogger();
    const committer = new BatchCommitter(gitProvider, logger);

    // Inject failure by wrapping the stage method
    const originalStage = gitProvider.stage.bind(gitProvider);
    gitProvider.stage = async () => {
      return {
        kind: 'err' as const,
        error: {
          code: 'STAGE_FAILED',
          message: 'Permission denied',
        },
      };
    };

    const groups = [
      {
        id: 'group-1',
        files: [{ path: 'src/test.ts', status: 'M', domain: 'test', fileType: '.ts' }],
        suggestedMessage: {
          type: 'fix',
          scope: 'test',
          description: 'test',
          full: 'fix(test): test',
        },
        similarity: 1,
      },
    ];

    const result = await committer.executeBatch(groups);
    const error = assertFailure(result);

    expect(error.code).toBe('STAGE_FAILED');
  });

  // Test 3: rollback() on commit failure
  it('should rollback when commit fails', async () => {
    const gitProvider = new MockGitProvider();
    const logger = new MockLogger();
    const committer = new BatchCommitter(gitProvider, logger);

    // Stage succeeds, commit fails
    let commitCalls = 0;
    const originalCommit = gitProvider.commit.bind(gitProvider);
    gitProvider.commit = async () => {
      commitCalls++;
      if (commitCalls === 1) {
        // First commit succeeds
        return { kind: 'ok' as const, value: 'hash1' };
      } else {
        // Second commit fails
        return {
          kind: 'err' as const,
          error: {
            code: 'COMMIT_FAILED',
            message: 'No changes to commit',
          },
        };
      }
    };

    const groups = [
      {
        id: 'group-1',
        files: [{ path: 'src/test.ts', status: 'M', domain: 'test', fileType: '.ts' }],
        suggestedMessage: {
          type: 'fix',
          scope: 'test',
          description: 'test',
          full: 'fix(test): test',
        },
        similarity: 1,
      },
      {
        id: 'group-2',
        files: [{ path: 'src/test2.ts', status: 'M', domain: 'test', fileType: '.ts' }],
        suggestedMessage: {
          type: 'fix',
          scope: 'test',
          description: 'test2',
          full: 'fix(test): test2',
        },
        similarity: 1,
      },
    ];

    const result = await committer.executeBatch(groups);
    const error = assertFailure(result);

    expect(error.code).toBe('COMMIT_FAILED');
  });

  // Test 4: atomic semantics - all-or-nothing
  it('should provide all-or-nothing semantics', async () => {
    const gitProvider = new MockGitProvider();
    const logger = new MockLogger();
    const committer = new BatchCommitter(gitProvider, logger);

    let commitCount = 0;
    gitProvider.commit = async () => {
      commitCount++;
      if (commitCount === 1) {
        return { kind: 'ok' as const, value: 'hash1' };
      }
      // Fail on second commit
      return {
        kind: 'err' as const,
        error: {
          code: 'COMMIT_FAILED',
          message: 'Atomic failure test',
        },
      };
    };

    const groups = [
      {
        id: 'g1',
        files: [{ path: 'a.ts', status: 'M', domain: 'api', fileType: '.ts' }],
        suggestedMessage: {
          type: 'fix',
          scope: 'api',
          description: 'a',
          full: 'fix(api): a',
        },
        similarity: 1,
      },
      {
        id: 'g2',
        files: [{ path: 'b.ts', status: 'M', domain: 'api', fileType: '.ts' }],
        suggestedMessage: {
          type: 'fix',
          scope: 'api',
          description: 'b',
          full: 'fix(api): b',
        },
        similarity: 1,
      },
    ];

    const result = await committer.executeBatch(groups);

    // Batch should fail and report error
    const error = assertFailure(result);
    expect(error.code).toBe('COMMIT_FAILED');

    // Logger should record rollback attempt
    const logs = logger.getByLevel('info');
    const hasRollbackLog = logs.some((log) => log.message.includes('Rolling back'));
    expect(hasRollbackLog).toBe(true);
  });
});
