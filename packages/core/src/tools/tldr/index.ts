import type { ToolId, ScanOptions, Finding } from '../../types/index.js';
import { BaseTool } from '../base-tool.js';

/**
 * TLDR tool — summarize recent changes.
 *
 * Strategy:
 * 1. Determine scope from ScanOptions paths (file, directory, or entire project)
 * 2. Fetch git log for the relevant scope
 * 3. Feed commit diffs/messages to the model for summarization
 * 4. Generate TldrSummary with highlights, scoped adaptively to what was asked
 *
 * Granularity is model-driven — the model decides how to group and
 * summarize based on the volume and nature of changes.
 */
export class TldrTool extends BaseTool {
  readonly id: ToolId = 'tldr';
  readonly name = 'TLDR';
  readonly description = 'Summarize recent changes for a file, directory, or project.';

  protected async run(_options: ScanOptions): Promise<Finding[]> {
    // TODO: Phase 1 — determine scope and fetch git log
    // TODO: Phase 2 — model summarization
    // TODO: Phase 3 — assemble TldrSummary into ScanResult metadata
    throw new Error('TldrTool.run not yet implemented');
  }
}
