/**
 * Matrix Health Check — Bridge (Tier 1)
 *
 * Runs for ALL presets. Verifies bridge UI loads and displays the correct
 * fee token for the active stack configuration.
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/bridge-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const config = getStackConfig();
let urls: StackUrls;

test.describe(`Bridge Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    urls = await resolveStackUrls(config.chainName);
  });

  test('bridge UI loads', async ({ page }) => {
    await page.goto(urls.bridgeUrl, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `${OUT}/matrix-bridge-${config.preset}.png`,
      fullPage: true,
    });

    const hasDeposit = page.locator('text=Deposit').or(page.locator('text=Bridge'));
    await expect(hasDeposit.first()).toBeVisible({ timeout: 30_000 });
  });

  test('correct fee token displayed on bridge', async ({ page }) => {
    await page.goto(urls.bridgeUrl, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(config.feeToken, {
      timeout: 30_000,
    });
  });
});
