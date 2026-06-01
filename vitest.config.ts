import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,emulator.test}.ts'],
    // Emulator tests are excluded by default (npm test).
    // npm run test:emulator passes --include override to run them explicitly.
    exclude: ['**/*.emulator.test.ts', 'node_modules/**'],
    testTimeout: 10000,
  },
});
