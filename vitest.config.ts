import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'out/',
        'tests/',
      ],
      lines: 70,
      functions: 70,
      branches: 65,
      statements: 70,
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'out'],
    testTimeout: 10000,
  },
});
