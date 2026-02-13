import { describe, it, expect } from 'vitest';
import { parsePorcelainLine } from './status.js';

describe('parsePorcelainLine', () => {
  it('parses untracked file', () => {
    const result = parsePorcelainLine('?? src/new-file.ts');
    expect(result).toEqual({
      filePath: 'src/new-file.ts',
      status: 'untracked',
      staged: false,
    });
  });

  it('parses modified, unstaged', () => {
    const result = parsePorcelainLine(' M src/existing.ts');
    expect(result).toEqual({
      filePath: 'src/existing.ts',
      status: 'modified',
      staged: false,
    });
  });

  it('parses modified, staged', () => {
    const result = parsePorcelainLine('M  src/existing.ts');
    expect(result).toEqual({
      filePath: 'src/existing.ts',
      status: 'modified',
      staged: true,
    });
  });

  it('parses modified, both staged and unstaged', () => {
    const result = parsePorcelainLine('MM src/existing.ts');
    expect(result).toEqual({
      filePath: 'src/existing.ts',
      status: 'modified',
      staged: true,
    });
  });

  it('parses added file', () => {
    const result = parsePorcelainLine('A  src/brand-new.ts');
    expect(result).toEqual({
      filePath: 'src/brand-new.ts',
      status: 'added',
      staged: true,
    });
  });

  it('parses deleted file (staged)', () => {
    const result = parsePorcelainLine('D  src/removed.ts');
    expect(result).toEqual({
      filePath: 'src/removed.ts',
      status: 'deleted',
      staged: true,
    });
  });

  it('parses deleted file (unstaged)', () => {
    const result = parsePorcelainLine(' D src/removed.ts');
    expect(result).toEqual({
      filePath: 'src/removed.ts',
      status: 'deleted',
      staged: false,
    });
  });

  it('parses renamed file', () => {
    const result = parsePorcelainLine('R  old-name.ts -> new-name.ts');
    expect(result).toEqual({
      filePath: 'new-name.ts',
      status: 'renamed',
      staged: true,
    });
  });

  it('skips ignored files', () => {
    const result = parsePorcelainLine('!! node_modules/');
    expect(result).toBeNull();
  });

  it('returns null for malformed lines', () => {
    expect(parsePorcelainLine('')).toBeNull();
    expect(parsePorcelainLine('X')).toBeNull();
    expect(parsePorcelainLine('XY')).toBeNull();
  });

  it('handles paths with spaces', () => {
    const result = parsePorcelainLine('M  src/my file.ts');
    expect(result).toEqual({
      filePath: 'src/my file.ts',
      status: 'modified',
      staged: true,
    });
  });
});
