import { describe, it, expect } from 'vitest';
import { matchWorkflow, WORKFLOW_REGISTRY } from './workflows.js';

describe('matchWorkflow()', () => {
  it('should match exact trigger', () => {
    const result = matchWorkflow('fix');
    expect(result).toBeDefined();
    expect(result?.id).toBe('fix');
  });

  it('should match case-insensitive', () => {
    const result = matchWorkflow('FIX');
    expect(result).toBeDefined();
    expect(result?.id).toBe('fix');
  });

  it('should match partial phrase', () => {
    const result = matchWorkflow('please prep pr for review');
    expect(result).toBeDefined();
    expect(result?.id).toBe('prep-pr');
  });

  it('should match with surrounding whitespace', () => {
    const result = matchWorkflow('  review  ');
    expect(result).toBeDefined();
    expect(result?.id).toBe('review');
  });

  it('should return undefined when no match', () => {
    const result = matchWorkflow('something completely different');
    expect(result).toBeUndefined();
  });

  it('should match substring within text', () => {
    const result = matchWorkflow('hey can you do a code review for me');
    expect(result).toBeDefined();
    expect(result?.id).toBe('review');
  });

  it('should match "broken" trigger', () => {
    const result = matchWorkflow('things are broken');
    expect(result).toBeDefined();
    expect(result?.id).toBe('fix');
  });

  it('should match "audit" trigger', () => {
    const result = matchWorkflow('can you audit this code');
    expect(result).toBeDefined();
    expect(result?.id).toBe('review');
  });

  it('should have valid tool IDs', () => {
    for (const workflow of WORKFLOW_REGISTRY) {
      expect(workflow.toolIds.length).toBeGreaterThan(0);
      for (const toolId of workflow.toolIds) {
        expect(typeof toolId).toBe('string');
        expect(toolId.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have valid triggers', () => {
    for (const workflow of WORKFLOW_REGISTRY) {
      expect(workflow.triggers.length).toBeGreaterThan(0);
      for (const trigger of workflow.triggers) {
        expect(typeof trigger).toBe('string');
        expect(trigger.length).toBeGreaterThan(0);
      }
    }
  });
});
