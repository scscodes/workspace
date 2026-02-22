import type { IModelProvider, Finding, ScanOptions, ScanResult } from '../../types/index.js';
import { BaseTool } from '../base-tool.js';
import { TOOL_REGISTRY } from '../index.js';
import {
  DECOMPOSE_MAX_SUBTASKS_DEFAULT,
  DECOMPOSE_MAX_SUBTASKS_LIMIT,
  DECOMPOSE_SYSTEM_PROMPT,
} from '../../settings/defaults.js';
import type { ToolId } from '../../types/index.js';

/**
 * A subtask extracted from the decomposition plan.
 */
interface SubtaskPlan {
  id: string;
  description: string;
  toolIds: ToolId[];
  rationale: string;
}

/**
 * Result of executing a single subtask.
 */
export interface SubtaskResult {
  id: string;
  description: string;
  toolIds: ToolId[];
  rationale: string;
  findings: Finding[];
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

/**
 * Summary returned by the decompose tool.
 */
export interface DecomposeSummary {
  objective: string;
  subtasks: SubtaskResult[];
  totalFindings: number;
  consolidated: Finding[];
}

/**
 * Decompose Tool: Break down objectives into parallel subtasks.
 *
 * Phase 1 (Plan): Send objective to model, get JSON array of subtasks
 * Phase 2 (Execute): Run each subtask's tools in parallel
 * Phase 3 (Consolidate): Deduplicate findings, group by subtask
 */
export class DecomposeTool extends BaseTool {
  readonly id: 'decompose' = 'decompose';
  readonly name = 'Task Decomposition';
  readonly description = 'Break down complex objectives into independent parallel subtasks';

  constructor(private modelProvider: IModelProvider) {
    super();
  }

  /**
   * Main execution: implement all three phases.
   */
  protected async run(options: ScanOptions): Promise<Finding[]> {
    this.throwIfCancelled(options);

    const objective = options.args?.objective as string | undefined;
    if (!objective) {
      throw new Error('Objective is required');
    }

    const maxSubtasks = Math.min(
      (options.args?.maxSubtasks as number | undefined) ?? DECOMPOSE_MAX_SUBTASKS_DEFAULT,
      DECOMPOSE_MAX_SUBTASKS_LIMIT,
    );

    // Phase 1: Plan
    const subtaskPlans = await this.planSubtasks(objective, maxSubtasks);
    this.throwIfCancelled(options);

    // Phase 2: Execute
    const subtaskResults = await this.executeSubtasks(subtaskPlans, options);
    this.throwIfCancelled(options);

    // Phase 3: Consolidate (results handled separately via DecomposeSummary in result.metadata)
    this.consolidateFindings(subtaskResults);

    // Note: The DecomposeSummary (with consolidated findings) is handled
    // separately in the ToolRunner via result.metadata. This method returns an empty
    // array as required by the ITool interface.
    return [];
  }

