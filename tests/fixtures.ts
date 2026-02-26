/**
 * Test Fixtures — Mocks and helpers for all unit tests
 * No external dependencies; all mocks provided inline
 */

import {
  Logger,
  GitProvider,
  WorkspaceProvider,
  CommandContext,
  GitStatus,
  GitPullResult,
  GitStageChange,
  GitFileChange,
  Result,
  success,
  failure,
  AppError,
} from '../src/types';

// ============================================================================
// Mock Logger
// ============================================================================

export class MockLogger implements Logger {
  logs: Array<{ level: string; message: string; context?: string; data?: unknown }> = [];

  debug(message: string, context?: string, data?: unknown): void {
    this.logs.push({ level: 'debug', message, context, data });
  }

  info(message: string, context?: string, data?: unknown): void {
    this.logs.push({ level: 'info', message, context, data });
  }

  warn(message: string, context?: string, error?: AppError): void {
    this.logs.push({ level: 'warn', message, context, data: error });
  }

  error(message: string, context?: string, error?: AppError): void {
    this.logs.push({ level: 'error', message, context, data: error });
  }

  clear(): void {
    this.logs = [];
  }

  getByLevel(level: string): typeof this.logs {
    return this.logs.filter((log) => log.level === level);
  }
}

// ============================================================================
// Mock GitProvider
// ============================================================================

export class MockGitProvider implements GitProvider {
  private statusValue: GitStatus = {
    branch: 'main',
    isDirty: false,
    staged: 0,
    unstaged: 0,
    untracked: 0,
  };

  private changes: GitStageChange[] = [];
  private allChanges: GitFileChange[] = [];
  private diffOutput = '';
  private stagedPaths: string[] = [];
  private currentBranch = 'main';
  private remoteUrl = 'https://github.com/test/repo.git';

  // Override default values for tests
  setStatus(status: GitStatus): void {
    this.statusValue = status;
  }

  setChanges(changes: GitStageChange[]): void {
    this.changes = changes;
  }

  setAllChanges(changes: GitFileChange[]): void {
    this.allChanges = changes;
  }

  setDiff(output: string): void {
    this.diffOutput = output;
  }

  setCurrentBranch(branch: string): void {
    this.currentBranch = branch;
  }

  setRemoteUrl(url: string): void {
    this.remoteUrl = url;
  }

  getStagedPaths(): string[] {
    return this.stagedPaths;
  }

  async status(): Promise<Result<GitStatus>> {
    return success(this.statusValue);
  }

  async pull(): Promise<Result<GitPullResult>> {
    return success({
      success: true,
      branch: this.currentBranch,
      message: 'Pull successful',
    });
  }

  async commit(message: string): Promise<Result<string>> {
    const hash = `hash_${Math.random().toString(36).substr(2, 9)}`;
    return success(hash);
  }

  async getChanges(): Promise<Result<GitStageChange[]>> {
    return success(this.changes);
  }

  async getDiff(): Promise<Result<string>> {
    return success(this.diffOutput);
  }

  async stage(paths: string[]): Promise<Result<void>> {
    this.stagedPaths = paths;
    return success(void 0);
  }

  async reset(
    paths: string[] | { mode: string; ref: string }
  ): Promise<Result<void>> {
    return success(void 0);
  }

  async getAllChanges(): Promise<Result<GitFileChange[]>> {
    return success(this.allChanges);
  }

  async fetch(): Promise<Result<void>> {
    return success(void 0);
  }

  async getRemoteUrl(): Promise<Result<string>> {
    return success(this.remoteUrl);
  }

  async getCurrentBranch(): Promise<Result<string>> {
    return success(this.currentBranch);
  }

  async diff(revision: string): Promise<Result<string>> {
    return success(`diff ${revision}\n${this.diffOutput}`);
  }
}

// ============================================================================
// Mock WorkspaceProvider
// ============================================================================

export class MockWorkspaceProvider implements WorkspaceProvider {
  private files: Map<string, string> = new Map();

  setFiles(files: Record<string, string>): void {
    this.files.clear();
    Object.entries(files).forEach(([path, content]) => {
      this.files.set(path, content);
    });
  }

