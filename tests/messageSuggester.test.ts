/**
 * MessageSuggester Tests (6 tests)
 * Testing commit message suggestion logic
 */

import { describe, it, expect } from 'vitest';
import { CommitMessageSuggester } from '../src/domains/git/service';

describe('CommitMessageSuggester', () => {
  const suggester = new CommitMessageSuggester();

  // Test 1: suggest() format is correct
  it('should format message as type(scope): description', () => {
    const group = {
      id: 'group-1',
      files: [
        { path: 'src/api/endpoint.ts', status: 'M', domain: 'api', fileType: '.ts' },
      ],
      suggestedMessage: { type: 'fix', scope: '', description: '', full: '' },
      similarity: 0.8,
    };

    const message = suggester.suggest(group);

    expect(message.full).toMatch(/^[a-z]+(\([^)]*\))?: .+/);
    expect(message.type).toBeDefined();
    expect(message.description).toBeDefined();
  });

  // Test 2: feat type for new files only
  it('should suggest feat type for new files', () => {
    const group = {
      id: 'group-1',
      files: [
        { path: 'src/new-feature.ts', status: 'A', domain: 'features', fileType: '.ts' },
        { path: 'src/another-feature.ts', status: 'A', domain: 'features', fileType: '.ts' },
      ],
      suggestedMessage: { type: 'chore', scope: '', description: '', full: '' },
      similarity: 0.8,
    };

    const message = suggester.suggest(group);

    expect(message.type).toBe('feat');
    expect(message.full).toMatch(/^feat/);
  });

  // Test 3: fix type for modifications only
  it('should suggest fix type for modifications only', () => {
    const group = {
      id: 'group-1',
      files: [
        { path: 'src/bug.ts', status: 'M', domain: 'core', fileType: '.ts' },
      ],
      suggestedMessage: { type: 'chore', scope: '', description: '', full: '' },
      similarity: 0.8,
    };

    const message = suggester.suggest(group);

    expect(message.type).toBe('fix');
    expect(message.full).toMatch(/^fix/);
  });

  // Test 4: docs type for markdown files (mixed add/modify)
  it('should suggest docs type for markdown-only changes', () => {
    const group = {
      id: 'group-1',
      files: [
        { path: 'docs/README.md', status: 'A', domain: 'docs', fileType: 'README.md' },
        { path: 'docs/API.md', status: 'M', domain: 'docs', fileType: 'API.md' },
      ],
      suggestedMessage: { type: 'chore', scope: '', description: '', full: '' },
      similarity: 0.8,
    };

    const message = suggester.suggest(group);

    // Mixed A+M markdown files => docs type
    expect(message.type).toBe('docs');
  });

  // Test 5: fix type is suggested for multi-file modifications
  it('should suggest fix type for multi-file modifications', () => {
    const group = {
      id: 'group-1',
      files: [
        { path: 'src/utils/a.ts', status: 'M', domain: 'utils', fileType: 'a.ts' },
        { path: 'src/utils/b.ts', status: 'M', domain: 'utils', fileType: 'b.ts' },
        { path: 'src/utils/c.ts', status: 'M', domain: 'utils', fileType: 'c.ts' },
      ],
      suggestedMessage: { type: 'chore', scope: '', description: '', full: '' },
      similarity: 0.8,
    };

    const message = suggester.suggest(group);

    // Multi-modify matches the "hasModifies && !hasAdds && !hasDeletes" condition, returns 'fix'
    expect(message.type).toBe('fix');
  });

  // Test 6: scope extraction from domains
  it('should extract scope from most common domain', () => {
    const group = {
      id: 'group-1',
      files: [
        { path: 'src/auth/login.ts', status: 'M', domain: 'auth', fileType: '.ts' },
        { path: 'src/auth/logout.ts', status: 'M', domain: 'auth', fileType: '.ts' },
        { path: 'src/auth/verify.ts', status: 'M', domain: 'auth', fileType: '.ts' },
      ],
      suggestedMessage: { type: 'chore', scope: '', description: '', full: '' },
      similarity: 0.8,
    };

    const message = suggester.suggest(group);

    expect(message.scope).toBe('auth');
    expect(message.full).toMatch(/\(auth\)/);
  });
});
