import type {
  ToolId,
  ScanOptions,
  Finding,
  CommitConstraints,
  CommitProposal,
  ChangedFile,
  IModelProvider,
  HookCheckResult,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { getChangedFiles } from '../../git/status.js';
import {
  autoStage,
  getStagedDiff,
  getDiffSummary,
  createCommit,
  amendCommit,
  getLastCommitInfo,
} from '../../git/staging.js';
import { validateCommitMessage } from '../../git/validation.js';
import { checkHooks } from '../../git/hooks.js';
import { getRepoRoot } from '../../git/executor.js';
import { TOOL_MAX_DIFF_LINES } from '../../settings/defaults.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_DIFF_LINES = TOOL_MAX_DIFF_LINES;

/** Max stat output length for the model prompt */
const MAX_STAT_LENGTH = 3000;

/** Short hash length for display */
const SHORT_HASH_LENGTH = 8;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Dependencies injected into the CommitTool.
 * Keeps the tool testable and free of IDE imports.
 */
export interface CommitToolDeps {
  /** Model provider for generating commit messages */
  modelProvider: IModelProvider;
  /** Current commit constraints from settings */
  commitConstraints: CommitConstraints;
  /** Whether to dry-run pre-commit hooks */
  preCommitDryRun: boolean;
  /** Working directory (repo root) */
  cwd: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/** Commit action types supported by the tool */
type CommitAction = 'propose' | 'apply' | 'amend';

/**
 * Auto-Commit tool.
 *
 * Supports three actions (via `options.args.action`):
 *
 * - `propose` (default): Detect changes, stage, generate commit message via model,
 *   validate against constraints, dry-run hooks, return CommitProposal.
 * - `apply`: Stage files, validate the provided message, create the commit.
 * - `amend`: Amend the last commit with a new message.
 *
 * Propose NEVER auto-commits — always returns a proposal.
 * Apply and amend are restricted (agent loop yields confirmation_required).
 */
export class CommitTool extends BaseTool {
  readonly id: ToolId = 'commit';
  readonly name = 'Auto-Commit';
  readonly description = 'Stage changed files and generate a commit message for approval, or apply/amend a commit.';

  private deps: CommitToolDeps | undefined;

  /**
   * Set dependencies. Must be called before execute().
   */
  setDeps(deps: CommitToolDeps): void {
    this.deps = deps;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('CommitTool: Dependencies not set. Call setDeps() before execute().');
    }

    const action = ((options.args?.action as string) ?? 'propose') as CommitAction;

    switch (action) {
      case 'propose':
        return this.runPropose(options);
      case 'apply':
        return this.runApply(options);
      case 'amend':
        return this.runAmend(options);
      default:
        return [
          this.createFinding({
            title: 'Unknown commit action',
            description: `Unknown action "${String(action)}". Use "propose", "apply", or "amend".`,
            location: { filePath: '.', startLine: 0, endLine: 0 },
            severity: 'error',
          }),
        ];
    }
  }

  // ─── Propose Action (original behavior) ────────────────────────────────

  private async runPropose(options: ScanOptions): Promise<Finding[]> {
    const { modelProvider, commitConstraints, preCommitDryRun, cwd } = this.deps!;
    const findings: Finding[] = [];

    // Phase 1: Detect changed files
    this.throwIfCancelled(options);
    const repoRoot = await getRepoRoot(cwd);
    const changedFiles = await getChangedFiles(repoRoot);

    if (changedFiles.length === 0) {
      findings.push(
        this.createFinding({
          title: 'No changes to commit',
          description: 'Working tree is clean — nothing to stage or commit.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    // Phase 2: Auto-stage
    this.throwIfCancelled(options);
    const targetFiles = options.paths ?? undefined;
    const stagedPaths = await autoStage(repoRoot, changedFiles, targetFiles);

    // Phase 3: Generate commit message
    this.throwIfCancelled(options);
    const diffStat = await getDiffSummary(repoRoot, true);
    const diff = await getStagedDiff(repoRoot, MAX_DIFF_LINES);
    const prompt = buildCommitPrompt(changedFiles, diffStat, diff, commitConstraints);

    const response = await this.sendRequestWithTimeout(
      async (timeoutSignal) => {
        // Merge user signal with timeout signal
        const mergedSignal = options.signal
          ? AbortSignal.any([options.signal, timeoutSignal])
          : timeoutSignal;
          
        return modelProvider.sendRequest({
          role: 'tool',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          signal: mergedSignal,
        });
      },
    );

    const commitMessage = response.content.trim();

    // Phase 4: Validate constraints
    this.throwIfCancelled(options);
    const validation = validateCommitMessage(commitMessage, commitConstraints);

    for (const violation of validation.violations) {
      findings.push(
        this.createFinding({
          title: `Constraint violation: ${violation.constraint}`,
          description: violation.message,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: commitConstraints.enforcement === 'deny' ? 'error' : 'warning',
        }),
      );
    }

    // Phase 5: Pre-commit hook dry-run
    let hookResults: HookCheckResult[] = [];
    if (preCommitDryRun) {
      this.throwIfCancelled(options);
      hookResults = await checkHooks(repoRoot, true);

      for (const hook of hookResults) {
        if (hook.exists && hook.dryRunPassed === false) {
          findings.push(
            this.createFinding({
              title: `Pre-commit hook failed: ${hook.hookName}`,
              description: hook.output ?? 'Hook exited with non-zero status.',
              location: { filePath: repoRoot, startLine: 0, endLine: 0 },
              severity: 'warning',
            }),
          );
        }
      }
    }

    // Phase 6: Assemble proposal into metadata
    const proposal: CommitProposal = {
      message: commitMessage,
      files: changedFiles.filter((f) => stagedPaths.includes(f.filePath)),
      constraintValidation: validation,
    };

    // Store proposal in a finding with metadata
    findings.push(
      this.createFinding({
        title: 'Commit proposal ready',
        description: commitMessage,
        location: { filePath: repoRoot, startLine: 0, endLine: 0 },
        severity: validation.valid ? 'info' : 'warning',
        metadata: {
          proposal,
          hookResults,
          stagedFileCount: stagedPaths.length,
          totalChangedFiles: changedFiles.length,
        },
      }),
    );

    return findings;
  }

  // ─── Apply Action ──────────────────────────────────────────────────────

  private async runApply(options: ScanOptions): Promise<Finding[]> {
    const { commitConstraints, preCommitDryRun, cwd } = this.deps!;
    const findings: Finding[] = [];
    const message = options.args?.message as string | undefined;

    if (!message || message.trim().length === 0) {
      findings.push(
        this.createFinding({
          title: 'Missing commit message',
          description: 'The "apply" action requires a "message" argument.',
          location: { filePath: '.', startLine: 0, endLine: 0 },
          severity: 'error',
        }),
      );
      return findings;
    }

    this.throwIfCancelled(options);
    const repoRoot = await getRepoRoot(cwd);

    // Stage files if there are unstaged changes
    const changedFiles = await getChangedFiles(repoRoot);
    if (changedFiles.length > 0) {
      const targetFiles = options.paths ?? undefined;
      await autoStage(repoRoot, changedFiles, targetFiles);
    }

    // Validate message
    const validation = validateCommitMessage(message, commitConstraints);
    for (const violation of validation.violations) {
      findings.push(
        this.createFinding({
          title: `Constraint violation: ${violation.constraint}`,
          description: violation.message,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: commitConstraints.enforcement === 'deny' ? 'error' : 'warning',
        }),
      );
    }

    // If enforcement is 'deny' and validation failed, abort
    if (commitConstraints.enforcement === 'deny' && !validation.valid) {
      findings.push(
        this.createFinding({
          title: 'Commit blocked',
          description: 'Commit message violates constraints with enforcement set to "deny".',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'error',
        }),
      );
      return findings;
    }

    // Pre-commit hook dry-run
    if (preCommitDryRun) {
      this.throwIfCancelled(options);
      const hookResults = await checkHooks(repoRoot, true);

      for (const hook of hookResults) {
        if (hook.exists && hook.dryRunPassed === false) {
          findings.push(
            this.createFinding({
              title: `Pre-commit hook failed: ${hook.hookName}`,
              description: hook.output ?? 'Hook exited with non-zero status.',
              location: { filePath: repoRoot, startLine: 0, endLine: 0 },
              severity: 'warning',
            }),
          );
        }
      }
    }

    // Create the commit
    this.throwIfCancelled(options);
    const hash = await createCommit(repoRoot, message);

    findings.push(
      this.createFinding({
        title: 'Commit created',
        description: `Committed as ${hash.slice(0, SHORT_HASH_LENGTH)}: ${message}`,
        location: { filePath: repoRoot, startLine: 0, endLine: 0 },
        severity: 'info',
        metadata: { hash, message, action: 'apply' },
      }),
    );

    return findings;
  }

  // ─── Amend Action ──────────────────────────────────────────────────────

  private async runAmend(options: ScanOptions): Promise<Finding[]> {
    const { commitConstraints, cwd } = this.deps!;
    const findings: Finding[] = [];
    const message = options.args?.message as string | undefined;

    if (!message || message.trim().length === 0) {
      findings.push(
        this.createFinding({
          title: 'Missing commit message',
          description: 'The "amend" action requires a "message" argument.',
          location: { filePath: '.', startLine: 0, endLine: 0 },
          severity: 'error',
        }),
      );
      return findings;
    }

    this.throwIfCancelled(options);
    const repoRoot = await getRepoRoot(cwd);

    // Get info about the commit we're amending
    const lastCommit = await getLastCommitInfo(repoRoot);
    if (!lastCommit) {
      findings.push(
        this.createFinding({
          title: 'No commits to amend',
          description: 'Repository has no commits to amend.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'error',
        }),
      );
      return findings;
    }

    // Validate new message
    const validation = validateCommitMessage(message, commitConstraints);
    for (const violation of validation.violations) {
      findings.push(
        this.createFinding({
          title: `Constraint violation: ${violation.constraint}`,
          description: violation.message,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: commitConstraints.enforcement === 'deny' ? 'error' : 'warning',
        }),
      );
    }

    if (commitConstraints.enforcement === 'deny' && !validation.valid) {
      findings.push(
        this.createFinding({
          title: 'Amend blocked',
          description: 'New commit message violates constraints with enforcement set to "deny".',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'error',
        }),
      );
      return findings;
    }

    // Amend the commit
    this.throwIfCancelled(options);
    const newHash = await amendCommit(repoRoot, message);

    findings.push(
      this.createFinding({
        title: 'Commit amended',
        description: `Amended ${lastCommit.hash.slice(0, SHORT_HASH_LENGTH)} → ${newHash.slice(0, SHORT_HASH_LENGTH)}: ${message}`,
        location: { filePath: repoRoot, startLine: 0, endLine: 0 },
        severity: 'info',
        metadata: {
          previousHash: lastCommit.hash,
          newHash,
          previousMessage: lastCommit.subject,
          message,
          action: 'amend',
        },
      }),
    );

    return findings;
  }
}

// ─── Prompt Construction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a commit message generator. Given a diff and file change summary, produce a concise, conventional commit message.

Rules:
- First line: type(scope): description (e.g., feat(auth): add login flow)
- Keep the first line under the character limit specified
- If there's a required prefix, include it at the start
- If there's a required suffix, include it at the end
- Use imperative mood ("add", "fix", "update", not "added", "fixed", "updated")
- Only output the commit message, nothing else
- For multi-file changes, summarize the overall intent, don't list every file
- Add a blank line then a brief body only if the change is complex`;

function buildCommitPrompt(
  files: ChangedFile[],
  diffStat: string,
  diff: string,
  constraints: CommitConstraints,
): string {
  const parts: string[] = [];

  parts.push('Generate a commit message for the following changes:');
  parts.push('');

  // File summary
  parts.push(`## Changed files (${String(files.length)})`);
  for (const f of files) {
    parts.push(`- ${f.status}: ${f.filePath}`);
  }
  parts.push('');

  // Diff stat
  if (diffStat.length > 0) {
    parts.push('## Diff statistics');
    parts.push(diffStat.slice(0, MAX_STAT_LENGTH));
    parts.push('');
  }

  // Detailed diff
  if (diff.length > 0) {
    parts.push('## Diff');
    parts.push('```');
    parts.push(diff);
    parts.push('```');
    parts.push('');
  }

  // Constraints
  parts.push('## Constraints');
  parts.push(`- First line max length: ${String(constraints.maxLength)} characters`);
  parts.push(`- First line min length: ${String(constraints.minLength)} characters`);
  if (constraints.prefix) {
    parts.push(`- Required prefix: "${constraints.prefix}"`);
  }
  if (constraints.suffix) {
    parts.push(`- Required suffix: "${constraints.suffix}"`);
  }

  return parts.join('\n');
}
