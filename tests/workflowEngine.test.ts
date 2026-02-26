/**
 * WorkflowEngine Tests (5 tests)
 * Testing workflow step execution, branching, and variable interpolation
 */

import { describe, it, expect } from 'vitest';
import { WorkflowEngine, StepRunner } from '../src/infrastructure/workflow-engine';
import {
  MockLogger,
  createMockContext,
  SAMPLE_WORKFLOW,
  SAMPLE_WORKFLOW_WITH_VARIABLES,
  assertSuccess,
  assertFailure,
} from './fixtures';

describe('WorkflowEngine', () => {
  // Test 1: execute() runs all steps in order
  it('should execute all steps in order', async () => {
    const logger = new MockLogger();
    const executionOrder: string[] = [];

    const stepRunner: StepRunner = async (cmd, ctx) => {
      executionOrder.push(cmd.name);
      return { kind: 'ok' as const, value: {} };
    };

    const engine = new WorkflowEngine(logger, stepRunner);
    const result = await engine.execute(
      SAMPLE_WORKFLOW,
      createMockContext()
    );

    const ctx = assertSuccess(result);

    expect(executionOrder).toEqual(['git.status', 'git.pull']);
    expect(ctx.stepResults.size).toBe(2);
    expect(ctx.stepResults.has('step-1')).toBe(true);
    expect(ctx.stepResults.has('step-2')).toBe(true);
  });

  // Test 2: onSuccess path branches correctly
  it('should follow onSuccess branch path', async () => {
    const logger = new MockLogger();
    const executedSteps: string[] = [];

    const stepRunner: StepRunner = async (cmd, ctx) => {
      executedSteps.push(cmd.name);
      return { kind: 'ok' as const, value: { status: 'success' } };
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'branch-test',
      steps: [
        {
          id: 'step-1',
          command: 'git.status' as const,
          params: {},
          onSuccess: 'step-2',
          onFailure: 'step-3',
        },
        {
          id: 'step-2',
          command: 'git.pull' as const,
          params: {},
          onSuccess: 'exit',
        },
        {
          id: 'step-3',
          command: 'git.commit' as const,
          params: { message: 'fallback' },
          onSuccess: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());
    const ctx = assertSuccess(result);

    // Should execute step-1 and step-2, NOT step-3
    expect(executedSteps).toEqual(['git.status', 'git.pull']);
  });

  // Test 3: onFailure path branches correctly
  it('should follow onFailure branch path', async () => {
    const logger = new MockLogger();
    const executedSteps: string[] = [];

    let callCount = 0;
    const stepRunner: StepRunner = async (cmd, ctx) => {
      callCount++;
      executedSteps.push(cmd.name);

      // First call fails, others succeed
      if (callCount === 1) {
        return {
          kind: 'err' as const,
          error: { code: 'FAILED', message: 'Step failed' },
        };
      }
      return { kind: 'ok' as const, value: {} };
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'failure-branch-test',
      steps: [
        {
          id: 'step-1',
          command: 'git.status' as const,
          params: {},
          onSuccess: 'step-2',
          onFailure: 'step-3',
        },
        {
          id: 'step-2',
          command: 'git.pull' as const,
          params: {},
          onSuccess: 'exit',
        },
        {
          id: 'step-3',
          command: 'git.commit' as const,
          params: { message: 'recovery' },
          onSuccess: 'exit',
        },
      ],
    };

    const result = await engine.execute(workflow, createMockContext());
    const ctx = assertSuccess(result);

    // Should execute step-1, skip step-2, execute step-3
    expect(executedSteps).toEqual(['git.status', 'git.commit']);
  });

  // Test 4: variable interpolation works
  it('should interpolate variables in step params', async () => {
    const logger = new MockLogger();
    let capturedParams: any = null;

    const stepRunner: StepRunner = async (cmd, ctx) => {
      capturedParams = cmd.params;
      return { kind: 'ok' as const, value: {} };
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'variable-test',
      steps: [
        {
          id: 'step-1',
          command: 'git.status' as const,
          params: {
            path: '$(srcPath)',
            count: '$(fileCount)',
          },
          onSuccess: 'exit',
        },
      ],
    };

    const variables = {
      srcPath: '/home/user/src',
      fileCount: 42,
    };

    const result = await engine.execute(
      workflow,
      createMockContext(),
      variables
    );

    const ctx = assertSuccess(result);

    expect(capturedParams.path).toBe('/home/user/src');
    // String interpolation converts numbers to strings
    expect(capturedParams.count).toBe('42');
  });

  // Test 5: condition resolution works
  it('should handle nested variable interpolation', async () => {
    const logger = new MockLogger();
    const params: any[] = [];

    const stepRunner: StepRunner = async (cmd, ctx) => {
      params.push(cmd.params);
      return { kind: 'ok' as const, value: { nextStep: 'step-2' } };
    };

    const engine = new WorkflowEngine(logger, stepRunner);

    const workflow = {
      name: 'complex-vars',
      steps: [
        {
          id: 'step-1',
          command: 'git.status' as const,
          params: {
            nested: {
              path: '$(basePath)',
              file: '$(fileName)',
            },
          },
          onSuccess: 'exit',
        },
      ],
    };

    const variables = {
      basePath: '/projects',
      fileName: 'package.json',
    };

    const result = await engine.execute(
      workflow,
      createMockContext(),
      variables
    );

    const ctx = assertSuccess(result);

    expect(params[0].nested.path).toBe('/projects');
    expect(params[0].nested.file).toBe('package.json');
  });
});
