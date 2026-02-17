# Implementation Plan: Top 5 Tool Improvements

**Status**: Ready for implementation  
**Target**: High-priority quick wins + one performance improvement  
**Estimated effort**: 3-5 days  
**Last updated**: 2026-02-13

---

## Overview

This plan covers the top 5 improvements identified in the tool validation analysis:

1. **File count tracking consistency** — Add accurate file counting to CommentsTool and DiffResolveTool
2. **Constants centralization** — Move all magic numbers to `packages/core/src/settings/defaults.ts`
3. **Better error reporting** — Replace silent failures with informative error findings
4. **Timeout handling** — Add timeouts to all model calls to prevent hangs
5. **Parallel processing** — Process files in parallel batches instead of sequentially

---

## 1. File Count Tracking Consistency

### Current State
- ✅ `DeadCodeTool` and `LintTool` track `scannedFileCount` and override `countScannedFiles()`
- ❌ `CommentsTool` and `DiffResolveTool` don't track file counts (report 0)

### Implementation

#### 1.1 CommentsTool
**File**: `packages/core/src/tools/comments/index.ts`

**Changes**:
```typescript
export class CommentsTool extends BaseTool {
  // ... existing code ...
  private scannedFileCount = 0;  // ADD THIS

  protected override countScannedFiles(): number {  // ADD THIS METHOD
    return this.scannedFileCount;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    // ... existing code ...
    
    // In the file scanning loop:
    for (const filePath of filePaths) {
      // ... existing code ...
      this.scannedFileCount++;  // ADD THIS
    }
    
    return findings;
  }
}
```

**Testing**:
- Run CommentsTool with multiple files → verify `filesScanned` matches input count
- Run with no files → verify `filesScanned` is 0
- Check result summary shows correct count

#### 1.2 DiffResolveTool
**File**: `packages/core/src/tools/diff-resolve/index.ts`

**Changes**:
```typescript
export class DiffResolveTool extends BaseTool {
  // ... existing code ...
  private scannedFileCount = 0;  // ADD THIS

  protected override countScannedFiles(): number {  // ADD THIS METHOD
    return this.scannedFileCount;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    // ... existing code ...
    
    // After getting conflict files:
    this.scannedFileCount = conflictPaths.length;  // ADD THIS
    
    // ... rest of implementation ...
  }
}
```

**Testing**:
- Create merge conflict with 3 files → verify `filesScanned` is 3
- Run with no conflicts → verify `filesScanned` is 0
- Check result summary shows correct count

### Acceptance Criteria
- ✅ Both tools report accurate file counts in `ScanResult.summary.filesScanned`
- ✅ Counts match actual files processed
- ✅ No regression in existing functionality
- ✅ Unit tests verify counting logic

### Estimated Effort
- **Time**: 1-2 hours
- **Files changed**: 2
- **Tests**: 2-3 new test cases

---

## 2. Constants Centralization

### Current State
Magic numbers scattered across tools:
- `MAX_FILE_CONTENT_LENGTH = 10_000` (dead-code, lint, comments)
- `MAX_FILES_PER_RUN = 200` (dead-code), `100` (lint)
- `MAX_DIFF_LINES = 500` (commit, branch-diff)
- `MAX_CONTEXT_LINES = 50` (diff-resolve)
- `MAX_COMMITS_FOR_PROMPT = 100` (tldr)
- `STALE_THRESHOLD_DAYS = 180` (comments)
- `DEFAULT_SINCE_DAYS = 14` (tldr)

### Implementation

#### 2.1 Create Constants Module
**File**: `packages/core/src/settings/defaults.ts` (extend existing)

