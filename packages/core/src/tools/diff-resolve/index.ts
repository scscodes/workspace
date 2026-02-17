import type {
  ToolId,
  ScanOptions,
  Finding,
  IModelProvider,
  ConflictResolution,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { getRepoRoot } from '../../git/executor.js';
import {
  isInConflictState,
  getConflictFiles,
  readConflictFile,
  writeResolution,
} from '../../git/conflicts.js';
import type { ConflictHunk } from '../../git/conflicts.js';
import { TOOL_MAX_CONTEXT_LINES } from '../../settings/defaults.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CONTEXT_LINES = TOOL_MAX_CONTEXT_LINES;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Dependencies injected into the DiffResolveTool.
 */
export interface DiffResolveToolDeps {
  /** Model provider for LLM-assisted resolution */
  modelProvider: IModelProvider;
  /** Working directory (repo root) */
  cwd: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Diff Resolve tool.
 *
 * Detects merge/rebase conflicts, classifies them, and proposes resolutions:
 * - Safe conflicts (one side empty, whitespace-only) → auto-resolvable
 * - Complex conflicts (overlapping edits) → model-assisted resolution
 *
 * All resolutions are proposals — applied only after user approval.
 */
export class DiffResolveTool extends BaseTool {
  readonly id: ToolId = 'diff-resolve';
  readonly name = 'Diff Resolver';
  readonly description = 'Detect and resolve merge conflicts. Auto-resolves safe diffs, escalates complex ones.';

  private deps: DiffResolveToolDeps | undefined;
  private scannedFileCount = 0;

  /**
   * Set dependencies. Must be called before execute().
   */
  setDeps(deps: DiffResolveToolDeps): void {
    this.deps = deps;
  }

  protected override countScannedFiles(): number {
    return this.scannedFileCount;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('DiffResolveTool: Dependencies not set. Call setDeps() before execute().');
    }

    const { modelProvider, cwd } = this.deps;
    const findings: Finding[] = [];
    const autoApplySafe = (options.args?.autoApplySafe as boolean | undefined) ?? false;

    // Phase 1: Check conflict state
    this.throwIfCancelled(options);
    const repoRoot = await getRepoRoot(cwd);

    const inConflict = await isInConflictState(repoRoot);
    if (!inConflict) {
      findings.push(
        this.createFinding({
          title: 'No conflict state',
          description: 'Repository is not in a merge, rebase, or cherry-pick state. No conflicts to resolve.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    // Phase 2: Get conflicted files
    this.throwIfCancelled(options);
    let conflictPaths = await getConflictFiles(repoRoot);

    if (conflictPaths.length === 0) {
      findings.push(
        this.createFinding({
          title: 'No unresolved conflicts',
          description: 'All merge conflicts have been resolved.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    // Filter to specific paths if requested
    const targetPaths = options.paths ?? options.args?.paths as string[] | undefined;
    if (targetPaths && targetPaths.length > 0) {
      conflictPaths = conflictPaths.filter((p) => targetPaths.includes(p));
    }

    this.scannedFileCount = conflictPaths.length;

    // Phase 3: Parse and classify conflicts
    const allResolutions: ConflictResolution[] = [];

    for (const filePath of conflictPaths) {
      this.throwIfCancelled(options);

      const conflictFile = await readConflictFile(repoRoot, filePath);

      if (conflictFile.hunks.length === 0) {
        findings.push(
          this.createFinding({
            title: `No conflict markers in ${filePath}`,
            description: 'File is listed as unmerged but contains no conflict markers.',
            location: { filePath, startLine: 0, endLine: 0 },
            severity: 'info',
          }),
        );
        continue;
      }

      findings.push(
        this.createFinding({
          title: `${filePath}: ${String(conflictFile.hunks.length)} conflict(s)`,
          description: `Found ${String(conflictFile.hunks.length)} conflict section(s) to resolve.`,
          location: { filePath, startLine: conflictFile.hunks[0].startLine, endLine: conflictFile.hunks[0].endLine },
          severity: 'warning',
          metadata: { conflictFile },
        }),
      );

      // Classify and resolve each hunk
      for (let hunkIndex = 0; hunkIndex < conflictFile.hunks.length; hunkIndex++) {
        this.throwIfCancelled(options);
        const hunk = conflictFile.hunks[hunkIndex];
        const resolution = classifySafeResolution(filePath, hunkIndex, hunk);

        if (resolution) {
          // Safe resolution found
          allResolutions.push(resolution);

          findings.push(
            this.createFinding({
              title: `Safe resolution: ${filePath} hunk ${String(hunkIndex + 1)}`,
              description: `Strategy: ${resolution.strategy} (${resolution.confidence} confidence)`,
              location: { filePath, startLine: hunk.startLine, endLine: hunk.endLine },
              severity: 'info',
              metadata: { resolution },
            }),
          );

          if (autoApplySafe) {
            await writeResolution(repoRoot, filePath, resolution.resolvedContent);
            findings.push(
              this.createFinding({
                title: `Auto-applied: ${filePath} hunk ${String(hunkIndex + 1)}`,
                description: 'Safe resolution was automatically applied.',
                location: { filePath, startLine: hunk.startLine, endLine: hunk.endLine },
                severity: 'info',
              }),
            );
          }
        } else {
          // Complex conflict — use model
          const modelResolution = await resolveWithModel(
            modelProvider,
            filePath,
            hunkIndex,
            hunk,
            this,
            options,
          );

          allResolutions.push(modelResolution);

          // Create error finding if model failed
          if (modelResolution.error) {
            findings.push(
              this.createErrorFinding(
                filePath,
                new Error(modelResolution.error),
                `Model resolution for hunk ${hunkIndex + 1}`,
              ),
            );
          }

          findings.push(
            this.createFinding({
              title: `Model resolution: ${filePath} hunk ${String(hunkIndex + 1)}`,
              description: `Strategy: ${modelResolution.strategy} (${modelResolution.confidence} confidence). Requires review.`,
              location: { filePath, startLine: hunk.startLine, endLine: hunk.endLine },
              severity: 'warning',
              metadata: { resolution: modelResolution },
            }),
          );
        }
      }
    }

    // Summary finding
    const safeCount = allResolutions.filter((r) => r.confidence === 'high').length;
    const complexCount = allResolutions.length - safeCount;

    findings.push(
      this.createFinding({
        title: 'Conflict resolution summary',
        description: `${String(allResolutions.length)} total conflict(s): ${String(safeCount)} safe, ${String(complexCount)} require review.`,
        location: { filePath: repoRoot, startLine: 0, endLine: 0 },
        severity: complexCount > 0 ? 'warning' : 'info',
        metadata: { resolutions: allResolutions },
      }),
    );

    return findings;
  }
}

// ─── Conflict Classification ────────────────────────────────────────────────

/**
 * Attempt to classify a conflict hunk as safely resolvable.
 *
 * Safe cases:
 * - One side is empty (pure addition from one branch)
 * - Both sides are identical (no real conflict)
 * - Difference is only whitespace
 */
function classifySafeResolution(
  filePath: string,
  hunkIndex: number,
  hunk: ConflictHunk,
): ConflictResolution | null {
  const oursNorm = hunk.ours.trim();
  const theirsNorm = hunk.theirs.trim();

  // Both sides identical — no real conflict
  if (oursNorm === theirsNorm) {
    return {
      filePath,
      hunkIndex,
      resolvedContent: hunk.ours,
      strategy: 'merged',
      confidence: 'high',
    };
  }

  // One side is empty — pure addition
  if (oursNorm.length === 0) {
    return {
      filePath,
      hunkIndex,
      resolvedContent: hunk.theirs,
      strategy: 'theirs',
      confidence: 'high',
    };
  }

  if (theirsNorm.length === 0) {
    return {
      filePath,
      hunkIndex,
      resolvedContent: hunk.ours,
      strategy: 'ours',
      confidence: 'high',
    };
  }

  // Whitespace-only difference
  if (normalizeWhitespace(hunk.ours) === normalizeWhitespace(hunk.theirs)) {
    // Prefer theirs (incoming) for whitespace normalization
    return {
      filePath,
      hunkIndex,
      resolvedContent: hunk.theirs,
      strategy: 'merged',
      confidence: 'high',
    };
  }

  // Not safely resolvable
  return null;
}

/**
 * Normalize whitespace for comparison: collapse runs of whitespace to single space.
 */
function normalizeWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

// ─── Model-Assisted Resolution ──────────────────────────────────────────────

const RESOLVE_SYSTEM_PROMPT = `You are a merge conflict resolver. Given two sides of a merge conflict, produce the resolved code.

Rules:
- Output ONLY the resolved code, no explanations, no markdown fences
- Integrate changes from both sides when they don't overlap
- If changes fundamentally conflict, prefer the incoming ("theirs") side but preserve intent from both
- Maintain consistent code style and indentation
- Never introduce new code that wasn't in either side`;

/**
 * Use the model to resolve a complex conflict hunk.
 */
async function resolveWithModel(
  modelProvider: IModelProvider,
  filePath: string,
  hunkIndex: number,
  hunk: ConflictHunk,
  tool: DiffResolveTool,
  options: ScanOptions,
): Promise<ConflictResolution> {
  const prompt = buildResolvePrompt(filePath, hunk);

  try {
    const response = await tool.sendRequestWithTimeout(
      async (timeoutSignal) => {
        // Merge user signal with timeout signal
        const mergedSignal = options.signal
          ? AbortSignal.any([options.signal, timeoutSignal])
          : timeoutSignal;
          
        return modelProvider.sendRequest({
          role: 'tool',
          messages: [
            { role: 'system', content: RESOLVE_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          signal: mergedSignal,
        });
      },
    );

    const resolvedContent = response.content.trim();

    // Determine confidence based on how similar the result is to one side
    const confidence = assessConfidence(hunk, resolvedContent);

    return {
      filePath,
      hunkIndex,
      resolvedContent,
      strategy: 'model',
      confidence,
    };
  } catch (error) {
    // Model failed — fall back to theirs, but log error
    console.error(`DiffResolveTool: Model resolution failed for ${filePath} hunk ${hunkIndex}:`, error);
    
    return {
      filePath,
      hunkIndex,
      resolvedContent: hunk.theirs,
      strategy: 'theirs',
      confidence: 'low',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build the prompt for model-assisted conflict resolution.
 */
function buildResolvePrompt(filePath: string, hunk: ConflictHunk): string {
  const parts: string[] = [];

  parts.push(`File: ${filePath} (lines ${String(hunk.startLine)}-${String(hunk.endLine)})`);
  parts.push('');
  parts.push(`## Current branch (${hunk.oursLabel || 'ours'})`);
  parts.push('```');
  parts.push(truncateContent(hunk.ours));
  parts.push('```');
  parts.push('');
  parts.push(`## Incoming branch (${hunk.theirsLabel || 'theirs'})`);
  parts.push('```');
  parts.push(truncateContent(hunk.theirs));
  parts.push('```');
  parts.push('');
  parts.push('Resolve this conflict by merging both changes. Output only the resolved code.');

  return parts.join('\n');
}

/**
 * Truncate content to a reasonable size for the model prompt.
 */
function truncateContent(content: string): string {
  const lines = content.split('\n');
  if (lines.length <= MAX_CONTEXT_LINES) return content;

  return lines.slice(0, MAX_CONTEXT_LINES).join('\n') +
    `\n... (${String(lines.length - MAX_CONTEXT_LINES)} more lines)`;
}

/**
 * Assess how confident we are in the model's resolution.
 *
 * High: result is identical to one side (model picked a side)
 * Medium: result shares significant overlap with both sides
 * Low: result diverges significantly from both
 */
function assessConfidence(
  hunk: ConflictHunk,
  resolved: string,
): 'high' | 'medium' | 'low' {
  const resolvedNorm = normalizeWhitespace(resolved);
  const oursNorm = normalizeWhitespace(hunk.ours);
  const theirsNorm = normalizeWhitespace(hunk.theirs);

  // Identical to one side — high confidence
  if (resolvedNorm === oursNorm || resolvedNorm === theirsNorm) {
    return 'high';
  }

  // Contains significant parts of both — medium
  const oursWords = new Set(oursNorm.split(' '));
  const theirsWords = new Set(theirsNorm.split(' '));
  const resolvedWords = resolvedNorm.split(' ');

  let oursOverlap = 0;
  let theirsOverlap = 0;
  for (const word of resolvedWords) {
    if (oursWords.has(word)) oursOverlap++;
    if (theirsWords.has(word)) theirsOverlap++;
  }

  const totalWords = resolvedWords.length;
  if (totalWords === 0) return 'low';

  const OVERLAP_THRESHOLD = 0.5;
  const overlapRatio = Math.max(oursOverlap, theirsOverlap) / totalWords;

  if (overlapRatio > OVERLAP_THRESHOLD) {
    return 'medium';
  }

  return 'low';
}