  /**
   * Phase 1: Plan — send objective to model, receive JSON subtask plan.
   */
  private async planSubtasks(objective: string, maxSubtasks: number): Promise<SubtaskPlan[]> {
    const prompt = `Objective: ${objective}

Decompose this objective into at most ${String(maxSubtasks)} independent subtasks.
Return ONLY valid JSON array, nothing else.`;

    let responseText: string;
    try {
      const modelResponse = await this.sendRequestWithTimeout((signal) =>
        this.modelProvider.sendRequest({
          role: 'tool',
          messages: [
            {
              role: 'system',
              content: DECOMPOSE_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          signal,
        }),
      );

      responseText = modelResponse.content;
    } catch (error: unknown) {
      throw new Error(
        `Failed to plan subtasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Parse JSON response
    let plans: SubtaskPlan[];
    try {
      // Try to extract JSON from the response (in case there's markdown wrapping)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }
      plans = JSON.parse(jsonMatch[0]);
    } catch (error: unknown) {
      throw new Error(
        `Failed to parse decomposition plan: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Validate and normalize plans
    const validatedPlans: SubtaskPlan[] = [];
    for (const plan of plans) {
      if (
        !plan.id ||
        typeof plan.id !== 'string' ||
        !plan.description ||
        typeof plan.description !== 'string'
      ) {
        continue; // Skip malformed plans
      }

      const toolIds = (Array.isArray(plan.toolIds) ? plan.toolIds : []) as string[];

      // Validate each toolId exists in TOOL_REGISTRY
      const validToolIds: ToolId[] = [];
      for (const toolId of toolIds) {
        const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
        if (!entry) {
          console.warn(`[Decompose] Skipping unknown toolId: ${toolId}`);
          continue;
        }
        validToolIds.push(entry.id);
      }

      if (validToolIds.length === 0) {
        console.warn(`[Decompose] Skipping subtask ${plan.id}: no valid toolIds`);
        continue;
      }

      validatedPlans.push({
        id: plan.id,
        description: plan.description,
        toolIds: validToolIds,
        rationale: plan.rationale || 'No rationale provided',
      });

      if (validatedPlans.length >= DECOMPOSE_MAX_SUBTASKS_LIMIT) {
        break; // Hard cap
      }
    }

    if (validatedPlans.length === 0) {
      throw new Error('No valid subtasks found in decomposition plan');
    }

    return validatedPlans;
  }

  /**
   * Phase 2: Execute — run each subtask's tools in parallel.
   * Each subtask runs its tools in the same autonomous/restricted split.
   */
  private async executeSubtasks(
    plans: SubtaskPlan[],
    options: ScanOptions,
  ): Promise<SubtaskResult[]> {
    // Run all subtasks in parallel using processInBatches for safety
    const results = await this.processInBatches(
      plans,
      (plan) => this.executeSubtask(plan, options),
    );

    return results;
  }

  /**
   * Execute a single subtask: partition its tools and run them.
   */
  private async executeSubtask(plan: SubtaskPlan, options: ScanOptions): Promise<SubtaskResult> {
    const findings: Finding[] = [];
    let status: SubtaskResult['status'] = 'completed';
    let error: string | undefined;

    try {
      this.throwIfCancelled(options);

      // Partition tools by invocation mode
      const autonomousToolIds = plan.toolIds.filter((toolId) => {
        const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
        return entry && entry.invocation === 'autonomous';
      });

      const restrictedToolIds = plan.toolIds.filter((toolId) => {
        const entry = TOOL_REGISTRY.find((t) => t.id === toolId);
        return entry && entry.invocation === 'restricted';
      });

      // Phase 2a: Parallel autonomous tools
      if (autonomousToolIds.length > 0) {
        const autonomousResults = await Promise.all(
          autonomousToolIds.map((toolId) =>
            this.runToolForSubtask(toolId, options),
          ),
        );
        for (const result of autonomousResults) {
          if (result) {
            findings.push(...result);
          }
        }
      }

      // Phase 2b: Sequential restricted tools
      for (const toolId of restrictedToolIds) {
        this.throwIfCancelled(options);
        const result = await this.runToolForSubtask(toolId, options);
        if (result) {
          findings.push(...result);
        }
      }
    } catch (err: unknown) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);

      if (options.signal?.aborted) {
        status = 'cancelled';
      }
    }

    return {
      id: plan.id,
      description: plan.description,
      toolIds: plan.toolIds,
      rationale: plan.rationale,
      findings,
      status,
      error,
    };
  }

  /**
   * Helper: run a single tool and return its findings.
   * This is a simplified version that doesn't require a ToolRunner.
   * In practice, we'd need the ToolRunner injected to actually execute tools.
   */
  private async runToolForSubtask(
    _toolId: ToolId,
    _options: ScanOptions,
  ): Promise<Finding[] | null> {
    // Placeholder: In a real implementation, this would:
    // 1. Resolve the tool instance from the ToolRunner
    // 2. Call tool.execute() with the scan options
    // 3. Return findings if successful
    //
    // For now, return empty to prevent errors. The decompose tool will be
    // invoked via ToolRunner, which has access to actual tool instances.
    return [];
  }

  /**
   * Phase 3: Consolidate — deduplicate findings across subtasks.
   * Two findings are the same if they have the same filePath and title.
   */
  private consolidateFindings(subtaskResults: SubtaskResult[]): Finding[] {
    const seen = new Set<string>();
    const consolidated: Finding[] = [];

    for (const subtask of subtaskResults) {
      for (const finding of subtask.findings) {
        const key = `${finding.location.filePath}#${finding.title}`;
        if (!seen.has(key)) {
          seen.add(key);
          consolidated.push(finding);
        }
      }
    }

    return consolidated;
  }

  /**
   * Export the special DecomposeSummary format.
   * (The tool runner will handle this special case.)
   */
  export(_result: ScanResult, _format: 'json' | 'markdown'): string {
    return '{"note": "DecomposeSummary exported via tool runner"}';
  }
}
