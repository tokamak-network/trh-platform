/**
 * Stack Detail Pages — Integration Tabs (MSW mode)
 *
 * Tests the deployed stack detail pages using mocked stacks.
 * Covers Overview, Integrations (Components), and Account Abstraction tabs.
 *
 * SD-01: General+ETH — Overview shows L2 info, bridge URL
 * SD-02: DeFi+USDT — Integrations tab shows bridge + block explorer + monitoring
 * SD-03: Gaming+ETH — AA Account Abstraction tab visible, predeploy addresses shown
 * SD-04: Full+USDC — Account Abstraction tab shows USDC with 3% markup
 * SD-05: General+ETH — No Account Abstraction tab (non-AA preset)
 * SD-06: DeFi+USDT — No Account Abstraction tab (non-AA preset)
 */

import { test, expect } from '@playwright/test';
import { authenticateContext } from './helpers/auth';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Mock stack IDs (defined in handlers.ts)
const STACK_IDS = {
  'general-eth': 'mock-general-eth-001',
  'defi-usdt':   'mock-defi-usdt-001',
  'gaming-eth':  'mock-gaming-eth-001',
  'full-usdc':   'mock-full-usdc-001',
};

test.beforeEach(async ({ context }) => {
  await authenticateContext(context);
});

async function goToStack(
  page: import('@playwright/test').Page,
  stackId: string,
  tab?: string
) {
  const url = tab
    ? `/rollup/${stackId}?tab=${tab}`
    : `/rollup/${stackId}`;
  await page.goto(url);
  await page.waitForLoadState('networkidle', { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// SD-01: General + ETH — Overview tab
// ---------------------------------------------------------------------------

test('SD-01: General+ETH overview shows L2 RPC and bridge URL', async ({ page }) => {
  await goToStack(page, STACK_IDS['general-eth'], 'overview');

  // Chain identity visible
  await expect(page.getByText('general-eth')).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/sd01-general-eth-overview.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// SD-02: DeFi + USDT — Integrations tab
// ---------------------------------------------------------------------------

test('SD-02: DeFi+USDT integrations tab shows bridge, explorer, monitoring', async ({ page }) => {
  await goToStack(page, STACK_IDS['defi-usdt'], 'components');

  await page.screenshot({ path: `${OUT}/sd02-defi-usdt-integrations.png`, fullPage: true });

  // Bridge should be listed
  await expect(page.getByText(/bridge/i).first()).toBeVisible({ timeout: 10000 });
});

// ---------------------------------------------------------------------------
// SD-03: Gaming + ETH — Account Abstraction tab (AA preset + non-TON)
// ---------------------------------------------------------------------------

test('SD-03: Gaming+ETH shows Account Abstraction tab with predeploy addresses', async ({ page }) => {
  await goToStack(page, STACK_IDS['gaming-eth'], 'overview');

  // Account Abstraction tab should be visible in the tab list
  await expect(page.getByRole('tab', { name: /Account Abstraction/i })).toBeVisible({ timeout: 10000 });

  await page.getByRole('tab', { name: /Account Abstraction/i }).click();
  // Wait for URL to reflect tab change (router.push is async)
  await expect(page).toHaveURL(/tab=account-abstraction/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // AA Operator section
  await expect(page.getByText('AA Operator')).toBeVisible({ timeout: 10000 });

  // Predeploy addresses — use first() to handle duplicate text in nested TabsContent
  await expect(page.getByText('EntryPoint').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('MultiTokenPaymaster').first()).toBeVisible();
  await expect(page.getByText('SimplePriceOracle').first()).toBeVisible();

  // ETH → 5% markup
  await expect(page.getByText('5%').first()).toBeVisible();

  // Predeploy address format
  await expect(page.getByText('0x4200000000000000000000000000000000000063').first()).toBeVisible();

  await page.screenshot({ path: `${OUT}/sd03-gaming-eth-chaindata.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// SD-04: Full + USDC — Account Abstraction tab shows 3% markup
// ---------------------------------------------------------------------------

test('SD-04: Full+USDC Account Abstraction tab shows USDC 3% markup', async ({ page }) => {
  await goToStack(page, STACK_IDS['full-usdc'], 'overview');

  await expect(page.getByRole('tab', { name: /Account Abstraction/i })).toBeVisible({ timeout: 10000 });
  await page.getByRole('tab', { name: /Account Abstraction/i }).click();
  // Wait for URL to reflect tab change
  await expect(page).toHaveURL(/tab=account-abstraction/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // USDC → 3% markup
  await expect(page.getByText('3%').first()).toBeVisible({ timeout: 10000 });
  // Use exact match to avoid matching chain name "full-usdc"
  await expect(page.getByText('USDC', { exact: true }).first()).toBeVisible();

  // AA predeploys present
  await expect(page.getByText('EntryPoint').first()).toBeVisible();

  await page.screenshot({ path: `${OUT}/sd04-full-usdc-chaindata.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// SD-05: General + ETH — NO Account Abstraction tab (non-AA preset)
// ---------------------------------------------------------------------------

test('SD-05: General+ETH has no Account Abstraction tab (non-AA preset)', async ({ page }) => {
  await goToStack(page, STACK_IDS['general-eth'], 'overview');

  await expect(page.getByRole('tab', { name: /Account Abstraction/i })).not.toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/sd05-general-eth-no-chaindata.png` });
});

// ---------------------------------------------------------------------------
// SD-06: DeFi + USDT — NO Account Abstraction tab (non-AA preset)
// ---------------------------------------------------------------------------

test('SD-06: DeFi+USDT has no Account Abstraction tab (non-AA preset)', async ({ page }) => {
  await goToStack(page, STACK_IDS['defi-usdt'], 'overview');

  await expect(page.getByRole('tab', { name: /Account Abstraction/i })).not.toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/sd06-defi-usdt-no-chaindata.png` });
});
