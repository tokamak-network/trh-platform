/**
 * Screenshot capture for E2E test report
 * Captures ConfigReview state for each key scenario
 */

import { test } from '@playwright/test';
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

async function selectPreset(page: import('@playwright/test').Page, presetName: string) {
  await page.goto('/rollup/create');
  await page.getByText(presetName, { exact: false }).first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

async function fillAndCapture(
  page: import('@playwright/test').Page,
  opts: {
    preset: string;
    chainName: string;
    feeToken?: 'TON' | 'ETH' | 'USDT' | 'USDC';
    infraProvider?: 'aws' | 'local';
    filename: string;
  }
) {
  await selectPreset(page, opts.preset);
  await page.getByText('Infrastructure Provider').waitFor({ timeout: 10000 });

  const infra = opts.infraProvider ?? 'local';
  if (infra === 'local') {
    await page.getByRole('button', { name: /Local Docker/ }).click();
  } else {
    await page.getByRole('button', { name: /AWS/ }).click();
  }

  await page.locator('#chainName').fill(opts.chainName);

  if (opts.feeToken && opts.feeToken !== 'TON') {
    await page.locator('#feeToken').click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.getByRole('option', { name: new RegExp(`^${opts.feeToken}`) }).click();
  }

  await page.locator('#l1RpcUrl').fill('https://eth-sepolia.example.com');

  const seedInputs = page.locator('input[placeholder="•••••"]');
  await seedInputs.first().fill(TEST_MNEMONIC);
  await page.locator('#seedPhraseConfirm').click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByText('Preset Configuration Review').waitFor({ timeout: 10000 });

  await page.screenshot({ path: `${OUT}/${opts.filename}`, fullPage: true });
}

test('SS-01: Gaming + TON (base AA card)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'Gaming', chainName: 'gaming-ton', filename: 'ft01-gaming-ton.png' });
});

test('SS-02: Gaming + USDT (full paymaster)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'Gaming', chainName: 'gaming-usdt', feeToken: 'USDT', filename: 'ft02-gaming-usdt.png' });
});

test('SS-03: Gaming + ETH (5% markup)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'Gaming', chainName: 'gaming-eth', feeToken: 'ETH', filename: 'ft03-gaming-eth.png' });
});

test('SS-04: Gaming + USDC (3% markup)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'Gaming', chainName: 'gaming-usdc', feeToken: 'USDC', filename: 'ft04-gaming-usdc.png' });
});

test('SS-05: General + USDT (amber card)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'General Purpose', chainName: 'general-usdt', feeToken: 'USDT', filename: 'ft05-general-usdt.png' });
});

test('SS-06: DeFi + ETH (amber card)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'DeFi', chainName: 'defi-eth', feeToken: 'ETH', filename: 'ft06-defi-eth.png' });
});

test('SS-07: General + TON (no cards)', async ({ page }) => {
  await fillAndCapture(page, { preset: 'General Purpose', chainName: 'general-ton', filename: 'ft07-general-ton.png' });
});

test('SS-08: Local Docker info card', async ({ page }) => {
  await fillAndCapture(page, { preset: 'General Purpose', chainName: 'local-deploy', infraProvider: 'local', filename: 'ft08-local-docker.png' });
});

test('SS-09: Expert Mode enabled', async ({ page }) => {
  await fillAndCapture(page, { preset: 'General Purpose', chainName: 'expert-mode', filename: 'ft09-before-expert.png' });
  // Enable Expert Mode and capture
  await page.getByRole('switch').first().click();
  await page.screenshot({ path: `${OUT}/ft09-expert-mode-on.png`, fullPage: true });
});

test('SS-10: Chain name validation error', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await page.getByText('Infrastructure Provider').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Local Docker/ }).click();
  await page.locator('#chainName').fill('Invalid Chain Name!');
  await page.locator('#l1RpcUrl').fill('https://eth-sepolia.example.com');
  const seedInputs = page.locator('input[placeholder="•••••"]');
  await seedInputs.first().fill(TEST_MNEMONIC);
  await page.locator('#seedPhraseConfirm').click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ft10-validation-error.png`, fullPage: true });
});
