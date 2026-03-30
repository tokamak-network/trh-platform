/**
 * Playwright config for testing against the LIVE running platform stack.
 * - Platform UI: http://localhost:3000 (real backend, no MSW)
 * - Bridge:      http://localhost:3001
 * - Explorer:    http://localhost:4001
 *
 * Usage: npx playwright test --config playwright.live.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.live.spec.ts',
  fullyParallel: false, // serial — all tests share the same live L2
  forbidOnly: !!process.env.CI,
  retries: 0, // no retries — each run re-sends real txs
  workers: 1,
  timeout: 900_000,          // 15 min per test (dispute games need ~10 min)
  expect: { timeout: 60_000 },
  reporter: [['html', { outputFolder: 'playwright-report-live' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — the live stack is expected to already be running
});
