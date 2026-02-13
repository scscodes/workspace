import { describe, it, expect } from 'vitest';
import { validateCommitMessage } from './validation.js';
import type { CommitConstraints } from '../types/index.js';

const baseConstraints: CommitConstraints = {
  minLength: 10,
  maxLength: 72,
  prefix: '',
  suffix: '',
  enforcement: 'warn',
};

describe('validateCommitMessage', () => {
  it('passes a valid message', () => {
    const result = validateCommitMessage('feat: add user authentication', baseConstraints);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when message is too short', () => {
    const result = validateCommitMessage('fix', baseConstraints);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraint).toBe('minLength');
    expect(result.violations[0].actual).toBe(3);
    expect(result.violations[0].expected).toBe(10);
  });

  it('fails when first line is too long', () => {
    const longMessage = 'a'.repeat(80);
    const result = validateCommitMessage(longMessage, baseConstraints);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraint).toBe('maxLength');
  });

  it('only checks the first line for length', () => {
    const message = 'feat: short first line\n\n' + 'a'.repeat(200);
    const result = validateCommitMessage(message, baseConstraints);
    expect(result.valid).toBe(true);
  });

  it('validates required prefix', () => {
    const constraints = { ...baseConstraints, prefix: 'TEAM-123: ' };
    const pass = validateCommitMessage('TEAM-123: fix the widget', constraints);
    expect(pass.valid).toBe(true);

    const fail = validateCommitMessage('fix the widget', constraints);
    expect(fail.valid).toBe(false);
    expect(fail.violations[0].constraint).toBe('prefix');
  });

  it('validates required suffix', () => {
    const constraints = { ...baseConstraints, suffix: ' [skip ci]' };
    const pass = validateCommitMessage('fix the widget [skip ci]', constraints);
    expect(pass.valid).toBe(true);

    const fail = validateCommitMessage('fix the widget', constraints);
    expect(fail.valid).toBe(false);
    expect(fail.violations[0].constraint).toBe('suffix');
  });

  it('reports multiple violations', () => {
    const constraints: CommitConstraints = {
      minLength: 20,
      maxLength: 50,
      prefix: 'PROJ: ',
      suffix: '',
      enforcement: 'warn',
    };
    const result = validateCommitMessage('bad', constraints);
    // Too short AND missing prefix
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty message', () => {
    const result = validateCommitMessage('', baseConstraints);
    expect(result.valid).toBe(false);
    expect(result.violations[0].constraint).toBe('minLength');
  });

  it('ignores prefix/suffix when they are empty strings', () => {
    const result = validateCommitMessage('this is long enough', baseConstraints);
    expect(result.valid).toBe(true);
  });
});