**Add**:
```typescript
// ─── Tool Limits ──────────────────────────────────────────────────────────────

/** Maximum file content length to send to model (characters) */
export const TOOL_MAX_FILE_CONTENT_LENGTH = 10_000;

/** Maximum files to analyze per tool run (safety bound) */
export const TOOL_MAX_FILES_PER_RUN = 200;

/** Maximum diff lines to include in prompts/results */
export const TOOL_MAX_DIFF_LINES = 500;

/** Maximum context lines around conflicts for model prompts */
export const TOOL_MAX_CONTEXT_LINES = 50;

/** Maximum commits to include in TLDR prompt */
export const TOOL_MAX_COMMITS_FOR_PROMPT = 100;

/** Comments older than this (in days) are flagged as stale */
export const TOOL_STALE_COMMENT_THRESHOLD_DAYS = 180;

/** Default days to look back for TLDR summaries */
export const TOOL_DEFAULT_SINCE_DAYS = 14;

/** Batch size for parallel file processing */
export const TOOL_MODEL_BATCH_SIZE = 5;

/** Timeout for model requests (milliseconds) */
export const TOOL_MODEL_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for failed model calls */
export const TOOL_MODEL_MAX_RETRIES = 1;
```

#### 2.2 Update All Tools
Replace local constants with imports:

**DeadCodeTool** (`packages/core/src/tools/dead-code/index.ts`):
```typescript
import {
  TOOL_MAX_FILE_CONTENT_LENGTH,
  TOOL_MAX_FILES_PER_RUN,
} from '../../settings/defaults.js';

// Remove local constants, use imported ones
const MAX_FILE_CONTENT_LENGTH = TOOL_MAX_FILE_CONTENT_LENGTH;
const MAX_FILES_PER_RUN = TOOL_MAX_FILES_PER_RUN;
```

**LintTool** (`packages/core/src/tools/lint/index.ts`):
```typescript
import {
  TOOL_MAX_FILE_CONTENT_LENGTH,
  TOOL_MAX_FILES_PER_RUN,
} from '../../settings/defaults.js';

const MAX_FILE_CONTENT_LENGTH = TOOL_MAX_FILE_CONTENT_LENGTH;
const MAX_FILES_PER_RUN = TOOL_MAX_FILES_PER_RUN;
```

**CommentsTool** (`packages/core/src/tools/comments/index.ts`):
```typescript
import {
  TOOL_MAX_FILE_CONTENT_LENGTH,
  TOOL_STALE_COMMENT_THRESHOLD_DAYS,
} from '../../settings/defaults.js';

const MAX_FILE_CONTENT_LENGTH = TOOL_MAX_FILE_CONTENT_LENGTH;
const STALE_THRESHOLD_DAYS = TOOL_STALE_COMMENT_THRESHOLD_DAYS;
```

**CommitTool** (`packages/core/src/tools/commit/index.ts`):
```typescript
import { TOOL_MAX_DIFF_LINES } from '../../settings/defaults.js';

const MAX_DIFF_LINES = TOOL_MAX_DIFF_LINES;
```

**TldrTool** (`packages/core/src/tools/tldr/index.ts`):
```typescript
import {
  TOOL_MAX_COMMITS_FOR_PROMPT,
  TOOL_DEFAULT_SINCE_DAYS,
} from '../../settings/defaults.js';

const MAX_COMMITS_FOR_PROMPT = TOOL_MAX_COMMITS_FOR_PROMPT;
const DEFAULT_SINCE_DAYS = TOOL_DEFAULT_SINCE_DAYS;
```

**BranchDiffTool** (`packages/core/src/tools/branch-diff/index.ts`):
```typescript
import { TOOL_MAX_DIFF_LINES } from '../../settings/defaults.js';

const MAX_DIFF_LINES = TOOL_MAX_DIFF_LINES;
```

**DiffResolveTool** (`packages/core/src/tools/diff-resolve/index.ts`):
```typescript
import { TOOL_MAX_CONTEXT_LINES } from '../../settings/defaults.js';

const MAX_CONTEXT_LINES = TOOL_MAX_CONTEXT_LINES;
```

