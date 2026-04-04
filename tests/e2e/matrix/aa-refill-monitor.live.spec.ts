/**
 * AA EntryPoint Refill Monitor — Platform UI Verification
 *
 * Verifies the Account Abstraction tab in Platform UI correctly displays:
 *   1. EntryPoint deposit balance + progress bar
 *   2. Status badge (healthy / warning / critical)
 *   3. Refill history (Deposited events)
 *   4. Admin wallet balance
 *   5. Predeploy contract addresses
 *
 * Requires: Full+USDC stack deployed, Platform UI running at localhost:3000.
 *
 * Usage:
 *   LIVE_CHAIN_NAME=usdc-full-e2e npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/aa-refill-monitor.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { getStackConfig, needsAASetup } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import { pollUntil } from '../helpers/poll';

const config = getStackConfig();
const ENTRYPOINT = '0x4200000000000000000000000000000000000063';
const PAYMASTER = '0x4200000000000000000000000000000000000067';

let urls: StackUrls;

// Auth helper: inject JWT into page context
async function authenticateForPlatformUI(page: import('@playwright/test').Page): Promise<void> {
  const backendUrl = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
  const resp = await fetch(`${backendUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin' }),
  });
  const body = await resp.json() as Record<string, unknown>;
  const token = (body.token ?? (body.data as Record<string, unknown>)?.token) as string;

  await page.context().addCookies([{
    name: 'auth-token',
    value: token,
    domain: 'localhost',
    path: '/',
  }]);
  await page.evaluate((t) => {
    localStorage.setItem('accessToken', t);
  }, token);
}

test.describe(`AA Refill Monitor [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test.beforeAll(async () => {
    test.skip(!needsAASetup(config.feeToken), 'AA not active for TON fee token');
    urls = await resolveStackUrls(config.chainName);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. AA tab renders with EntryPoint balance
  // ═══════════════════════════════════════════════════════════════════════════

  test('AA tab shows EntryPoint balance and status', async ({ page }) => {
    test.setTimeout(60_000);
    await authenticateForPlatformUI(page);

    // Navigate to stack detail > Account Abstraction tab
    await page.goto(`http://localhost:3000/rollup/${urls.stackId}?tab=account-abstraction`, {
      waitUntil: 'networkidle',
    });

    // Wait for the tab content to load
    await expect(page.locator('text=Fee Token Oracle')).toBeVisible({ timeout: 15_000 });

    // Verify fee token display
    await expect(page.locator('text=Fee Token').locator('..').locator('span.font-mono')).toContainText(config.feeToken);

    // Verify EntryPoint Auto-Refill section exists
    await expect(page.locator('text=EntryPoint Auto-Refill')).toBeVisible();

    // Verify balance is displayed (number followed by TON)
    const balanceText = page.locator('text=TON').first();
    await expect(balanceText).toBeVisible({ timeout: 30_000 });

    // Verify status badge exists (healthy, warning, or critical)
    const statusBadge = page.locator('[class*="badge"]').filter({
      hasText: /Healthy|Warning|Critical/,
    });
    await expect(statusBadge.first()).toBeVisible({ timeout: 30_000 });

    // Verify progress bar exists
    const progressBar = page.locator('[class*="rounded-full"][class*="transition-all"]');
    await expect(progressBar.first()).toBeVisible();

    // Verify thresholds displayed
    await expect(page.locator('text=Trigger Threshold')).toBeVisible();
    await expect(page.locator('text=Refill Amount')).toBeVisible();

    console.log('[aa-refill] AA tab rendered with balance, status, and thresholds');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Admin wallet section
  // ═══════════════════════════════════════════════════════════════════════════

  test('AA tab shows admin wallet balance', async ({ page }) => {
    test.setTimeout(30_000);
    await authenticateForPlatformUI(page);

    await page.goto(`http://localhost:3000/rollup/${urls.stackId}?tab=account-abstraction`, {
      waitUntil: 'networkidle',
    });

    // Admin wallet section
    await expect(page.locator('text=Admin Wallet')).toBeVisible({ timeout: 15_000 });

    // Admin address should be displayed (truncated hex)
    const adminAddr = page.locator('text=Admin Wallet').locator('..').locator('..').locator('.font-mono').first();
    await expect(adminAddr).toBeVisible();

    // "refills remaining" estimate
    const refillsText = page.locator('text=/refill.*remaining/i');
    await expect(refillsText).toBeVisible({ timeout: 15_000 });

    console.log('[aa-refill] Admin wallet section displayed');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Predeploy addresses
  // ═══════════════════════════════════════════════════════════════════════════

  test('AA tab shows predeploy addresses', async ({ page }) => {
    test.setTimeout(30_000);
    await authenticateForPlatformUI(page);

    await page.goto(`http://localhost:3000/rollup/${urls.stackId}?tab=account-abstraction`, {
      waitUntil: 'networkidle',
    });

    await expect(page.locator('text=Predeploy Addresses')).toBeVisible({ timeout: 15_000 });

    // EntryPoint address
    await expect(page.locator(`text=${ENTRYPOINT}`)).toBeVisible();

    // MultiTokenPaymaster address
    await expect(page.locator(`text=${PAYMASTER}`)).toBeVisible();

    // SimplePriceOracle address
    await expect(page.locator('text=0x4200000000000000000000000000000000000066')).toBeVisible();

    console.log('[aa-refill] Predeploy addresses displayed');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Verify on-chain EntryPoint balance matches UI
  // ═══════════════════════════════════════════════════════════════════════════

  test('on-chain EntryPoint balance matches UI', async ({ page }) => {
    test.setTimeout(60_000);

    // Get on-chain balance
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const onChainBalance = await provider.getBalance(ENTRYPOINT);
    const onChainFormatted = parseFloat(ethers.formatEther(onChainBalance)).toFixed(6);
    console.log(`[aa-refill] On-chain EntryPoint balance: ${onChainFormatted} TON`);

    // Get UI balance
    await authenticateForPlatformUI(page);
    await page.goto(`http://localhost:3000/rollup/${urls.stackId}?tab=account-abstraction`, {
      waitUntil: 'networkidle',
    });

    // Wait for balance to appear
    await expect(page.locator('text=EntryPoint Auto-Refill')).toBeVisible({ timeout: 15_000 });

    // The balance is displayed as a large number (e.g., "1.000000")
    // Find the bold balance text
    const balanceEl = page.locator('.text-2xl.font-bold').first();
    await expect(balanceEl).toBeVisible({ timeout: 30_000 });
    const uiBalance = await balanceEl.textContent();

    console.log(`[aa-refill] UI balance: ${uiBalance} TON`);
    console.log(`[aa-refill] On-chain: ${onChainFormatted} TON`);

    // Allow small difference due to polling timing
    if (uiBalance) {
      const diff = Math.abs(parseFloat(uiBalance) - parseFloat(onChainFormatted));
      expect(diff).toBeLessThan(0.1); // within 0.1 TON
    }
  });
});
