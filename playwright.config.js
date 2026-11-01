import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://localhost:8777', locale: 'de-CH' },
  webServer: [
    { command: 'python3 -m http.server 8777 -d dist', url: 'http://localhost:8777/', reuseExistingServer: true },
    ...(process.env.TEST_DATABASE_URL ? [{ command: 'node scripts/dev-server.mjs', url: 'http://localhost:3111/api/health', reuseExistingServer: true,
      env: { PORT: '3111', DATABASE_URL: process.env.TEST_DATABASE_URL, BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0123', BETTER_AUTH_URL: 'http://localhost:3111' } }] : []),
  ],
});
