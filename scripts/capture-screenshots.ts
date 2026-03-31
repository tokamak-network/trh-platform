// Playwright screenshot capture script for TRH Platform
//
// Run: VITE_MOCK_ELECTRON=true npx vite --port 5174 & sleep 3 && npx tsx scripts/capture-screenshots.ts; kill %1
// Or use: npm run screenshots
//
// Prerequisites:
//   - @playwright/test installed (already in devDependencies)
//   - Vite dev server running with VITE_MOCK_ELECTRON=true on port 5174

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://localhost:5174';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;

interface ScreenshotTask {
  filename: string;
  scenario: string;
  description: string;
  capture: (page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>) => Promise<void>;
}

const SCREENSHOTS: ScreenshotTask[] = [
  {
    filename: '01-setup-wizard.png',
    scenario: 'fresh',
    description: 'Setup wizard with Docker check in progress',
    capture: async (page) => {
      await page.waitForSelector('.setup-page', { timeout: 5000 });
      // Capture while first step is loading
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '02-setup-progress.png',
    scenario: 'fresh',
    description: 'Setup progress with mixed step states',
    capture: async (page) => {
      await page.waitForSelector('.setup-page', { timeout: 5000 });
      // Wait for at least one success step
      await page.waitForSelector('.step.success', { timeout: 10000 });
      await page.waitForTimeout(200);
    },
  },
  {
    filename: '03-keystore-input.png',
    scenario: 'keysetup-input',
    description: 'Seed phrase input form (empty)',
    capture: async (page) => {
      // keysetup-input: setup steps run fast, then key form shows
      await page.waitForSelector('.seed-input', { timeout: 15000 });
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '04-keystore-stored.png',
    scenario: 'keysetup-stored',
    description: 'Keys already stored with address table',
    capture: async (page) => {
      // keysetup-stored: has() returns true, shows stored addresses
      await page.waitForSelector('.seed-addresses', { timeout: 15000 });
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '05-hd-wallet-derivation.png',
    scenario: 'keysetup-input',
    description: 'BIP44 HD wallet derivation with derived addresses',
    capture: async (page) => {
      await page.waitForSelector('.seed-input', { timeout: 15000 });
      // Fill with test mnemonic
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      await page.fill('.seed-input', testMnemonic);
      // Wait for address preview to appear
      await page.waitForSelector('.seed-addresses', { timeout: 5000 });
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '06-webapp-view.png',
    scenario: 'healthy',
    description: 'Webapp overlay with version badge',
    capture: async (page) => {
      // healthy scenario: App.tsx auto-routes to webapp view
      await page.waitForSelector('.version', { timeout: 5000 });
      await page.waitForTimeout(500);
    },
  },
  {
    filename: '07-update-notification.png',
    scenario: 'healthy-update',
    description: 'Update available banner',
    capture: async (page) => {
      // healthy-update: triggers onUpdateAvailable after 500ms
      await page.waitForSelector('.update-banner-global', { timeout: 5000 });
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '08-notifications.png',
    scenario: 'healthy',
    description: 'Webapp view (notification page requires webview navigation)',
    capture: async (page) => {
      // Notification page requires webview navigation which mock can't fully trigger.
      // Capture webapp view as placeholder.
      await page.waitForSelector('.version', { timeout: 5000 });
      await page.waitForTimeout(500);
    },
  },
  {
    filename: '09-uninstall-modal.png',
    scenario: 'healthy',
    description: 'Uninstall confirmation dialog',
    capture: async (page) => {
      await page.waitForSelector('.version', { timeout: 5000 });
      await page.waitForTimeout(300);
      // Click gear button
      await page.click('.gear-btn');
      await page.waitForSelector('.gear-dropdown', { timeout: 2000 });
      // Click Uninstall button
      await page.click('.gear-uninstall-btn');
      await page.waitForSelector('.uninstall-modal', { timeout: 2000 });
      await page.waitForTimeout(200);
    },
  },
  {
    filename: '10-port-conflict.png',
    scenario: 'port-conflict',
    description: 'Port conflict resolution dialog',
    capture: async (page) => {
      // port-conflict scenario: shows modal during container start
      await page.waitForSelector('.modal-overlay.visible', { timeout: 15000 });
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '11-setup-complete.png',
    scenario: 'fresh',
    description: 'Completed setup wizard (all steps success)',
    capture: async (page) => {
      await page.waitForSelector('.setup-page', { timeout: 5000 });
      // Wait for multiple success steps (setup takes time in fresh scenario)
      // Wait for key setup step to appear, indicating all prior steps passed
      try {
        await page.waitForSelector('.key-setup-form', { timeout: 30000 });
      } catch {
        // If key form doesn't appear, wait for at least 4 success steps
        await page.waitForTimeout(5000);
      }
      await page.waitForTimeout(300);
    },
  },
  {
    filename: '12-gear-menu.png',
    scenario: 'healthy',
    description: 'Gear dropdown menu with version and Uninstall',
    capture: async (page) => {
      await page.waitForSelector('.version', { timeout: 5000 });
      await page.waitForTimeout(300);
      // Click gear button
      await page.click('.gear-btn');
      await page.waitForSelector('.gear-dropdown', { timeout: 2000 });
      await page.waitForTimeout(200);
    },
  },
];

async function main(): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Screenshot capture starting`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Viewport: ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x`);
  console.log(`  Screenshots: ${SCREENSHOTS.length}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  let succeeded = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < SCREENSHOTS.length; i++) {
    const task = SCREENSHOTS[i];
    const index = `[${i + 1}/${SCREENSHOTS.length}]`;
    const outputPath = path.join(OUTPUT_DIR, task.filename);

    console.log(`${index} Capturing ${task.filename} (${task.description})...`);

    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}?scenario=${task.scenario}`, {
        waitUntil: 'networkidle',
        timeout: 10000,
      });

      await task.capture(page);

      await page.screenshot({
        path: outputPath,
        fullPage: false,
      });

      console.log(`  -> Saved: ${task.filename}`);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  -> FAILED: ${msg}`);
      failures.push(`${task.filename}: ${msg}`);
      failed++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Screenshot capture complete`);
  console.log(`  Succeeded: ${succeeded}/${SCREENSHOTS.length}`);
  console.log(`  Failed: ${failed}/${SCREENSHOTS.length}`);

  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
