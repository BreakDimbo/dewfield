import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5391',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5391',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
