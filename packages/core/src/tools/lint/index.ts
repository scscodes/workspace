import type { ToolId, ScanOptions, Finding } from '../../types/index.js';
import { BaseTool } from '../base-tool.js';

/**
 * Lint & Best Practice analysis tool.
 *
 * Strategy:
 * 1. Run existing linters (ESLint, Prettier, pylint, etc.) and collect results
 * 2. Model-driven analysis for higher-level smells not caught by static rules
 * 3. Suggest linter configuration patches to improve coverage
 *
 * Languages: TypeScript/JavaScript, Python
 */
export class LintTool extends BaseTool {
  readonly id: ToolId = 'lint';
  readonly name = 'Lint & Best Practice';
  readonly description =
    'Run linters and model-driven analysis for code smells and best practices.';

  protected async run(_options: ScanOptions): Promise<Finding[]> {
    // TODO: Phase 1 — run configured linters
    // TODO: Phase 2 — model review for architectural smells
    // TODO: Phase 3 — suggest linter config improvements
    throw new Error('LintTool.run not yet implemented');
  }
}
