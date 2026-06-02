import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,emulator.test}.ts'],
    // NOTE: do NOT exclude emulator tests here — Vitest's `exclude` beats
    // `--include`, which would silently disable `npm run test:emulator`.
    // The `npm test` script excludes them via a CLI flag instead.
    // Generous timeout: emulator tests with onSnapshot can be slow to emit
    // under load on some machines; the margin avoids flaky timeouts.
    testTimeout: 20000,
  },
});
