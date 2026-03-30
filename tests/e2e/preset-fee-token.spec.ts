/**
 * Preset Wizard — Fee Token & AA Notice Tests
 *
 * Covers fee token selection and the resulting ConfigReview notices:
 *
 * FT-01  TON (default) + Gaming → AA card shows base AA only (no paymaster bullets)
 * FT-02  USDT + Gaming → AA card shows full paymaster bullets + aa-operator bullet
 * FT-03  ETH  + Gaming → AA card shows full paymaster bullets (5% markup, no USDT bridge)
 * FT-04  USDC + Gaming → AA card shows full paymaster bullets (3% markup, no USDT bridge)
 * FT-05  USDT + General → Amber "native gas token" card shown, NO purple AA card
 * FT-06  ETH  + DeFi   → Amber card shown, NO purple AA card
 * FT-07  TON  + General → No notice cards at all
 * FT-08  Local Docker info card shown when infraProvider = local
 * FT-09  Expert Mode toggle enables editable inputs
 * FT-10  Chain name validation — rejects invalid characters
 */

import { test, expect } from '@playwright/test';
import { authenticateContext } from './helpers/auth';

const TEST_MNEMONIC = [
  'abandon', 'abandon', 'abandon', 'abandon',
  'abandon', 'abandon', 'abandon', 'abandon',
  'abandon', 'abandon', 'abandon', 'about',
].join(' ');

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

async function fillBasicInfo(
  page: import('@playwright/test').Page,
  opts: {
    chainName: string;
    feeToken?: 'TON' | 'ETH' | 'USDT' | 'USDC';
    infraProvider?: 'aws' | 'local';
  }
) {
  await expect(page.getByText('Infrastructure Provider')).toBeVisible({ timeout: 10000 });

  // Infrastructure provider
  const infra = opts.infraProvider ?? 'local';
  if (infra === 'local') {
    await page.getByRole('button', { name: /Local Docker/ }).click();
  } else {
    await page.getByRole('button', { name: /AWS/ }).click();
  }

  // Chain name
  await page.locator('#chainName').fill(opts.chainName);

  // Fee token (default = TON; skip if not specified)
  // SelectItem renders as "{symbol} - {name}" e.g. "USDT - Tether USD"
  if (opts.feeToken && opts.feeToken !== 'TON') {
    await page.locator('#feeToken').click();
    // Wait for Radix portal to render options
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.getByRole('option', { name: new RegExp(`^${opts.feeToken}`) }).click();
  }

  // L1 RPC URL
  await page.locator('#l1RpcUrl').fill('https://eth-sepolia.example.com');

  // Seed phrase — paste into first input
  const seedInputs = page.locator('input[placeholder="•••••"]');
  await expect(seedInputs.first()).toBeVisible();
  await seedInputs.first().fill(TEST_MNEMONIC);
  await page.locator('#seedPhraseConfirm').click();

  // Advance to step 3
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10000 });
}

// ---------------------------------------------------------------------------
// FT-01: TON + Gaming → base AA card only
// ---------------------------------------------------------------------------

