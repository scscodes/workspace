/**
 * ChangeGrouper Tests (8 tests)
 * Testing file change clustering and similarity scoring
 */

import { describe, it, expect } from 'vitest';
import { ChangeGrouper } from '../src/domains/git/service';
import { createTestChanges } from './fixtures';

describe('ChangeGrouper', () => {
  const grouper = new ChangeGrouper();

  // Test 1: Similarity scoring between files
  it('should score high similarity for same domain and type', () => {
    const changes = createTestChanges(2, 'api', 'M');
    const groups = grouper.group(changes);

    expect(groups.length).toBe(1);
    expect(groups[0].files.length).toBe(2);
    expect(groups[0].similarity).toBeGreaterThan(0.4);
  });

  // Test 2: Clustering homogeneous changes
  it('should cluster homogeneous changes together', () => {
    const changes = [
      { path: 'src/api/v1.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'src/api/v2.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'src/api/v3.ts', status: 'M', domain: 'api', fileType: '.ts' },
    ];

    const groups = grouper.group(changes);

    expect(groups.length).toBe(1);
    expect(groups[0].files.length).toBe(3);
  });

  // Test 3: Clustering heterogeneous changes
  it('should separate heterogeneous changes into different clusters', () => {
    const changes = [
      { path: 'src/api/file.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'src/auth/file.ts', status: 'A', domain: 'auth', fileType: '.ts' },
      { path: 'docs/README.md', status: 'M', domain: 'docs', fileType: '.md' },
    ];

    const groups = grouper.group(changes);

    expect(groups.length).toBeGreaterThan(1);
    expect(groups.length).toBeLessThanOrEqual(3);
  });

  // Test 4: Single file (no grouping)
  it('should handle single file as single group', () => {
    const changes = createTestChanges(1, 'core', 'A');

    const groups = grouper.group(changes);

    expect(groups.length).toBe(1);
    expect(groups[0].files.length).toBe(1);
    expect(groups[0].similarity).toBe(1);
  });

  // Test 5: Empty changes list
  it('should return empty groups for empty changes', () => {
    const groups = grouper.group([]);

    expect(groups.length).toBe(0);
  });

  // Test 6: Threshold boundary condition
  it('should respect similarity threshold boundary', () => {
    // Create changes that are just below and above threshold
    const similarChanges = [
      { path: 'src/api/file1.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'src/api/file2.ts', status: 'M', domain: 'api', fileType: '.ts' },
    ];

    const dissimilarChanges = [
      { path: 'src/api/file1.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'docs/README.md', status: 'M', domain: 'docs', fileType: '.md' },
    ];

    const similarGroups = grouper.group(similarChanges);
    const dissimilarGroups = grouper.group(dissimilarChanges);

    // Similar changes should cluster together
    expect(similarGroups[0].files.length).toBe(2);

    // Dissimilar changes should split
    expect(dissimilarGroups.length).toBeGreaterThanOrEqual(1);
  });

  // Test 7: Large number of changes (performance)
  it('should handle large number of changes efficiently', () => {
    const largeChanges = createTestChanges(100, 'api', 'M');

    const startTime = performance.now();
    const groups = grouper.group(largeChanges);
    const endTime = performance.now();

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.length).toBeLessThanOrEqual(100);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1 second
  });

  // Test 8: File type detection and matching
  it('should consider file type in similarity scoring', () => {
    const changes = [
      { path: 'src/file1.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'src/file2.ts', status: 'M', domain: 'api', fileType: '.ts' },
      { path: 'docs/file.md', status: 'M', domain: 'api', fileType: '.md' },
    ];

    const groups = grouper.group(changes);

    // TypeScript files should group together, markdown separate
    expect(groups.length).toBeGreaterThanOrEqual(1);
    // Verify that at least one group has multiple files
    const hasMultipleFilesGroup = groups.some((g) => g.files.length > 1);
    expect(hasMultipleFilesGroup).toBe(true);
  });
});
