import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  use: { baseURL: 'http://localhost:4173', screenshot: 'only-on-failure' },
  webServer: {
    // build:emulator (mode=development) so the e2e build points at the emulator,
    // NOT real prod. Plain `npm run build` would embed production config.
    command: 'npm run build:emulator && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