### Testing
- ✅ All tools compile without errors
- ✅ No behavior changes (same limits applied)
- ✅ Constants are accessible from defaults.ts
- ✅ ESLint no-magic-numbers rule passes

### Acceptance Criteria
- ✅ All magic numbers moved to defaults.ts
- ✅ All tools import from centralized location
- ✅ No duplicate constant definitions
- ✅ Constants are exported and documented

### Estimated Effort
- **Time**: 2-3 hours
- **Files changed**: 8 (1 new section in defaults.ts + 7 tools)
- **Tests**: Verify imports work, no behavior changes

---

## 3. Better Error Reporting

### Current State
Silent failures in model calls:
```typescript
catch {
  // Skip files that fail model analysis
}
```

Users don't know:
- Which files failed
- Why they failed
- How many files failed

### Implementation

#### 3.1 Create Error Finding Helper
**File**: `packages/core/src/tools/base-tool.ts`

**Add helper method**:
```typescript
/**
 * Create a standardized error finding for tool execution failures.
 */
protected createErrorFinding(
  filePath: string,
  error: unknown,
  context?: string,
): Finding {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const title = context
    ? `${context} failed: ${filePath}`
    : `Analysis failed: ${filePath}`;
  
  return this.createFinding({
    title,
    description: `Error: ${errorMessage}`,
    location: { filePath, startLine: 0, endLine: 0 },
    severity: 'warning',
    metadata: {
      errorType: 'tool_execution_failure',
      errorMessage,
      context: context ?? 'unknown',
    },
  });
}
```

#### 3.2 Update DeadCodeTool
**File**: `packages/core/src/tools/dead-code/index.ts`

**Change**:
```typescript
// Before:
} catch {
  // Skip files that fail model analysis
}

// After:
} catch (error) {
  findings.push(
    this.createErrorFinding(filePath, error, 'Model analysis'),
  );
  // Continue with next file
}
```

#### 3.3 Update LintTool
**File**: `packages/core/src/tools/lint/index.ts`

**Change**:
```typescript
// Before:
} catch {
  // Skip files that fail model analysis
}

// After:
} catch (error) {
  findings.push(
    this.createErrorFinding(filePath, error, 'Model-driven analysis'),
  );
  // Continue with next file
}
```

#### 3.4 Update CommentsTool
**File**: `packages/core/src/tools/comments/index.ts`

**Already has error handling**, but improve it:
```typescript
// Current:
} catch (error) {
  findings.push(
    this.createFinding({
      title: `Error analyzing ${filePath}`,
      description: error instanceof Error ? error.message : String(error),
      // ...
    }),
  );
}

// Keep as-is (already good), but could use createErrorFinding helper
```

#### 3.5 Update DiffResolveTool
**File**: `packages/core/src/tools/diff-resolve/index.ts`

**Change**:
```typescript
// In resolveWithModel function:
} catch (error) {
  // Model failed — fall back to theirs
  // ADD: Log the error for debugging
  console.error(`DiffResolveTool: Model resolution failed for ${filePath} hunk ${hunkIndex}:`, error);
  
  return {
    filePath,
    hunkIndex,
    resolvedContent: hunk.theirs,
    strategy: 'theirs',
    confidence: 'low',
    // ADD: Include error info in metadata
    error: error instanceof Error ? error.message : String(error),
  };
}
```

**Also add error finding in main loop**:
```typescript
// When model resolution fails, add a finding
if (modelResolution.error) {
  findings.push(
    this.createErrorFinding(
      filePath,
      new Error(modelResolution.error),
      `Model resolution for hunk ${hunkIndex + 1}`,
    ),
  );
}
```

#### 3.6 Update TldrTool
**File**: `packages/core/src/tools/tldr/index.ts`

**Already has error handling** — keep as-is (good example).

### Testing
- ✅ Simulate model failures (network error, timeout, invalid response)
- ✅ Verify error findings are created
- ✅ Verify tool continues processing other files
- ✅ Verify error messages are informative
- ✅ Check error metadata is populated