  async findFiles(pattern: string): Promise<Result<string[]>> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const matches = Array.from(this.files.keys()).filter((f) =>
      regex.test(f)
    );
    return success(matches);
  }

  async readFile(path: string): Promise<Result<string>> {
    const content = this.files.get(path);
    if (!content) {
      return failure({
        code: 'FILE_NOT_FOUND',
        message: `File not found: ${path}`,
      });
    }
    return success(content);
  }

  async deleteFile(path: string): Promise<Result<void>> {
    this.files.delete(path);
    return success(void 0);
  }
}

// ============================================================================
// Test Data — Sample Changes, Commits, etc.
// ============================================================================

export function createMockContext(): CommandContext {
  return {
    extensionPath: '/home/user/.vscode/extensions/test',
    workspaceFolders: ['/home/user/project'],
    activeFilePath: '/home/user/project/src/main.ts',
  };
}

export function createMockChange(overrides?: Partial<GitFileChange>): GitFileChange {
  return {
    path: 'src/file.ts',
    status: 'M',
    additions: 10,
    deletions: 5,
    ...overrides,
  };
}

export const SAMPLE_GIT_LOG = `abc1234|author@example.com|2024-02-20T10:30:00Z|feat(api): add new endpoint
2	1	src/api.ts
1	0	src/types.ts
def5678|author@example.com|2024-02-19T15:45:00Z|fix(bug): resolve caching issue
5	3	src/cache.ts
2	1	tests/cache.test.ts`;

export const SAMPLE_GIT_LOG_MALFORMED = `invalid log format
without proper pipes and dates
abc1234|only three fields here`;

export const SAMPLE_WORKFLOW = {
  name: 'deploy-pipeline',
  description: 'Continuous deployment workflow',
  steps: [
    {
      id: 'step-1',
      command: 'git.status' as const,
      params: { verbose: true },
      onSuccess: 'step-2',
      onFailure: 'exit',
    },
    {
      id: 'step-2',
      command: 'git.pull' as const,
      params: {},
      onSuccess: 'exit',
      onFailure: 'exit',
    },
  ],
};

