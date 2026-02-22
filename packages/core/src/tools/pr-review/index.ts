import type {
  ToolId,
  ScanOptions,
  Finding,
  IModelProvider,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { getRepoRoot, execGit } from '../../git/executor.js';
import {
  TOOL_MODEL_TIMEOUT_MS,
  TOOL_MAX_DIFF_LINES,
} from '../../settings/defaults.js';
import type { LintTool } from '../lint/index.js';
import type { DeadCodeTool } from '../dead-code/index.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MODEL_TIMEOUT_MS = TOOL_MODEL_TIMEOUT_MS;
const MAX_DIFF_LINES = TOOL_MAX_DIFF_LINES;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Extracted information from a unified diff.
 */
export interface ParsedDiffFile {
  filePath: string;
  additions: number;
  deletions: number;
  /** Selected lines of the diff content for this file */
  diffContent: string;
}

export interface PrReviewSummary {
  prNumber: number;
  filesReviewed: number;
  findingCount: number;
  highlights: string[];
}

export interface PRReviewToolDeps {
  /** Model provider for semantic review */
  modelProvider: IModelProvider;
  /** Lint tool instance */
  lintTool: LintTool;
  /** Dead-code tool instance */
  deadCodeTool: DeadCodeTool;
  /** Working directory */
  cwd: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * PR Review tool — analyze pull requests by PR number.
 *
 * Flow:
 * 1. Use `gh pr diff {prNumber}` to fetch the unified diff
 * 2. Parse diff to extract changed file paths
 * 3. Run lint + dead-code analysis scoped to changed files only
 * 4. Run a model-driven semantic review on the raw diff
 * 5. Aggregate findings + optional gh pr review comment
 */
export class PRReviewTool extends BaseTool {
  readonly id: ToolId = 'pr-review';
  readonly name = 'PR Review';
  readonly description =
    'Review a pull request: lint, dead-code detection, and semantic analysis of the diff.';

  private deps: PRReviewToolDeps | undefined;

  setDeps(deps: PRReviewToolDeps): void {
    this.deps = deps;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('PRReviewTool: Dependencies not set. Call setDeps() before execute().');
    }

    const { modelProvider, lintTool, deadCodeTool, cwd } = this.deps;
    const findings: Finding[] = [];

    const prNumber = options.args?.prNumber as number | undefined;
    if (typeof prNumber !== 'number' || prNumber < 1) {
      throw new Error('prNumber must be a positive integer.');
    }

    const repo = (options.args?.repo as string | undefined) ?? '';
    const postComments = (options.args?.postComments as boolean | undefined) ?? false;

    const repoRoot = await getRepoRoot(cwd);

    // Phase 1: Fetch diff
    this.throwIfCancelled(options);
    const diffResult = await execGit({
      cwd: repoRoot,
      args: ['diff', `HEAD`, `origin/refs/pull/${prNumber}/head`],
    });

    // Try alternate approach if the first fails
    let diff = diffResult.stdout;
    if (diffResult.exitCode !== 0) {
      const altResult = await execGit({
        cwd: repoRoot,
        args: repo
          ? ['pr', 'diff', String(prNumber), '--repo', repo]
          : ['pr', 'diff', String(prNumber)],
      });

      if (altResult.exitCode !== 0) {
        findings.push(
          this.createFinding({
            title: 'PR diff fetch failed',
            description: `Could not fetch PR #${prNumber} diff. Is the PR number valid? Error: ${altResult.stderr || 'unknown'}`,
            location: { filePath: repoRoot, startLine: 0, endLine: 0 },
            severity: 'error',
          }),
        );
        return findings;
      }
      diff = altResult.stdout;
    }

    // Phase 2: Parse diff to extract file paths
    this.throwIfCancelled(options);
    const parsedFiles = parseDiff(diff);

    if (parsedFiles.length === 0) {
      findings.push(
        this.createFinding({
          title: 'No changes in PR',
          description: `PR #${prNumber} has no file changes or the diff could not be parsed.`,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    const changedFiles = parsedFiles.map((f) => f.filePath);

    // Phase 3: Run lint on changed files
    this.throwIfCancelled(options);
    const lintResults = await lintTool.execute({
      paths: changedFiles,
      signal: options.signal,
    });

    if (lintResults.status === 'completed') {
      findings.push(...lintResults.findings);
    }

    // Phase 4: Run dead-code on changed files
    this.throwIfCancelled(options);
    const deadCodeResults = await deadCodeTool.execute({
      paths: changedFiles,
      signal: options.signal,
    });

    if (deadCodeResults.status === 'completed') {
      findings.push(...deadCodeResults.findings);
    }

    // Phase 5: Model-driven semantic review
    this.throwIfCancelled(options);
    const semFindings = await this.semanticReview(
      modelProvider,
      diff,
      parsedFiles,
      prNumber,
      options,
    );
    findings.push(...semFindings);

    // Phase 6: Optional comment posting
    if (postComments) {
      this.throwIfCancelled(options);
      const summary = this.buildSummary(prNumber, findings);
      const commentText = formatSummaryForComment(summary);

      const ghArgs = repo
        ? ['pr', 'review', String(prNumber), '--comment', '-b', commentText, '--repo', repo]
        : ['pr', 'review', String(prNumber), '--comment', '-b', commentText];

      const commentResult = await execGit({
        cwd: repoRoot,
        args: ghArgs,
      });

      if (commentResult.exitCode !== 0) {
        findings.push(
          this.createFinding({
            title: 'Failed to post comment',
            description: `Could not post review comment to PR #${prNumber}: ${commentResult.stderr}`,
            location: { filePath: repoRoot, startLine: 0, endLine: 0 },
            severity: 'warning',
          }),
        );
      }
    }

    return findings;
  }

  private async semanticReview(
    modelProvider: IModelProvider,
    diff: string,
    parsedFiles: ParsedDiffFile[],
    prNumber: number,
    options: ScanOptions,
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const prompt = buildSemanticReviewPrompt(diff, parsedFiles, prNumber);

    try {
      const response = await this.sendRequestWithTimeout(
        async (timeoutSignal) => {
          const mergedSignal = options.signal
            ? AbortSignal.any([options.signal, timeoutSignal])
            : timeoutSignal;

          return modelProvider.sendRequest({
            role: 'chat',
            messages: [
              {
                role: 'system',
                content: SEMANTIC_REVIEW_SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            signal: mergedSignal,
          });
        },
        MODEL_TIMEOUT_MS,
      );

      // Parse the model response into findings
      const reviewFindings = parseSemanticReviewResponse(response.content);
      findings.push(...reviewFindings);
    } catch (error) {
      findings.push(
        this.createErrorFinding(
          '',
          error,
          'Semantic review analysis',
        ),
      );
    }

    return findings;
  }

  private buildSummary(prNumber: number, findings: Finding[]): PrReviewSummary {
    const uniqueFiles = new Set<string>();
    const highlights: string[] = [];

    for (const finding of findings) {
      if (finding.location.filePath) {
        uniqueFiles.add(finding.location.filePath);
      }
      // Collect error/warning highlights
      if ((finding.severity === 'error' || finding.severity === 'warning') && highlights.length < 5) {
        highlights.push(`${finding.title}: ${finding.description}`);
      }
    }

    return {
      prNumber,
      filesReviewed: uniqueFiles.size,
      findingCount: findings.length,
      highlights,
    };
  }

  protected countScannedFiles(options: ScanOptions): number {
    const paths = options.paths ?? [];
    return paths.length;
  }
}

// ─── Diff Parsing ──────────────────────────────────────────────────────────

/**
 * Parse a unified diff into file paths and metadata.
 * Extracts file paths from diff headers like:
 *   diff --git a/path/to/file b/path/to/file
 */
export function parseDiff(diff: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  const lines = diff.split('\n');

  let currentFile: ParsedDiffFile | null = null;

  for (const line of lines) {
    // Match "diff --git a/path b/path" pattern
    const gitDiffMatch = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
    if (gitDiffMatch) {
      // Save previous file if any
      if (currentFile && currentFile.filePath) {
        files.push(currentFile);
      }

      const filePath = gitDiffMatch[1]; // Use the 'a' path
      currentFile = {
        filePath,
        additions: 0,
        deletions: 0,
        diffContent: '',
      };
    }

    if (currentFile) {
      // Track additions/deletions
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.additions += 1;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletions += 1;
      }

      // Accumulate diff content (sample, not full)
      if (line.startsWith('+') || line.startsWith('-') || line.startsWith('@@')) {
        if (currentFile.diffContent.split('\n').length < 20) {
          currentFile.diffContent += line + '\n';
        }
      }
    }
  }

  // Don't forget the last file
  if (currentFile && currentFile.filePath) {
    files.push(currentFile);
  }

  return files;
}

// ─── Semantic Review Prompting ────────────────────────────────────────────

const SEMANTIC_REVIEW_SYSTEM_PROMPT = `You are a code reviewer. Analyze the provided PR diff for:
- Logic errors and correctness issues
- Missing error handling
- Security vulnerabilities
- Naming inconsistencies
- Best practice violations

For each issue, provide a clear, actionable finding.
Format your response as a numbered list:
1. [severity] Issue title: description
2. [severity] Issue title: description
...

Severity levels: error, warning, info.`;

function buildSemanticReviewPrompt(
  diff: string,
  parsedFiles: ParsedDiffFile[],
  prNumber: number,
): string {
  const parts: string[] = [];

  parts.push(`## PR #${prNumber} Semantic Review\n`);
  parts.push(`Changed files: ${String(parsedFiles.length)}\n`);

  for (const file of parsedFiles.slice(0, 10)) {
    parts.push(`- ${file.filePath} (+${file.additions} -${file.deletions})`);
  }

  if (parsedFiles.length > 10) {
    parts.push(`... and ${parsedFiles.length - 10} more files`);
  }

  parts.push('\n## Diff (first 500 lines):\n');

  const diffLines = diff.split('\n');
  const truncatedDiff = diffLines.length > MAX_DIFF_LINES
    ? diffLines.slice(0, MAX_DIFF_LINES).join('\n')
    : diff;

  parts.push('```diff');
  parts.push(truncatedDiff);
  parts.push('```');

  return parts.join('\n');
}

function parseSemanticReviewResponse(content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');

  // Parse numbered list items
  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s*\[(error|warning|info)\]\s*([^:]+):\s*(.*)$/);
    if (match) {
      const [, severity, title, description] = match;
      findings.push({
        id: `review-${findings.length}`,
        toolId: 'pr-review',
        title: title.trim(),
        description: description.trim(),
        location: { filePath: '', startLine: 0, endLine: 0 },
        severity: severity as 'error' | 'warning' | 'info',
      });
    }
  }

  return findings;
}

// ─── Comment Formatting ────────────────────────────────────────────────────

function formatSummaryForComment(summary: PrReviewSummary): string {
  const parts: string[] = [];

  parts.push(`## PR Review Summary (PR #${summary.prNumber})`);
  parts.push('');
  parts.push(`- **Files Reviewed**: ${summary.filesReviewed}`);
  parts.push(`- **Total Findings**: ${summary.findingCount}`);

  if (summary.highlights.length > 0) {
    parts.push('');
    parts.push('### Key Issues');
    for (const highlight of summary.highlights) {
      parts.push(`- ${highlight}`);
    }
  }

  return parts.join('\n');
}
