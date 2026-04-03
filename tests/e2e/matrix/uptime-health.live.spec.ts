/**
 * Matrix Health Check — Uptime Service (Tier 2)
 *
 * SKIPS for General preset (uptimeService not in module list).
 * Verifies Uptime Kuma page loads.
 *
 * Usage:
 *   LIVE_PRESET=defi LIVE_FEE_TOKEN=ETH npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/uptime-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const config = getStackConfig();
let urls: StackUrls;

test.describe(`Uptime Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.skip(!isModuleEnabled(config.preset, 'uptimeService'), 'Uptime service not in preset');
    urls = await resolveStackUrls(config.chainName);
  });

  test('Uptime Kuma page loads', async ({ page }) => {
    await page.goto(urls.uptimeUrl, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `${OUT}/matrix-uptime-${config.preset}.png`,
      fullPage: true,
    });

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