### Acceptance Criteria
- ✅ No silent failures — all errors create findings
- ✅ Error messages are clear and actionable
- ✅ Tools continue processing after errors
- ✅ Error metadata includes context (file, operation type)
- ✅ Console logs for debugging (non-user-facing)

### Estimated Effort
- **Time**: 3-4 hours
- **Files changed**: 5 tools + base-tool.ts
- **Tests**: Error simulation tests for each tool

---

## 4. Timeout Handling

### Current State
Model calls can hang indefinitely if:
- Network is slow/unresponsive
- Model provider is down
- Response is never sent

No timeout mechanism exists.

### Implementation

#### 4.1 Create Timeout Helper
**File**: `packages/core/src/tools/base-tool.ts`

**Add helper method**:
```typescript
import { TOOL_MODEL_TIMEOUT_MS } from '../settings/defaults.js';

/**
 * Wrap a model request with timeout handling.
 * Creates an AbortController that cancels after TOOL_MODEL_TIMEOUT_MS.
 */
protected async sendRequestWithTimeout<T>(
  requestFn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = TOOL_MODEL_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const result = await requestFn(controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (controller.signal.aborted) {
      throw new Error(`Model request timed out after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}
```

#### 4.2 Update DeadCodeTool
**File**: `packages/core/src/tools/dead-code/index.ts`

**Change**:
```typescript
async function analyzeWithModel(
  provider: IModelProvider,
  filePath: string,
  content: string,
  options: ScanOptions,
): Promise<Array<Omit<Finding, 'id' | 'toolId'>>> {
  // Create combined signal (user cancellation + timeout)
  const combinedSignal = AbortSignal.any([
    options.signal ?? new AbortController().signal,
    // Timeout handled by sendRequestWithTimeout
  ]);

  const response = await this.sendRequestWithTimeout(
    async (timeoutSignal) => {
      // Merge signals
      const mergedSignal = AbortSignal.any([options.signal, timeoutSignal]);
      return provider.sendRequest({
        role: 'tool',
        messages: [
          { role: 'system', content: MODEL_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `File: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``,
          },
        ],
        signal: mergedSignal,
      });
    },
  );

  return parseModelResponse(response.content, filePath);
}
```

**Actually, better approach** — make it simpler:
```typescript
async function analyzeWithModel(
  provider: IModelProvider,
  filePath: string,
  content: string,
  options: ScanOptions,
  tool: DeadCodeTool, // Pass tool instance for timeout helper
): Promise<Array<Omit<Finding, 'id' | 'toolId'>>> {
  const response = await tool.sendRequestWithTimeout(
    async (timeoutSignal) => {
      // Merge user signal with timeout signal
      const mergedSignal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
        
      return provider.sendRequest({
        role: 'tool',
        messages: [
          { role: 'system', content: MODEL_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `File: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``,
          },
        ],
        signal: mergedSignal,
      });
    },
  );

  return parseModelResponse(response.content, filePath);
}
```

**Update call site**:
```typescript
const modelFindings = await analyzeWithModel(
  modelProvider,
  filePath,
  truncated,
  options,
  this, // Pass tool instance
);
```

#### 4.3 Update LintTool
**File**: `packages/core/src/tools/lint/index.ts`

**Similar changes** — update `analyzeWithModel` to accept tool instance and use `sendRequestWithTimeout`.

#### 4.4 Update CommentsTool
**File**: `packages/core/src/tools/comments/index.ts`

**Update `evaluateWithModel`** to use timeout helper.

#### 4.5 Update DiffResolveTool
**File**: `packages/core/src/tools/diff-resolve/index.ts`

**Update `resolveWithModel`** to use timeout helper.

#### 4.6 Update CommitTool
**File**: `packages/core/src/tools/commit/index.ts`

**Update model call in `runPropose`** to use timeout helper.

#### 4.7 Update TldrTool
**File**: `packages/core/src/tools/tldr/index.ts`

**Update model call** to use timeout helper.

### Testing
- ✅ Simulate slow network (delay response)
- ✅ Verify timeout triggers after 30 seconds
- ✅ Verify timeout error is thrown and handled
- ✅ Verify user cancellation still works
- ✅ Test timeout + cancellation together
- ✅ Verify timeout doesn't affect successful requests

### Acceptance Criteria
- ✅ All model calls have timeout protection
- ✅ Timeout is configurable (via constant)
- ✅ Timeout errors are caught and reported
- ✅ User cancellation still works
- ✅ No performance impact on normal requests

### Estimated Effort
- **Time**: 4-5 hours
- **Files changed**: base-tool.ts + 6 tools
- **Tests**: Timeout simulation tests

---

## 5. Parallel Processing

### Current State
Files processed sequentially:
```typescript
for (const filePath of files) {
  await analyzeWithModel(...); // One at a time
}
```

For 100 files, this is 100x slower than necessary (if model supports concurrency).

### Implementation

#### 5.1 Create Batch Processing Helper
**File**: `packages/core/src/tools/base-tool.ts`

**Add helper method**:
```typescript
import { TOOL_MODEL_BATCH_SIZE } from '../settings/defaults.js';

