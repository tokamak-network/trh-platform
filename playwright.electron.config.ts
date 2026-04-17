/**
 * Playwright config for testing the Electron app directly.
 *
 * Launches the built Electron binary via _electron.launch() instead of a browser.
 * Targets electron-*.live.spec.ts files only.
 *
 * Usage: npx playwright test --config playwright.electron.config.ts
 *
 * Prerequisites:
 *   - npm run build (builds dist/main/index.js)
 *   - Docker running with backend services (make up)
 *   - Sepolia L1 RPC accessible (set LIVE_L1_RPC_URL)
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/electron-*.live.spec.ts', '**/drb-gaming-deploy.spec.ts'],
  fullyParallel: false,   // serial — Electron app is a singleton process
  forbidOnly: !!process.env.CI,
  retries: 0,             // no retries — each run deploys real L2 contracts
  workers: 1,
  timeout: 1_800_000,     // 30 min per test — DeFi preset Sepolia deploy takes 20+ min
  expect: { timeout: 120_000 }, // 2 min — Electron app loading time
  reporter: [['html', { outputFolder: 'playwright-report-electron' }]],
  // No webServer — Electron app manages its own backend connection
  // No use.baseURL — Electron uses file:// protocol
  projects: [
    {
      name: 'electron',
      // Electron is its own browser — no device/browser config needed
    },
  ],
});
