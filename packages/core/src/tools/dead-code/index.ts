import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type {
  ToolId,
  ScanOptions,
  Finding,
  IModelProvider,
  SupportedLanguage,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { execGitStrict, getRepoRoot } from '../../git/executor.js';
import {
  TOOL_MAX_FILE_CONTENT_LENGTH,
  TOOL_MAX_FILES_PER_RUN,
} from '../../settings/defaults.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FILE_CONTENT_LENGTH = TOOL_MAX_FILE_CONTENT_LENGTH;
const MAX_FILES_PER_RUN = TOOL_MAX_FILES_PER_RUN;

/** Extension → language mapping */
const EXT_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
};

// ─── Static Analysis Patterns ───────────────────────────────────────────────
// These catch the obvious cases cheaply — no model needed.

interface StaticPattern {
  /** Human-readable name */
  name: string;
  /** Regex to detect the pattern */
  pattern: RegExp;
  /** Languages this pattern applies to */
  languages: SupportedLanguage[];
  /** Description template (use $1, $2 for capture groups) */
  description: string;
}

const STATIC_PATTERNS: StaticPattern[] = [
  {
    name: 'Unused import',
    pattern: /^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm,
    languages: ['typescript', 'javascript'],
    description: 'Import may be unused. Verify with your bundler or linter.',
  },
  {
    name: 'Empty export',
    pattern: /^export\s*\{\s*\};?\s*$/gm,
    languages: ['typescript', 'javascript'],
    description: 'Empty export statement — serves no purpose unless converting to a module.',
  },
  {
    name: 'Commented-out code block',
    pattern: /(?:\/\/\s*(?:const|let|var|function|class|import|export|if|for|while|return|async)\s+.+\n?){3,}/gm,
    languages: ['typescript', 'javascript'],
    description: 'Block of commented-out code. Consider removing — version control preserves history.',
  },
  {
    name: 'Commented-out code block (Python)',
    pattern: /(?:#\s*(?:def|class|import|from|if|for|while|return|async)\s+.+\n?){3,}/gm,
    languages: ['python'],
    description: 'Block of commented-out code. Consider removing — version control preserves history.',
  },
  {
    name: 'Unused variable pattern',
    pattern: /^\s*(?:const|let|var)\s+_\w+\s*=/gm,
    languages: ['typescript', 'javascript'],
    description: 'Variable prefixed with underscore suggests it is intentionally unused, but verify.',
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeadCodeToolDeps {
  /** Model provider for deeper analysis */
  modelProvider?: IModelProvider;
  /** Working directory */
  cwd: string;
  /** Languages to analyze */
  enabledLanguages: SupportedLanguage[];
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Dead Code Discovery tool.
 *
 * Two-phase approach:
 * 1. **Static analysis**: regex-based pattern matching for obvious dead code
 *    (commented-out blocks, empty exports, etc.) — fast and free.
 * 2. **Model synthesis**: send file contents to the model for deeper analysis
 *    (unused functions, unreachable branches, orphaned exports) — uses tokens.
 *
 * Phase 2 only runs if a model provider is available.
 */
export class DeadCodeTool extends BaseTool {
  readonly id: ToolId = 'dead-code';
  readonly name = 'Dead Code Discovery';
  readonly description = 'Find unused exports, unreachable code, unused files, and dead variables.';

  private deps: DeadCodeToolDeps | undefined;
  private scannedFileCount = 0;

  setDeps(deps: DeadCodeToolDeps): void {
    this.deps = deps;
  }

  protected override countScannedFiles(): number {
    return this.scannedFileCount;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('DeadCodeTool: Dependencies not set. Call setDeps() before execute().');
    }

    const { modelProvider, cwd, enabledLanguages } = this.deps;
    const repoRoot = await getRepoRoot(cwd);
    const findings: Finding[] = [];

    // Get files to scan
    const files = await getTrackedFiles(repoRoot, enabledLanguages, options.paths);
    this.scannedFileCount = files.length;

    if (files.length === 0) {
      findings.push(
        this.createFinding({
          title: 'No files to scan',
          description: 'No matching source files found for the configured languages.',
          location: { filePath: repoRoot, startLine: 0, endLine: 0 },
          severity: 'info',
        }),
      );
      return findings;
    }

    // Phase 1: Static analysis (fast, no model needed)
    for (const filePath of files) {
      this.throwIfCancelled(options);

      try {
        const fullPath = join(repoRoot, filePath);
        const content = await readFile(fullPath, 'utf-8');
        const ext = extname(filePath);
        const language = EXT_TO_LANGUAGE[ext];
        if (!language) continue;

        const staticFindings = runStaticPatterns(content, filePath, language);
        findings.push(...staticFindings.map((f) => this.createFinding(f)));
      } catch {
        // Skip files that can't be read
      }
    }

    // Phase 2: Model synthesis (deeper analysis, uses tokens)
    if (modelProvider) {
      // Process files in batches to stay within token limits
      const filesToAnalyze = files.slice(0, MAX_FILES_PER_RUN);

      const modelFindingsArrays = await this.processInBatches(
        filesToAnalyze,
        async (filePath) => {
          this.throwIfCancelled(options);
          
          try {
            const fullPath = join(repoRoot, filePath);
            const content = await readFile(fullPath, 'utf-8');
            if (content.length === 0) return [];
            
            const truncated = content.slice(0, MAX_FILE_CONTENT_LENGTH);
            const modelFindings = await analyzeWithModel(
              modelProvider,
              filePath,
              truncated,
              options,
              this,
            );
            return modelFindings.map((f) => this.createFinding(f));
          } catch (error) {
            return [
              this.createErrorFinding(filePath, error, 'Model analysis'),
            ];
          }
        },
      );

      findings.push(...modelFindingsArrays.flat());
    }

    return deduplicateFindings(findings);
  }
}

// ─── Static Analysis ────────────────────────────────────────────────────────

function runStaticPatterns(
  content: string,
  filePath: string,
  language: SupportedLanguage,
): Array<Omit<Finding, 'id' | 'toolId'>> {
  const findings: Array<Omit<Finding, 'id' | 'toolId'>> = [];

  for (const sp of STATIC_PATTERNS) {
    if (!sp.languages.includes(language)) continue;

    const regex = new RegExp(sp.pattern.source, sp.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const startLine = content.slice(0, match.index).split('\n').length;
      const matchLines = match[0].split('\n').length;

      findings.push({
        title: sp.name,
        description: sp.description,
        location: {
          filePath,
          startLine,
          endLine: startLine + matchLines - 1,
        },
        severity: 'warning',
        metadata: { source: 'static', pattern: sp.name },
      });
    }
  }

  return findings;
}

// ─── Model Analysis ─────────────────────────────────────────────────────────

const MODEL_SYSTEM_PROMPT = `You are a dead code detector. Analyze the source file and identify:
1. Unused functions/methods that are never called within this file or exported
2. Unused variables or constants
3. Unreachable code (after return/throw/break statements)
4. Unused imports (if you can determine they're not used in the file)
5. Dead conditional branches (conditions that are always true/false)

For each finding, output one line in this exact format:
TYPE|LINE_START|LINE_END|DESCRIPTION

TYPE is one of: UNUSED_FUNCTION, UNUSED_VARIABLE, UNREACHABLE, UNUSED_IMPORT, DEAD_BRANCH
LINE_START and LINE_END are 1-based line numbers.

Only report findings you are confident about. Do NOT report:
- Exported functions (they may be used elsewhere)
- Framework lifecycle methods (ngOnInit, useEffect callbacks, etc.)
- Decorator-annotated methods
- Test setup/teardown functions
If there are no findings, output: NONE`;

async function analyzeWithModel(
  provider: IModelProvider,
  filePath: string,
  content: string,
  options: ScanOptions,
  tool: DeadCodeTool,
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

const TYPE_TO_TITLE: Record<string, string> = {
  UNUSED_FUNCTION: 'Unused function',
  UNUSED_VARIABLE: 'Unused variable',
  UNREACHABLE: 'Unreachable code',
  UNUSED_IMPORT: 'Unused import',
  DEAD_BRANCH: 'Dead conditional branch',
};

function parseModelResponse(
  content: string,
  filePath: string,
): Array<Omit<Finding, 'id' | 'toolId'>> {
  if (content.trim() === 'NONE') return [];

  const findings: Array<Omit<Finding, 'id' | 'toolId'>> = [];

  for (const line of content.split('\n')) {
    const parts = line.split('|');
    if (parts.length < 4) continue;

    const [type, startStr, endStr, ...descParts] = parts;
    const trimmedType = type.trim();
    const title = TYPE_TO_TITLE[trimmedType];
    if (!title) continue;

    const startLine = parseInt(startStr.trim(), 10);
    const endLine = parseInt(endStr.trim(), 10);
    if (isNaN(startLine) || isNaN(endLine)) continue;

    findings.push({
      title,
      description: descParts.join('|').trim(),
      location: { filePath, startLine, endLine },
      severity: 'warning',
      metadata: { source: 'model', type: trimmedType },
    });
  }

  return findings;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get tracked files from git, filtered by language extensions.
 */
async function getTrackedFiles(
  cwd: string,
  languages: SupportedLanguage[],
  paths?: string[],
): Promise<string[]> {
  const validExts = new Set<string>();
  for (const [ext, lang] of Object.entries(EXT_TO_LANGUAGE)) {
    if (languages.includes(lang)) validExts.add(ext);
  }

  const args = ['ls-files', '--cached', '--others', '--exclude-standard'];
  if (paths && paths.length > 0) {
    args.push('--', ...paths);
  }

  const output = await execGitStrict({ cwd, args });
  return output
    .split('\n')
    .filter((f) => f.length > 0)
    .filter((f) => validExts.has(extname(f)))
    .slice(0, MAX_FILES_PER_RUN);
}

/**
 * Deduplicate findings that overlap in the same file and line range.
 * Prefers model findings over static ones (more specific).
 */
function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();

  for (const f of findings) {
    const key = `${f.location.filePath}:${String(f.location.startLine)}:${String(f.location.endLine)}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, f);
    } else if (
      existing.metadata?.source === 'static' &&
      f.metadata?.source === 'model'
    ) {
      // Model finding takes precedence
      seen.set(key, f);
    }
  }

  return Array.from(seen.values());
}
