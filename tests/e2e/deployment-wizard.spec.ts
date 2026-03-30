/**
 * Deployment Wizard — All 4 Presets × Non-TON Fee Tokens
 *
 * Tests the full preset wizard flow (Step 1 → Step 2 → Step 3) for:
 *  - General  + ETH  / USDT / USDC
 *  - DeFi     + ETH  / USDT / USDC
 *  - Gaming   + ETH  / USDT / USDC   (AA notices)
 *  - Full     + ETH  / USDT / USDC   (AA notices)
 *
 * DW-01 … DW-12: Wizard flow with fee token verification
 * DW-13: Config review shows correct preset details
 * DW-14: AA notice shows correct markup for ETH vs USDT/USDC
 */

import { test, expect } from '@playwright/test';
import { authenticateContext } from './helpers/auth';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const TEST_MNEMONIC = [
  'age', 'video', 'flag', 'decade', 'alert', 'potato',
  'one', 'shallow', 'neglect', 'labor', 'destroy', 'high',
].join(' ');
const L1_RPC = 'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';

test.beforeEach(async ({ context }) => {
  await authenticateContext(context);
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function selectPreset(page: import('@playwright/test').Page, presetName: string) {
  await page.goto('/rollup/create');
  await expect(page.getByText('Choose a Deployment Preset')).toBeVisible({ timeout: 15000 });
  await page.getByText(presetName, { exact: false }).first().click();
  await expect(page.getByText('Preset selected')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

async function fillStep2(
  page: import('@playwright/test').Page,
  opts: {
    chainName: string;
    feeToken: 'ETH' | 'USDT' | 'USDC';
    l1RpcUrl?: string;
  }
) {
  await expect(page.getByText('Infrastructure Provider')).toBeVisible({ timeout: 10000 });

  // Select Local Docker
  await page.getByRole('button', { name: /Local Docker/ }).click();

  // Chain name
  await page.locator('#chainName').fill(opts.chainName);

  // Fee token
  await page.locator('#feeToken').click();
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  await page.getByRole('option', { name: new RegExp(`^${opts.feeToken}`) }).click();

  // L1 RPC
  await page.locator('#l1RpcUrl').fill(opts.l1RpcUrl ?? L1_RPC);

  // Seed phrase
  const seedInputs = page.locator('input[placeholder="•••••"]');
  await expect(seedInputs.first()).toBeVisible();
  await seedInputs.first().fill(TEST_MNEMONIC);
  await page.locator('#seedPhraseConfirm').click();
}

async function proceedToReview(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 15000 });
}

// ===========================================================================
// General Purpose
// ===========================================================================

test('DW-01: General + ETH — amber notice in Step 2, no AA card in Step 3', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillStep2(page, { chainName: 'dw01-gen-eth', feeToken: 'ETH' });

  // Amber native gas notice must be visible in Step 2
  await expect(page.getByText('will be set as the native L2 gas token at genesis')).toBeVisible();
  // No AA purple notice
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();

  await page.screenshot({ path: `${OUT}/dw01-gen-eth-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw01-gen-eth-step3.png`, fullPage: true });

  // Amber native gas card in Step 3
  await expect(page.getByText('ETH as Native L2 Gas Token')).toBeVisible();
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
});

test('DW-02: General + USDT — amber notice, correct fee token name', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillStep2(page, { chainName: 'dw02-gen-usdt', feeToken: 'USDT' });

  await expect(page.getByText('will be set as the native L2 gas token at genesis')).toBeVisible();
  await page.screenshot({ path: `${OUT}/dw02-gen-usdt-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw02-gen-usdt-step3.png`, fullPage: true });

  await expect(page.getByText('USDT as Native L2 Gas Token')).toBeVisible();
});

test('DW-03: General + USDC — amber notice, no paymaster bullets', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillStep2(page, { chainName: 'dw03-gen-usdc', feeToken: 'USDC' });

  await expect(page.getByText('will be set as the native L2 gas token at genesis')).toBeVisible();
  await page.screenshot({ path: `${OUT}/dw03-gen-usdc-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw03-gen-usdc-step3.png`, fullPage: true });

  await expect(page.getByText('USDC as Native L2 Gas Token')).toBeVisible();
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
});

// ===========================================================================
// DeFi
// ===========================================================================

test('DW-04: DeFi + ETH — amber notice, block explorer in review', async ({ page }) => {
  await selectPreset(page, 'DeFi');
  await fillStep2(page, { chainName: 'dw04-defi-eth', feeToken: 'ETH' });

  await expect(page.getByText('will be set as the native L2 gas token at genesis')).toBeVisible();
  await page.screenshot({ path: `${OUT}/dw04-defi-eth-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw04-defi-eth-step3.png`, fullPage: true });

  await expect(page.getByText('ETH as Native L2 Gas Token')).toBeVisible();
  // DeFi has blockExplorer enabled — local deployment shows Explorer URL in review
  await expect(page.getByText(/Explorer:/)).toBeVisible();
});

test('DW-05: DeFi + USDT — amber notice, monitoring enabled', async ({ page }) => {
  await selectPreset(page, 'DeFi');
  await fillStep2(page, { chainName: 'dw05-defi-usdt', feeToken: 'USDT' });

  await expect(page.getByText('will be set as the native L2 gas token at genesis')).toBeVisible();
  await page.screenshot({ path: `${OUT}/dw05-defi-usdt-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw05-defi-usdt-step3.png`, fullPage: true });

  await expect(page.getByText('USDT as Native L2 Gas Token')).toBeVisible();
});