test('FT-01: Gaming + TON shows AA card without paymaster bullets', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillBasicInfo(page, { chainName: 'test-gaming-ton' }); // feeToken defaults to TON

  // Purple AA card must appear
  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();

  // Base AA predeploys are listed
  await expect(page.getByText('EntryPoint')).toBeVisible();
  await expect(page.getByText('MultiTokenPaymaster')).toBeVisible();
  await expect(page.getByText('SimplePriceOracle')).toBeVisible();

  // Paymaster-specific bullets must NOT appear when fee token = TON
  await expect(page.getByText('aa-operator')).not.toBeVisible();
  await expect(page.getByText('CoinGecko')).not.toBeVisible();
  await expect(page.getByText('auto-refilled')).not.toBeVisible();

  // Amber card must NOT appear
  await expect(page.getByText('as Native L2 Gas Token')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-02: USDT + Gaming → full paymaster bullets including aa-operator
// ---------------------------------------------------------------------------

test('FT-02: Gaming + USDT shows full AA card with aa-operator and USDT bridge bullet', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillBasicInfo(page, { chainName: 'test-gaming-usdt', feeToken: 'USDT' });

  // Purple card visible
  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();

  // USDT-specific bullet
  await expect(page.getByText(/Bridged.*USDT.*deployed on L2/)).toBeVisible();

  // USDT registered with 3% markup
  await expect(page.getByText(/USDT.*registered.*MultiTokenPaymaster/)).toBeVisible();
  await expect(page.getByText('3%')).toBeVisible();

  // CoinGecko price update bullet
  await expect(page.getByText(/CoinGecko.*10 min/)).toBeVisible();

  // Auto-refill bullet
  await expect(page.getByText(/auto-refilled/)).toBeVisible();
  await expect(page.getByText('0.5 TON')).toBeVisible();

  // aa-operator Docker service bullet
  await expect(page.getByText('aa-operator')).toBeVisible();

  // Amber card must NOT appear for Gaming preset
  await expect(page.getByText('as Native L2 Gas Token')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-03: ETH + Gaming → 5% markup, no USDT bridge bullet
// ---------------------------------------------------------------------------

test('FT-03: Gaming + ETH shows 5% markup and no USDT bridge bullet', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillBasicInfo(page, { chainName: 'test-gaming-eth', feeToken: 'ETH' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();

  // ETH markup is 5%
  await expect(page.getByText('5%')).toBeVisible();

  // No USDT bridge bullet
  await expect(page.getByText(/Bridged.*USDT/)).not.toBeVisible();

  // aa-operator still present
  await expect(page.getByText('aa-operator')).toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-04: USDC + Gaming → 3% markup, no USDT bridge bullet
// ---------------------------------------------------------------------------

test('FT-04: Gaming + USDC shows 3% markup and no USDT bridge bullet', async ({ page }) => {
  await selectPreset(page, 'Gaming');
  await fillBasicInfo(page, { chainName: 'test-gaming-usdc', feeToken: 'USDC' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).toBeVisible();
  await expect(page.getByText('3%')).toBeVisible();
  await expect(page.getByText(/Bridged.*USDT/)).not.toBeVisible();
  await expect(page.getByText('aa-operator')).toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-05: USDT + General → amber native gas token card, no AA card
// ---------------------------------------------------------------------------

test('FT-05: General + USDT shows amber native gas token card, no AA card', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillBasicInfo(page, { chainName: 'test-general-usdt', feeToken: 'USDT' });

  // Amber card visible
  await expect(page.getByText('USDT as Native L2 Gas Token')).toBeVisible();
  await expect(page.getByText(/native L2 gas token at genesis/)).toBeVisible();

  // Purple AA card must NOT appear for General preset
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-06: ETH + DeFi → amber native gas token card
// ---------------------------------------------------------------------------

test('FT-06: DeFi + ETH shows amber native gas token card', async ({ page }) => {
  await selectPreset(page, 'DeFi');
  await fillBasicInfo(page, { chainName: 'test-defi-eth', feeToken: 'ETH' });

  await expect(page.getByText('ETH as Native L2 Gas Token')).toBeVisible();
  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-07: TON + General → no notice cards
// ---------------------------------------------------------------------------

test('FT-07: General + TON shows no notice cards', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillBasicInfo(page, { chainName: 'test-general-ton' });

  await expect(page.getByText('AA Smart Wallet Infrastructure')).not.toBeVisible();
  await expect(page.getByText('as Native L2 Gas Token')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-08: Local Docker info card
// ---------------------------------------------------------------------------

test('FT-08: Local Docker infraProvider shows local deployment info card', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillBasicInfo(page, { chainName: 'test-local', infraProvider: 'local' });

  await expect(page.getByText('Local Docker Deployment')).toBeVisible();
  await expect(page.getByText('http://localhost:8545')).toBeVisible();
  await expect(page.getByText('http://localhost:3001')).toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-09: Expert Mode — toggle enables editable inputs
// ---------------------------------------------------------------------------

test('FT-09: Expert Mode toggle enables editable parameter inputs', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await fillBasicInfo(page, { chainName: 'test-expert' });

  // Before enabling Expert Mode, batch freq should be read-only text
  await expect(page.getByText('Batch Submission Frequency')).toBeVisible();

  // Enable Expert Mode — the switch has no aria-label; before toggling it is the
  // only [role="switch"] on the page (boolean field switches only render after Expert Mode is on)
  const expertSwitch = page.getByRole('switch').first();
  await expertSwitch.click();

  // After enabling, an input with the batch frequency value should appear
  // (overridable fields become <input> elements)
  const batchInput = page.locator('input.w-24').first();
  await expect(batchInput).toBeVisible();
  await expect(batchInput).toBeEditable();

  // Change a value and verify "Modified" badge appears
  await batchInput.fill('900');
  await batchInput.blur();
  await expect(page.getByText('Modified')).toBeVisible();
  await expect(page.getByText(/1 parameter.*overridden/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// FT-10: Validation — chain name must not contain invalid characters
// ---------------------------------------------------------------------------

test('FT-10: chain name validation rejects uppercase and spaces', async ({ page }) => {
  await selectPreset(page, 'General Purpose');
  await expect(page.getByText('Infrastructure Provider')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /Local Docker/ }).click();
  await page.locator('#chainName').fill('Invalid Chain Name!');
  await page.locator('#l1RpcUrl').fill('https://eth-sepolia.example.com');

  const seedInputs = page.locator('input[placeholder="•••••"]');
  await seedInputs.first().fill(TEST_MNEMONIC);
  await page.locator('#seedPhraseConfirm').click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Validation error should appear — step 3 should NOT be reached
  await expect(page.getByText('Preset Configuration Review')).not.toBeVisible();
  // react-hook-form renders the zod error message directly below the input
  await expect(page.getByText('Must be 3-32 lowercase alphanumeric characters or hyphens')).toBeVisible();
});
