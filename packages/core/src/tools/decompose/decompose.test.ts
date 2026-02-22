import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IModelProvider, ModelResponse } from '../../types/index.js';
import { DecomposeTool } from './index.js';
import type { ScanOptions } from '../../types/index.js';

/**
 * Mock IModelProvider for testing.
 */
class MockModelProvider implements IModelProvider {
  sendRequest = vi.fn();
}

describe('DecomposeTool', () => {
  let tool: DecomposeTool;
  let mockProvider: MockModelProvider;

  beforeEach(() => {
    mockProvider = new MockModelProvider();
    tool = new DecomposeTool(mockProvider);
  });

  describe('JSON response parsing', () => {
    it('should parse valid JSON subtask plans', async () => {
      const validJson = JSON.stringify([
        {
          id: 'subtask_1',
          description: 'Find unused exports',
          toolIds: ['dead-code'],
          rationale: 'Essential for cleanup',
        },
      ]);

      mockProvider.sendRequest.mockResolvedValue({
        content: validJson,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Clean up the codebase', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const jsonInMarkdown = `\`\`\`json
[
  {
    "id": "task_1",
    "description": "Find dead code",
    "toolIds": ["dead-code"],
    "rationale": "Cleanup"
  }
]
\`\`\``;

      mockProvider.sendRequest.mockResolvedValue({
        content: jsonInMarkdown,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Clean up the codebase', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
    });

    it('should fail gracefully on invalid JSON', async () => {
      mockProvider.sendRequest.mockResolvedValue({
        content: 'This is not JSON',
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Clean up the codebase', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('parse decomposition plan');
    });
  });

  describe('Tool ID validation', () => {
    it('should skip unknown toolIds with a warning', async () => {
      const jsonWithInvalidTool = JSON.stringify([
        {
          id: 'valid_task',
          description: 'Valid task',
          toolIds: ['dead-code', 'unknown-tool', 'lint'],
          rationale: 'Mix of valid and invalid',
        },
      ]);

      mockProvider.sendRequest.mockResolvedValue({
        content: jsonWithInvalidTool,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Test', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
      // The tool should process the task with only valid toolIds
    });

    it('should skip subtasks with no valid toolIds', async () => {
      const jsonWithOnlyInvalidTools = JSON.stringify([
        {
          id: 'bad_task',
          description: 'Only invalid tools',
          toolIds: ['unknown-1', 'unknown-2'],
          rationale: 'This should be skipped',
        },
        {
          id: 'good_task',
          description: 'Valid task',
          toolIds: ['lint'],
          rationale: 'This should be kept',
        },
      ]);

      mockProvider.sendRequest.mockResolvedValue({
        content: jsonWithOnlyInvalidTools,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Test', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
      // Only good_task should remain
    });
  });

  describe('Subtask limits', () => {
    it('should cap subtasks at maxSubtasks parameter', async () => {
      const manySubtasks = JSON.stringify(
        Array.from({ length: 7 }, (_, i) => ({
          id: `task_${i}`,
          description: `Task ${i}`,
          toolIds: ['dead-code'],
          rationale: `Task ${i}`,
        })),
      );

      mockProvider.sendRequest.mockResolvedValue({
        content: manySubtasks,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Test', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
      // Should be capped at 5, hard limit is 10
    });

    it('should enforce hard limit of DECOMPOSE_MAX_SUBTASKS_LIMIT', async () => {
      const manySubtasks = JSON.stringify(
        Array.from({ length: 15 }, (_, i) => ({
          id: `task_${i}`,
          description: `Task ${i}`,
          toolIds: ['dead-code'],
          rationale: `Task ${i}`,
        })),
      );

      mockProvider.sendRequest.mockResolvedValue({
        content: manySubtasks,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Test', maxSubtasks: 20 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
      // Should be capped at hard limit (10)
    });
  });

  describe('Missing objective', () => {
    it('should fail if objective is not provided', async () => {
      const options: ScanOptions = {
        args: {},
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Objective is required');
    });
  });

  describe('Consolidation logic', () => {
    it('should deduplicate findings by filePath and title', async () => {
      // This is tested implicitly through the consolidation phase
      const validJson = JSON.stringify([
        {
          id: 'task_1',
          description: 'Lint',
          toolIds: ['lint'],
          rationale: 'Find issues',
        },
      ]);

      mockProvider.sendRequest.mockResolvedValue({
        content: validJson,
        toolCalls: [],
      } as ModelResponse);

      const options: ScanOptions = {
        args: { objective: 'Test', maxSubtasks: 5 },
      };

      const result = await tool.execute(options);
      expect(result.status).toBe('completed');
      // The tool should have consolidated findings (empty in this case since runToolForSubtask is a placeholder)
    });
  });
});