/**
 * Process items in parallel batches to avoid overwhelming the system.
 * 
 * @param items Array of items to process
 * @param processor Async function to process each item
 * @param batchSize Number of items to process concurrently (default: TOOL_MODEL_BATCH_SIZE)
 * @returns Array of results in same order as items
 */
protected async processInBatches<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number = TOOL_MODEL_BATCH_SIZE,
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) => processor(item, i + batchIndex)),
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

#### 5.2 Update DeadCodeTool
**File**: `packages/core/src/tools/dead-code/index.ts`

**Change**:
```typescript
// Before:
for (const filePath of filesToAnalyze) {
  this.throwIfCancelled(options);
  try {
    const fullPath = join(repoRoot, filePath);
    const content = await readFile(fullPath, 'utf-8');
    if (content.length === 0) continue;
    
    const truncated = content.slice(0, MAX_FILE_CONTENT_LENGTH);
    const modelFindings = await analyzeWithModel(
      modelProvider,
      filePath,
      truncated,
      options,
      this,
    );
    findings.push(...modelFindings.map((f) => this.createFinding(f)));
  } catch (error) {
    findings.push(
      this.createErrorFinding(filePath, error, 'Model analysis'),
    );
  }
}

// After:
const modelFindings = await this.processInBatches(
  filesToAnalyze,
  async (filePath, index) => {
    this.throwIfCancelled(options);
    
    try {
      const fullPath = join(repoRoot, filePath);
      const content = await readFile(fullPath, 'utf-8');
      if (content.length === 0) return [];
      
      const truncated = content.slice(0, MAX_FILE_CONTENT_LENGTH);
      const findings = await analyzeWithModel(
        modelProvider,
        filePath,
        truncated,
        options,
        this,
      );
      return findings.map((f) => this.createFinding(f));
    } catch (error) {
      return [
        this.createErrorFinding(filePath, error, 'Model analysis'),
      ];
    }
  },
);

findings.push(...modelFindings.flat());
```

#### 5.3 Update LintTool
**File**: `packages/core/src/tools/lint/index.ts`

**Similar changes** — use `processInBatches` for model analysis phase.

#### 5.4 Update CommentsTool
**File**: `packages/core/src/tools/comments/index.ts`

**Note**: CommentsTool processes files sequentially because it needs to evaluate comments per-file. However, we can parallelize the model evaluation within each file if there are many comments.

**For now**: Keep sequential (file-level parallelism may not help much here).

#### 5.5 Consider Rate Limiting
**File**: `packages/core/src/tools/base-tool.ts`

