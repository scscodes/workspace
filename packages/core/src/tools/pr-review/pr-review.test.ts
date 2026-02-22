import { describe, it, expect } from 'vitest';
import { parseDiff } from './index.js';

describe('PR Review Tool', () => {
  describe('parseDiff()', () => {
    it('should parse single file diff', () => {
      const diff = `diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
+export function hello() {
 console.log("test");
-const x = 1;
+const x = 2;
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]?.filePath).toBe('src/main.ts');
      expect(result[0]?.additions).toBe(2);
      expect(result[0]?.deletions).toBe(1);
    });

    it('should parse multi-file diff', () => {
      const diff = `diff --git a/file1.ts b/file1.ts
index abc1234..def5678 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1 +1,2 @@
+line1
 line2
diff --git a/file2.js b/file2.js
index def5678..abc1234 100644
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1 @@
 const x = 1;
-const y = 2;
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(2);
      expect(result[0]?.filePath).toBe('file1.ts');
      expect(result[1]?.filePath).toBe('file2.js');
    });

    it('should handle empty diff', () => {
      const result = parseDiff('');
      expect(result).toHaveLength(0);
    });

    it('should count additions and deletions', () => {
      const diff = `diff --git a/test.ts b/test.ts
index abc..def 100644
--- a/test.ts
+++ b/test.ts
@@ -1,5 +1,6 @@
+new line
 line1
-old line
-old line 2
 line3
+another new
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]?.additions).toBe(2);
      expect(result[0]?.deletions).toBe(2);
    });

    it('should extract diff content', () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
index abc..def 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
+export function test() {
 const x = 1;
-const y = 2;
`;

      const result = parseDiff(diff);

      expect(result[0]?.diffContent).toBeTruthy();
      expect(result[0]?.diffContent).toContain('+export');
      expect(result[0]?.diffContent).toContain('-const y');
    });

    it('should handle files with paths containing spaces (escaped)', () => {
      const diff = `diff --git a/src/my file.ts b/src/my file.ts
index abc..def 100644
--- a/src/my file.ts
+++ b/src/my file.ts
@@ -1 +1,2 @@
+new
 old
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]?.filePath).toBe('src/my file.ts');
    });
  });
});