export const SAMPLE_WORKFLOW_WITH_VARIABLES = {
  name: 'custom-workflow',
  steps: [
    {
      id: 'step-1',
      command: 'git.status' as const,
      params: { path: '$(srcPath)' },
      onSuccess: 'exit',
    },
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock middleware for testing command router
 */
export function createMockMiddleware(onCall: (name: string) => void = () => {}) {
  return async (ctx: any, next: () => Promise<void>) => {
    onCall(ctx.commandName);
    await next();
  };
}

/**
 * Assert Result is success
 */
export function assertSuccess<T>(result: Result<T>): T {
  if (result.kind === 'err') {
    throw new Error(`Expected success but got error: ${result.error.message}`);
  }
  return result.value;
}

/**
 * Assert Result is failure
 */
export function assertFailure<T>(result: Result<T>): AppError {
  if (result.kind === 'ok') {
    throw new Error(`Expected failure but got success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

/**
 * Create test git log with specified number of commits
 */
export function createTestGitLog(commitCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < commitCount; i++) {
    const hash = `hash${i}`;
    const author = `author${i % 3}`;
    const date = new Date(Date.now() - i * 86400000).toISOString();
    const message = `feat(domain${i % 5}): change ${i}`;
    lines.push(`${hash}|${author}|${date}|${message}`);
    lines.push(`${i + 1}\t${Math.floor(i / 2)}\tsrc/file${i}.ts`);
  }
  return lines.join('\n');
}

/**
 * Create test changes for grouper
 */
export function createTestChanges(
  count: number,
  domain = 'api',
  status: 'A' | 'M' | 'D' = 'M'
) {
  const changes = [];
  for (let i = 0; i < count; i++) {
    changes.push({
      path: `src/${domain}/file${i}.ts`,
      status,
      domain,
      fileType: '.ts',
      additions: 10 + i,
      deletions: 5 + Math.floor(i / 2),
    });
  }
  return changes;
}

// ============================================================================
// Enhanced Test Scenarios — Realistic Data Sets
// ============================================================================

/**
 * Sample scenario: Multiple domains with mixed statuses
 */
export const REALISTIC_CHANGES_SCENARIO_1 = [
  // New API features
  { path: 'src/domains/api/handlers.ts', status: 'A' as const, domain: 'api', fileType: '.ts', additions: 150, deletions: 0 },
  { path: 'src/domains/api/types.ts', status: 'A' as const, domain: 'api', fileType: '.ts', additions: 80, deletions: 0 },
  { path: 'src/domains/api/validators.ts', status: 'A' as const, domain: 'api', fileType: '.ts', additions: 120, deletions: 0 },
  // Documentation updates
  { path: 'docs/api.md', status: 'M' as const, domain: 'docs', fileType: '.md', additions: 25, deletions: 10 },
  { path: 'CHANGELOG.md', status: 'M' as const, domain: 'docs', fileType: '.md', additions: 15, deletions: 0 },
  // Configuration changes
  { path: 'package.json', status: 'M' as const, domain: 'config', fileType: '.json', additions: 3, deletions: 2 },
  { path: '.eslintrc.json', status: 'M' as const, domain: 'config', fileType: '.json', additions: 5, deletions: 5 },
];

/**
 * Sample scenario: Large refactoring (many modifications)
 */
export const REALISTIC_CHANGES_SCENARIO_2 = [
  // Refactoring
  { path: 'src/services/auth.ts', status: 'M' as const, domain: 'auth', fileType: '.ts', additions: 200, deletions: 180 },
  { path: 'src/services/permissions.ts', status: 'M' as const, domain: 'auth', fileType: '.ts', additions: 150, deletions: 140 },
  { path: 'src/middleware/auth.ts', status: 'M' as const, domain: 'auth', fileType: '.ts', additions: 100, deletions: 90 },
  // Test updates
  { path: 'tests/auth.test.ts', status: 'M' as const, domain: 'testing', fileType: '.ts', additions: 200, deletions: 150 },
];

/**
 * Sample scenario: Cleanup (deletions and modifications)
 */
export const REALISTIC_CHANGES_SCENARIO_3 = [
  // Delete deprecated files
  { path: 'src/legacy/old-api.ts', status: 'D' as const, domain: 'legacy', fileType: '.ts', additions: 0, deletions: 500 },
  { path: 'src/legacy/compat.ts', status: 'D' as const, domain: 'legacy', fileType: '.ts', additions: 0, deletions: 300 },
  // Update imports
  { path: 'src/main.ts', status: 'M' as const, domain: 'core', fileType: '.ts', additions: 10, deletions: 20 },
  { path: 'src/index.ts', status: 'M' as const, domain: 'core', fileType: '.ts', additions: 5, deletions: 15 },
];

/**
 * Sample git log: 6 commits with realistic data
 */
export const REALISTIC_GIT_LOG_SMALL = `
abc1234|Alice Smith|2026-02-24T10:30:00Z|feat(api): add user endpoints
150\t0\tsrc/api/user.ts
80\t0\tsrc/api/types.ts
25\t10\tdocs/api.md

def5678|Bob Jones|2026-02-24T11:45:00Z|fix(auth): handle token expiry
120\t100\tsrc/auth/token.ts
30\t20\ttests/auth.test.ts

ghi9012|Alice Smith|2026-02-24T14:20:00Z|refactor: reorganize middleware
200\t180\tsrc/middleware/auth.ts
150\t140\tsrc/middleware/logging.ts

jkl3456|Charlie Brown|2026-02-25T09:00:00Z|docs: update README
50\t20\tREADME.md
10\t5\tdocs/CONTRIBUTING.md

mno7890|Alice Smith|2026-02-25T10:30:00Z|chore: update dependencies
5\t3\tpackage.json
2\t2\tpackage-lock.json

pqr1234|Bob Jones|2026-02-25T11:15:00Z|fix: address code review feedback
30\t25\tsrc/api/user.ts
15\t10\ttests/api.test.ts
`;

/**
 * Sample git log: 100+ commits (medium dataset)
 */
export function generateMediumGitLog(): string {
  const authors = ['Alice Smith', 'Bob Jones', 'Charlie Brown', 'Diana Prince', 'Eve Wilson'];
  const domains = ['api', 'auth', 'core', 'utils', 'ui', 'docs'];
  const lines: string[] = [];

  for (let i = 0; i < 100; i++) {
    const hash = `hash${String(i).padStart(4, '0')}`;
    const author = authors[i % authors.length];
    const date = new Date(Date.now() - i * 86400000).toISOString();
    const domain = domains[i % domains.length];
    const messageType = ['feat', 'fix', 'refactor', 'docs', 'chore'][i % 5];
    const message = `${messageType}(${domain}): change ${i}`;

    lines.push(`${hash}|${author}|${date}|${message}`);

    // Add 1-5 file changes per commit
    const fileCount = (i % 5) + 1;
    for (let j = 0; j < fileCount; j++) {
      const additions = (10 + j * 5) + (i % 3) * 10;
      const deletions = Math.floor((5 + j * 2) + (i % 2) * 5);
      const filePath = `src/${domain}/file${j}.ts`;
      lines.push(`${additions}\t${deletions}\t${filePath}`);
    }
  }

  return lines.join('\n');
}

/**
 * Sample conflict scenarios
 */
export const CONFLICT_SCENARIO_BOTH_MODIFIED = [
  { local: { path: 'src/service.ts', status: 'M' as const }, remote: { path: 'src/service.ts', status: 'M' as const }, severity: 'high' },
  { local: { path: 'src/utils.ts', status: 'M' as const }, remote: { path: 'src/utils.ts', status: 'M' as const }, severity: 'high' },
];

export const CONFLICT_SCENARIO_DELETED_LOCALLY = [
  { local: { path: 'src/deprecated.ts', status: 'D' as const }, remote: { path: 'src/deprecated.ts', status: 'M' as const }, severity: 'high' },
];

export const CONFLICT_SCENARIO_BOTH_ADDED = [
  { local: { path: 'src/new-feature.ts', status: 'A' as const }, remote: { path: 'src/new-feature.ts', status: 'A' as const }, severity: 'medium' },
];

export const CONFLICT_SCENARIO_NO_CONFLICT = [
  { local: { path: 'src/local-only.ts', status: 'A' as const }, remote: { path: 'src/remote-only.ts', status: 'A' as const }, severity: 'none' },
];

/**
 * Sample workflow scenarios
 */
export const WORKFLOW_SCENARIO_LINEAR = {
  name: 'linear-workflow',
  description: 'Simple 3-step workflow',
  steps: [
    { id: 'step1', command: 'git.status' as const, params: {}, onSuccess: 'step2', onFailure: 'exit' },
    { id: 'step2', command: 'git.pull' as const, params: {}, onSuccess: 'step3', onFailure: 'exit' },
    { id: 'step3', command: 'git.commit' as const, params: { message: 'auto commit' }, onSuccess: 'exit', onFailure: 'exit' },
  ],
};

export const WORKFLOW_SCENARIO_BRANCHING = {
  name: 'branching-workflow',
  description: 'Workflow with failure recovery',
  steps: [
    { id: 'check', command: 'git.status' as const, params: {}, onSuccess: 'commit', onFailure: 'recover' },
    { id: 'commit', command: 'git.commit' as const, params: {}, onSuccess: 'exit', onFailure: 'exit' },
    { id: 'recover', command: 'git.reset' as const, params: {}, onSuccess: 'exit', onFailure: 'exit' },
  ],
};

export const WORKFLOW_SCENARIO_WITH_RETRY = {
  name: 'retry-workflow',
  description: 'Workflow with retry logic',
  steps: [
    { id: 'pull', command: 'git.pull' as const, params: {}, onSuccess: 'exit', onFailure: 'exit', retries: 3 },
  ],
};

/**
 * Helper to create large datasets for stress testing
 */
export function createLargeChangeSet(fileCount: number): Array<{
  path: string;
  status: 'A' | 'M' | 'D';
  domain: string;
  fileType: string;
  additions: number;
  deletions: number;
}> {
  const domains = ['api', 'auth', 'core', 'utils', 'ui', 'docs', 'config', 'infrastructure'];
  const fileTypes = ['.ts', '.ts', '.ts', '.ts', '.json', '.md', '.md', '.yml'];
  const statuses: Array<'A' | 'M' | 'D'> = ['A', 'M', 'M', 'M', 'D'];

  const changes = [];
  for (let i = 0; i < fileCount; i++) {
    const domain = domains[i % domains.length];
    const fileType = fileTypes[i % fileTypes.length];
    const status = statuses[i % statuses.length];

    changes.push({
      path: `src/${domain}/file${i % 100}.ts`,
      status,
      domain,
      fileType,
      additions: Math.floor(Math.random() * 500),
      deletions: Math.floor(Math.random() * 300),
    });
  }
  return changes;
}

/**
 * Mock timeout for async tests
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
