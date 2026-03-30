/**
 * Step 2 fee token notice screenshots
 */

import { test, expect } from '@playwright/test';
import { authenticateContext } from './helpers/auth';

const OUT = '/tmp/pw-screenshots';
const TEST_MNEMONIC = [
  'abandon', 'abandon', 'abandon', 'abandon',
  'abandon', 'abandon', 'abandon', 'abandon',
  'abandon', 'abandon', 'abandon', 'about',
].join(' ');

test.beforeEach(async ({ context }) => {
  await authenticateContext(context);
});

async function goToStep2(page: import('@playwright/test').Page, presetName: string) {
  await page.goto('/rollup/create');
  await expect(page.getByText('Choose a Deployment Preset')).toBeVisible({ timeout: 15000 });
  await page.getByText(presetName, { exact: false }).first().click();
  await expect(page.getByText('Preset selected')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Infrastructure Provider')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Local Docker/ }).click();
}

async function selectFeeToken(page: import('@playwright/test').Page, token: string) {
  await page.locator('#feeToken').click();
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  await page.getByRole('option', { name: new RegExp(`^${token}`) }).click();
}

test('Notice: Gaming + USDT → purple AA notice in Step 2', async ({ page }) => {
  await goToStep2(page, 'Gaming');
  await selectFeeToken(page, 'USDT');
  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await page.screenshot({ path: `${OUT}/step2-gaming-usdt-notice.png`, fullPage: true });
});

test('Notice: Gaming + ETH → purple AA notice with 5% markup', async ({ page }) => {
  await goToStep2(page, 'Gaming');
  await selectFeeToken(page, 'ETH');
  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('5%')).toBeVisible();
  await page.screenshot({ path: `${OUT}/step2-gaming-eth-notice.png`, fullPage: true });
});

test('Notice: General + USDT → amber native gas token notice', async ({ page }) => {
  await goToStep2(page, 'General Purpose');
  await selectFeeToken(page, 'USDT');
  await expect(page.getByText(/native L2 gas token at genesis/)).toBeVisible();
  // No AA notice
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
  await page.screenshot({ path: `${OUT}/step2-general-usdt-notice.png`, fullPage: true });
});

test('Notice: Gaming + TON → no notice shown', async ({ page }) => {
  await goToStep2(page, 'Gaming');
  // Default is TON — no notice
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
  await expect(page.getByText(/native L2 gas token at genesis/)).not.toBeVisible();
  await page.screenshot({ path: `${OUT}/step2-gaming-ton-no-notice.png`, fullPage: true });
});
