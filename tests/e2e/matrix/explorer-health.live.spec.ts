/**
 * Matrix Health Check — Explorer (Tier 1)
 *
 * Runs for ALL presets. Verifies Blockscout API responds with blocks
 * and the explorer frontend loads successfully.
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/explorer-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const config = getStackConfig();
let urls: StackUrls;

test.describe(`Explorer Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    urls = await resolveStackUrls(config.chainName);
  });

  test('Blockscout API responds with blocks', async () => {
    const resp = await fetch(`${urls.explorerApiUrl}/blocks?limit=1`);
    expect(resp.ok).toBe(true);

    const body = await resp.json() as Record<string, unknown>;
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('Explorer frontend loads', async ({ page }) => {
    await page.goto(urls.explorerUrl, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `${OUT}/matrix-explorer-${config.preset}.png`,
      fullPage: true,
    });

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