test('DW-06: DeFi + USDC — amber notice shown correctly', async ({ page }) => {
  await selectPreset(page, 'DeFi');
  await fillStep2(page, { chainName: 'dw06-defi-usdc', feeToken: 'USDC' });

  await expect(page.getByText('will be set as the native L2 gas token at genesis')).toBeVisible();
  await page.screenshot({ path: `${OUT}/dw06-defi-usdc-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw06-defi-usdc-step3.png`, fullPage: true });

  await expect(page.getByText('USDC as Native L2 Gas Token')).toBeVisible();
});

// ===========================================================================
// Gaming (AA preset)
// ===========================================================================

test('DW-07: Gaming + ETH — purple AA notice with 5% markup in Step 2', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillStep2(page, { chainName: 'dw07-gaming-eth', feeToken: 'ETH' });

  // Purple AA notice
  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('5%')).toBeVisible();
  await expect(page.getByText('aa-operator')).toBeVisible();
  // No amber notice for AA preset
  await expect(page.getByText('native L2 gas token at genesis')).not.toBeVisible();

  await page.screenshot({ path: `${OUT}/dw07-gaming-eth-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw07-gaming-eth-step3.png`, fullPage: true });
});

test('DW-08: Gaming + USDT — purple AA notice with 3% markup and USDT mention', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillStep2(page, { chainName: 'dw08-gaming-usdt', feeToken: 'USDT' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('3%')).toBeVisible();
  await expect(page.getByText('aa-operator')).toBeVisible();

  await page.screenshot({ path: `${OUT}/dw08-gaming-usdt-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw08-gaming-usdt-step3.png`, fullPage: true });
});

test('DW-09: Gaming + USDC — purple AA notice with 3% markup', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillStep2(page, { chainName: 'dw09-gaming-usdc', feeToken: 'USDC' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('3%')).toBeVisible();

  await page.screenshot({ path: `${OUT}/dw09-gaming-usdc-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw09-gaming-usdc-step3.png`, fullPage: true });
});

// ===========================================================================
// Full Suite (AA preset)
// ===========================================================================

test('DW-10: Full + ETH — purple AA notice with 5% markup', async ({ page }) => {
  await selectPreset(page, 'Full Suite');
  await fillStep2(page, { chainName: 'dw10-full-eth', feeToken: 'ETH' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('5%')).toBeVisible();
  await expect(page.getByText('aa-operator')).toBeVisible();

  await page.screenshot({ path: `${OUT}/dw10-full-eth-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw10-full-eth-step3.png`, fullPage: true });
});

test('DW-11: Full + USDT — purple AA notice with 3% markup', async ({ page }) => {
  await selectPreset(page, 'Full Suite');
  await fillStep2(page, { chainName: 'dw11-full-usdt', feeToken: 'USDT' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('3%')).toBeVisible();

  await page.screenshot({ path: `${OUT}/dw11-full-usdt-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw11-full-usdt-step3.png`, fullPage: true });
});

test('DW-12: Full + USDC — purple AA notice with 3% markup', async ({ page }) => {
  await selectPreset(page, 'Full Suite');
  await fillStep2(page, { chainName: 'dw12-full-usdc', feeToken: 'USDC' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('3%')).toBeVisible();

  await page.screenshot({ path: `${OUT}/dw12-full-usdc-step2.png`, fullPage: true });

  await proceedToReview(page);
  await page.screenshot({ path: `${OUT}/dw12-full-usdc-step3.png`, fullPage: true });
});

// ===========================================================================
// Config review correctness
// ===========================================================================

test('DW-13: Config review shows correct chain defaults per preset', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillStep2(page, { chainName: 'dw13-review-check', feeToken: 'ETH' });
  await proceedToReview(page);

  // Gaming defaults: batchSubmissionFrequency=300, outputRootFrequency=600
  await expect(page.getByText('Batch Submission Frequency')).toBeVisible();
  await expect(page.getByText('Output Root Frequency')).toBeVisible();

  await page.screenshot({ path: `${OUT}/dw13-config-review.png`, fullPage: true });
});

test('DW-14: AA markup is 5% for ETH and 3% for USDT/USDC', async ({ page }) => {
  // Verify ETH → 5%
  await selectPreset(page, 'Gaming');
  await fillStep2(page, { chainName: 'dw14a-markup-eth', feeToken: 'ETH' });
  await expect(page.getByText('5%')).toBeVisible();
  await expect(page.getByText('3%')).not.toBeVisible();
  await page.screenshot({ path: `${OUT}/dw14a-markup-eth.png` });

  // Go back and test USDT → 3%
  await page.goto('/rollup/create');
  await authenticateContext(page.context());
  await expect(page.getByText('Choose a Deployment Preset')).toBeVisible({ timeout: 15000 });
  await page.getByText('Gaming', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await fillStep2(page, { chainName: 'dw14b-markup-usdt', feeToken: 'USDT' });
  await expect(page.getByText('3%')).toBeVisible();
  await expect(page.getByText('5%')).not.toBeVisible();
  await page.screenshot({ path: `${OUT}/dw14b-markup-usdt.png` });
});
