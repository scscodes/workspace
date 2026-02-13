import type { ToolId, ScanOptions, Finding } from '../../types/index.js';
import { BaseTool } from '../base-tool.js';

/**
 * Auto-Commit tool.
 *
 * Strategy:
 * 1. Detect changed files in the working tree (git status)
 * 2. Auto-stage changed files (or work with already-staged files)
 * 3. Generate a commit message using the model, respecting CommitConstraints
 * 4. Validate against constraints — warn or deny based on settings
 * 5. Dry-run pre-commit hooks if configured
 * 6. Present CommitProposal for user approval — never auto-commit
 *
 * The ScanResult for this tool stores the CommitProposal in metadata.
 * Findings represent individual constraint violations or hook issues.
 */
export class CommitTool extends BaseTool {
  readonly id: ToolId = 'commit';
  readonly name = 'Auto-Commit';
  readonly description = 'Stage changed files and generate a commit message for approval.';

  protected async run(_options: ScanOptions): Promise<Finding[]> {
    // TODO: Phase 1 — detect changed files
    // TODO: Phase 2 — auto-stage
    // TODO: Phase 3 — generate commit message via model
    // TODO: Phase 4 — validate constraints
    // TODO: Phase 5 — dry-run pre-commit hooks
    // TODO: Phase 6 — assemble CommitProposal into metadata
    throw new Error('CommitTool.run not yet implemented');
  }
}
