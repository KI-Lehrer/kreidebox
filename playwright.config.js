import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://localhost:8777', locale: 'de-CH' },
  webServer: { command: 'python3 -m http.server 8777 -d dist', url: 'http://localhost:8777/', reuseExistingServer: true },
});
