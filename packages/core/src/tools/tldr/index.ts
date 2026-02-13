import type {
  ToolId,
  ScanOptions,
  Finding,
  IModelProvider,
  TldrSummary,
  TldrHighlight,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { getLog } from '../../git/log.js';
import type { GitLogEntry } from '../../git/log.js';
import { getRepoRoot } from '../../git/executor.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default: summarize last 2 weeks of changes */
const DEFAULT_SINCE_DAYS = 14;

/** Max commits to feed to the model */
const MAX_COMMITS_FOR_PROMPT = 100;

/** ms per day */
const MS_PER_DAY = 86_400_000;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Dependencies injected into the TldrTool.
 */
export interface TldrToolDeps {
  /** Model provider for generating summaries */
  modelProvider: IModelProvider;
  /** Working directory */
  cwd: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * TLDR tool — summarize recent changes.
 *
 * Flow:
 * 1. Determine scope from ScanOptions paths
 * 2. Fetch git log for the scope
 * 3. Build a prompt with commit subjects and changed files
 * 4. Model generates a summary with highlights
 * 5. Parse model output into structured TldrSummary
 *
 * Granularity is adaptive — more commits = higher-level summary,
 * fewer commits = more detail per change.
 */
export class TldrTool extends BaseTool {
  readonly id: ToolId = 'tldr';
  readonly name = 'TLDR';
  readonly description = 'Summarize recent changes for a file, directory, or project.';

  private deps: TldrToolDeps | undefined;

  setDeps(deps: TldrToolDeps): void {
    this.deps = deps;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('TldrTool: Dependencies not set. Call setDeps() before execute().');
    }

    const { modelProvider, cwd } = this.deps;
    const findings: Finding[] = [];

    const repoRoot = await getRepoRoot(cwd);
    const scope = options.paths && options.paths.length > 0 ? options.paths.join(', ') : 'project';
    const since = new Date(Date.now() - DEFAULT_SINCE_DAYS * MS_PER_DAY);

    // Phase 1: Fetch git log
    this.throwIfCancelled(options);
    const entries = await getLog({
      cwd: repoRoot,
      since,
      maxCount: MAX_COMMITS_FOR_PROMPT,
      paths: options.paths,
      includeFiles: true,
    });

    if (entries.length === 0) {
      findings.push(
        this.createFinding({
          title: 'No recent changes',
          description: `No commits found for "${scope}" in the last ${String(DEFAULT_SINCE_DAYS)} days.`,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    // Phase 2: Build prompt and call model
    this.throwIfCancelled(options);
    const prompt = buildTldrPrompt(entries, scope, since);

    let response;
    try {
      response = await modelProvider.sendRequest({
        role: 'chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        signal: options.signal,
      });
    } catch (error) {
      findings.push(
        this.createFinding({
          title: 'TLDR failed',
          description: `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'error',
        }),
      );
      return findings;
    }

    // Phase 3: Parse model response into structured summary
    this.throwIfCancelled(options);
    const summary = parseTldrResponse(response.content, entries, scope, since);

    // Store summary as a finding with metadata
    findings.push(
      this.createFinding({
        title: `TLDR: ${scope}`,
        description: summary.summary,
        location: { filePath: repoRoot, startLine: 0, endLine: 0 },
        severity: 'info',
        metadata: {
          summary,
          commitCount: entries.length,
          since: since.toISOString(),
        },
      }),
    );

    return findings;
  }
}

// ─── Prompt Construction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a change summarizer. Given a git log with commit subjects and changed files, produce a clear, concise summary of what changed.

Rules:
- Start with a 1-2 sentence high-level summary
- Then list 3-7 key highlights, each on its own line prefixed with "- "
- Each highlight should describe WHAT changed and WHY (infer intent from commit messages)
- Group related changes together rather than listing every commit
- Use present tense ("Adds authentication", "Fixes layout bug")
- If the scope is a specific file/directory, focus on that area
- Keep it brief — this is a TLDR, not a changelog`;

function buildTldrPrompt(
  entries: GitLogEntry[],
  scope: string,
  since: Date,
): string {
  const parts: string[] = [];

  parts.push(`Summarize recent changes for: **${scope}**`);
  parts.push(`Period: ${since.toISOString().split('T')[0]} to today`);
  parts.push(`Total commits: ${String(entries.length)}`);
  parts.push('');

  parts.push('## Commits (newest first)');
  parts.push('');

  for (const entry of entries) {
    const date = entry.timestamp.toISOString().split('T')[0];
    const files = entry.files && entry.files.length > 0 ? ` [${entry.files.join(', ')}]` : '';
    parts.push(`- ${date} | ${entry.subject}${files}`);
  }

  return parts.join('\n');
}

// ─── Response Parsing ───────────────────────────────────────────────────────

function parseTldrResponse(
  content: string,
  entries: GitLogEntry[],
  scope: string,
  since: Date,
): TldrSummary {
  const lines = content.trim().split('\n');

  // First non-empty lines before bullet points = summary
  const summaryLines: string[] = [];
  const highlightLines: string[] = [];
  let inHighlights = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inHighlights = true;
      highlightLines.push(trimmed.slice(2).trim());
    } else if (!inHighlights && trimmed.length > 0) {
      summaryLines.push(trimmed);
    }
  }

  // Collect all files mentioned across commits
  const allFiles = new Set<string>();
  const allCommits = new Set<string>();
  for (const entry of entries) {
    allCommits.add(entry.hash);
    if (entry.files) {
      for (const f of entry.files) allFiles.add(f);
    }
  }

  const highlights: TldrHighlight[] = highlightLines.map((desc) => ({
    description: desc,
    files: [], // Could be enriched by matching file names in the description
    commits: [],
  }));

  return {
    scope,
    since,
    until: new Date(),
    commitCount: entries.length,
    summary: summaryLines.join(' ') || content.trim(),
    highlights,
  };
}
