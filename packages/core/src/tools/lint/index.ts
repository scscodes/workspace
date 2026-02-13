import { join, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type {
  ToolId,
  ScanOptions,
  Finding,
  IModelProvider,
  SupportedLanguage,
} from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { execGitStrict, getRepoRoot } from '../../git/executor.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max file content for model analysis */
const MAX_FILE_CONTENT_LENGTH = 10_000;

/** Max files to analyze per run */
const MAX_FILES_PER_RUN = 100;

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

// ─── Linter Runners ─────────────────────────────────────────────────────────

interface LinterConfig {
  name: string;
  /** Command to check if the linter is available */
  detectCommand: string[];
  /** Command to run the linter (args appended with file paths) */
  runCommand: string[];
  /** Supported languages */
  languages: SupportedLanguage[];
  /** Parse linter output into findings */
  parse: (output: string, cwd: string) => Array<Omit<Finding, 'id' | 'toolId'>>;
}

const LINTERS: LinterConfig[] = [
  {
    name: 'ESLint',
    detectCommand: ['npx', 'eslint', '--version'],
    runCommand: ['npx', 'eslint', '--format', 'json', '--no-error-on-unmatched-pattern'],
    languages: ['typescript', 'javascript'],
    parse: parseEslintOutput,
  },
  {
    name: 'Pylint',
    detectCommand: ['python3', '-m', 'pylint', '--version'],
    runCommand: ['python3', '-m', 'pylint', '--output-format=json'],
    languages: ['python'],
    parse: parsePylintOutput,
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LintToolDeps {
  /** Model provider for deeper analysis (optional — lint still works without it) */
  modelProvider?: IModelProvider;
  /** Working directory */
  cwd: string;
  /** Languages to analyze */
  enabledLanguages: SupportedLanguage[];
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Lint & Best Practice analysis tool.
 *
 * Two-phase approach:
 * 1. **Linter wrapping**: run existing linters (ESLint, Pylint) and collect results.
 *    Gracefully skips linters that aren't installed.
 * 2. **Model-driven analysis**: send files to the model for higher-level smell
 *    detection (architectural issues, patterns, anti-patterns) and linter config
 *    improvement suggestions.
 *
 * Phase 2 only runs if a model provider is available.
 */
export class LintTool extends BaseTool {
  readonly id: ToolId = 'lint';
  readonly name = 'Lint & Best Practice';
  readonly description =
    'Run linters and model-driven analysis for code smells and best practices.';

  private deps: LintToolDeps | undefined;
  private scannedFileCount = 0;

  setDeps(deps: LintToolDeps): void {
    this.deps = deps;
  }

  protected override countScannedFiles(): number {
    return this.scannedFileCount;
  }

  protected async run(options: ScanOptions): Promise<Finding[]> {
    if (!this.deps) {
      throw new Error('LintTool: Dependencies not set. Call setDeps() before execute().');
    }

    const { modelProvider, cwd, enabledLanguages } = this.deps;
    const repoRoot = await getRepoRoot(cwd);
    const findings: Finding[] = [];

    // Determine which files to scan
    const files = await getFilesToLint(repoRoot, enabledLanguages, options.paths);
    this.scannedFileCount = files.length;

    // Phase 1: Run installed linters
    for (const linter of LINTERS) {
      this.throwIfCancelled(options);

      // Only run if the linter's languages overlap with enabled languages
      const relevantLangs = linter.languages.filter((l) => enabledLanguages.includes(l));
      if (relevantLangs.length === 0) continue;

      const available = await isLinterAvailable(repoRoot, linter);
      if (!available) {
        // Silently skip missing linters - don't create noisy findings
        // Users can install linters if they want static analysis
        continue;
      }

      // Filter files to those relevant for this linter
      const linterFiles = files.filter((f) => {
        const lang = EXT_TO_LANGUAGE[extname(f)];
        return lang && relevantLangs.includes(lang);
      });

      if (linterFiles.length === 0) continue;

      try {
        const linterFindings = await runLinter(repoRoot, linter, linterFiles);
        findings.push(...linterFindings.map((f) => this.createFinding(f)));
      } catch (error) {
        findings.push(
          this.createFinding({
            title: `${linter.name} error`,
            description: error instanceof Error ? error.message : String(error),
            location: { filePath: repoRoot, startLine: 0, endLine: 0 },
            severity: 'warning',
            metadata: { source: 'linter-error', linter: linter.name },
          }),
        );
      }
    }

    // Phase 2: Model-driven analysis
    if (modelProvider) {
      for (const filePath of files.slice(0, MAX_FILES_PER_RUN)) {
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
          );
          findings.push(...modelFindings.map((f) => this.createFinding(f)));
        } catch {
          // Skip files that fail model analysis
        }
      }
    }

    return findings;
  }
}

// ─── Linter Execution ───────────────────────────────────────────────────────

async function isLinterAvailable(cwd: string, linter: LinterConfig): Promise<boolean> {
  try {
    const { execFile: execFileCb } = await import('node:child_process');
    return new Promise((resolve) => {
      execFileCb(linter.detectCommand[0], linter.detectCommand.slice(1), { cwd }, (error) => {
        resolve(!error);
      });
    });
  } catch {
    return false;
  }
}

async function runLinter(
  cwd: string,
  linter: LinterConfig,
  files: string[],
): Promise<Array<Omit<Finding, 'id' | 'toolId'>>> {
  const { execFile: execFileCb } = await import('node:child_process');
  const args = [...linter.runCommand.slice(1), ...files];

  return new Promise((resolve) => {
    execFileCb(
      linter.runCommand[0],
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (_error, stdout, _stderr) => {
        // Linters often exit non-zero when they find issues — that's expected
        const output = String(stdout);
        try {
          resolve(linter.parse(output, cwd));
        } catch {
          resolve([]);
        }
      },
    );
  });
}

// ─── ESLint Output Parsing ──────────────────────────────────────────────────

interface EslintJsonResult {
  filePath: string;
  messages: Array<{
    ruleId: string | null;
    severity: number; // 1 = warn, 2 = error
    message: string;
    line: number;
    endLine?: number;
    column: number;
    endColumn?: number;
    fix?: { range: [number, number]; text: string };
  }>;
}

function parseEslintOutput(
  output: string,
  cwd: string,
): Array<Omit<Finding, 'id' | 'toolId'>> {
  const findings: Array<Omit<Finding, 'id' | 'toolId'>> = [];

  let results: EslintJsonResult[];
  try {
    results = JSON.parse(output) as EslintJsonResult[];
  } catch {
    return findings;
  }

  for (const file of results) {
    for (const msg of file.messages) {
      findings.push({
        title: msg.ruleId ? `ESLint: ${msg.ruleId}` : 'ESLint issue',
        description: msg.message,
        location: {
          filePath: file.filePath.startsWith(cwd)
            ? file.filePath.slice(cwd.length + 1)
            : file.filePath,
          startLine: msg.line,
          endLine: msg.endLine ?? msg.line,
          startColumn: msg.column,
          endColumn: msg.endColumn,
        },
        severity: msg.severity === 2 ? 'error' : 'warning',
        metadata: { source: 'eslint', ruleId: msg.ruleId },
      });
    }
  }

  return findings;
}

// ─── Pylint Output Parsing ──────────────────────────────────────────────────

interface PylintJsonResult {
  type: string; // 'convention', 'refactor', 'warning', 'error', 'fatal'
  module: string;
  obj: string;
  line: number;
  column: number;
  endLine: number | null;
  endColumn: number | null;
  path: string;
  symbol: string;
  message: string;
  'message-id': string;
}

function parsePylintOutput(
  output: string,
  _cwd: string,
): Array<Omit<Finding, 'id' | 'toolId'>> {
  const findings: Array<Omit<Finding, 'id' | 'toolId'>> = [];

  let results: PylintJsonResult[];
  try {
    results = JSON.parse(output) as PylintJsonResult[];
  } catch {
    return findings;
  }

  const severityMap: Record<string, Finding['severity']> = {
    fatal: 'error',
    error: 'error',
    warning: 'warning',
    convention: 'info',
    refactor: 'info',
  };

  for (const msg of results) {
    findings.push({
      title: `Pylint: ${msg.symbol} (${msg['message-id']})`,
      description: msg.message,
      location: {
        filePath: msg.path,
        startLine: msg.line,
        endLine: msg.endLine ?? msg.line,
        startColumn: msg.column,
        endColumn: msg.endColumn ?? undefined,
      },
      severity: severityMap[msg.type] ?? 'info',
      metadata: { source: 'pylint', symbol: msg.symbol, messageId: msg['message-id'] },
    });
  }

  return findings;
}

// ─── Model Analysis ─────────────────────────────────────────────────────────

const MODEL_SYSTEM_PROMPT = `You are a code quality reviewer. Analyze the file for issues that static linters typically miss:

1. **Architectural smells**: God classes, feature envy, shotgun surgery patterns
2. **Anti-patterns**: Magic strings, deep nesting, long parameter lists, unclear naming
3. **Best practices**: Missing error handling, inconsistent patterns, potential race conditions
4. **Security**: Hardcoded secrets, SQL injection risks, XSS vulnerabilities
5. **Performance**: N+1 patterns, unnecessary re-renders, memory leaks

For each finding, output one line in this format:
SEVERITY|LINE_START|LINE_END|TITLE|DESCRIPTION|SUGGESTION

SEVERITY is one of: ERROR, WARNING, INFO
SUGGESTION is a brief fix recommendation (can be empty).

Be conservative — only report clear issues, not style preferences.
If there are no findings, output: NONE`;

async function analyzeWithModel(
  provider: IModelProvider,
  filePath: string,
  content: string,
  options: ScanOptions,
): Promise<Array<Omit<Finding, 'id' | 'toolId'>>> {
  const response = await provider.sendRequest({
    role: 'tool',
    messages: [
      { role: 'system', content: MODEL_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `File: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``,
      },
    ],
    signal: options.signal,
  });

  return parseModelResponse(response.content, filePath);
}

function parseModelResponse(
  content: string,
  filePath: string,
): Array<Omit<Finding, 'id' | 'toolId'>> {
  if (content.trim() === 'NONE') return [];

  const findings: Array<Omit<Finding, 'id' | 'toolId'>> = [];
  const severityMap: Record<string, Finding['severity']> = {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
  };

  for (const line of content.split('\n')) {
    const parts = line.split('|');
    if (parts.length < 5) continue;

    const [sevStr, startStr, endStr, title, description, ...suggestionParts] = parts;
    const severity = severityMap[sevStr.trim()];
    if (!severity) continue;

    const startLine = parseInt(startStr.trim(), 10);
    const endLine = parseInt(endStr.trim(), 10);
    if (isNaN(startLine) || isNaN(endLine)) continue;

    const finding: Omit<Finding, 'id' | 'toolId'> = {
      title: title.trim(),
      description: description.trim(),
      location: { filePath, startLine, endLine },
      severity,
      metadata: { source: 'model' },
    };

    const suggestion = suggestionParts.join('|').trim();
    if (suggestion) {
      finding.suggestedFix = {
        description: suggestion,
        replacement: '', // Model provides guidance, not exact replacements
        location: { filePath, startLine, endLine },
      };
    }

    findings.push(finding);
  }

  return findings;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getFilesToLint(
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