**Add optional rate limiting**:
```typescript
/**
 * Rate limiter for model calls to avoid hitting API limits.
 */
private rateLimiter: { lastCall: number; minInterval: number } | undefined;

protected setRateLimit(minIntervalMs: number): void {
  this.rateLimiter = {
    lastCall: 0,
    minInterval: minIntervalMs,
  };
}

protected async waitForRateLimit(): Promise<void> {
  if (!this.rateLimiter) return;
  
  const now = Date.now();
  const timeSinceLastCall = now - this.rateLimiter.lastCall;
  
  if (timeSinceLastCall < this.rateLimiter.minInterval) {
    await new Promise((resolve) =>
      setTimeout(resolve, this.rateLimiter.minInterval - timeSinceLastCall),
    );
  }
  
  this.rateLimiter.lastCall = Date.now();
}
```

**Use in processInBatches**:
```typescript
protected async processInBatches<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number = TOOL_MODEL_BATCH_SIZE,
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchPromises = batch.map(async (item, batchIndex) => {
      await this.waitForRateLimit(); // Rate limit per item
      return processor(item, i + batchIndex);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}
```

### Testing
- ✅ Process 20 files with batch size 5 → verify 4 batches
- ✅ Verify results are in correct order
- ✅ Verify cancellation works mid-batch
- ✅ Test with batch size 1 (should behave like sequential)
- ✅ Test with batch size > file count (should process all at once)
- ✅ Verify error handling (one failure doesn't stop batch)
- ✅ Measure performance improvement (should be ~batchSize faster)

### Acceptance Criteria
- ✅ Files processed in parallel batches
- ✅ Batch size is configurable (via constant)
- ✅ Results maintain input order
- ✅ Errors don't stop batch processing
- ✅ Cancellation works correctly
- ✅ Performance improvement measurable (2-5x faster for large scans)

### Estimated Effort
- **Time**: 4-6 hours
- **Files changed**: base-tool.ts + 2-3 tools
- **Tests**: Batch processing tests, performance benchmarks

---

## Implementation Order

### Day 1 (4-5 hours)
1. ✅ File count tracking (#1) — 1-2 hours
2. ✅ Constants centralization (#2) — 2-3 hours

### Day 2 (6-7 hours)
3. ✅ Better error reporting (#3) — 3-4 hours
4. ✅ Timeout handling (#4) — 4-5 hours (start)

### Day 3 (4-5 hours)
5. ✅ Timeout handling (#4) — finish
6. ✅ Parallel processing (#5) — 4-6 hours

**Total**: ~15-17 hours (2-3 days)

---

## Testing Strategy

### Unit Tests
- File counting logic
- Error finding creation
- Timeout behavior
- Batch processing order/errors

### Integration Tests
- End-to-end tool runs with errors
- Timeout scenarios
- Parallel processing with real model calls
- Cancellation during parallel processing

### Manual Testing
- Run each tool on real codebase
- Verify error messages are helpful
- Verify timeouts work
- Measure performance improvement

---

## Rollout Plan

1. **Phase 1**: Implement #1 and #2 (low risk, high value)
2. **Phase 2**: Implement #3 and #4 (error handling + timeouts)
3. **Phase 3**: Implement #5 (parallel processing — test thoroughly)

Each phase:
- ✅ Code review
- ✅ Unit tests pass
- ✅ Manual testing
- ✅ Merge to main
- ✅ Monitor for issues

---

## Success Metrics

- ✅ File counts accurate in all tools
- ✅ Zero silent failures (all errors reported)
- ✅ No hanging model calls (timeouts work)
- ✅ 2-5x performance improvement for large scans
- ✅ No regressions in existing functionality

---

## Notes

- All changes are backward compatible
- Constants can be made configurable later (settings)
- Parallel processing batch size can be tuned based on provider limits
- Timeout value may need adjustment based on real-world usage
- Consider adding progress reporting in future (not in this plan)
