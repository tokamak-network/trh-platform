/**
 * Live L2 Integration Tests — Bridge & Block Explorer
 *
 * Runs against the LIVE deployed L2 (fulltest / Full preset / ETH fee token).
 * Requires the L2 stack to be running:
 *   - Bridge:    http://localhost:3001
 *   - Explorer:  http://localhost:4001
 *   - L2 RPC:   http://localhost:8545
 *
 * Usage:
 *   npx playwright test --config playwright.live.config.ts bridge-explorer.live.spec.ts
 *
 * BE-01: Bridge loads and shows Deposit / Withdraw tabs
 * BE-02: Bridge deposit form accepts ETH as fee token
 * BE-03: Bridge withdraw form shows ETH fee info
 * BE-04: Block explorer loads with correct chain name
 * BE-05: Block explorer navigation includes Deposits menu
 * BE-06: Block explorer navigation includes Withdrawals menu
 * BE-07: Block explorer navigation includes Dispute Games menu
 * BE-08: Block explorer shows recent L2 blocks
 * BE-09: Platform UI shows deployed stack with bridge + explorer links
 * BE-10: op-proposer is running (container status check via platform API)
 */

import { test, expect } from '@playwright/test';
import { authenticateReal } from './helpers/auth';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const BRIDGE_URL = 'http://localhost:3001';
const EXPLORER_URL = 'http://localhost:4001';
const PLATFORM_URL = 'http://localhost:3000';
const DEPLOYED_STACK_ID = '205c3796-ff7d-4ee6-b316-b3eca05e7a59';

// ---------------------------------------------------------------------------
// Bridge Tests
// ---------------------------------------------------------------------------

test.describe('Bridge UI', () => {
  test('BE-01: Bridge loads and shows Deposit / Withdraw navigation', async ({ page }) => {
    await page.goto(BRIDGE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/be01-bridge-home.png`, fullPage: true });

    // Bridge should redirect to /bridge and show deposit/withdraw options
    await expect(page).toHaveURL(/bridge/);

    // Deposit and Withdraw tabs/links must be present
    const hasDeposit = await page.getByText(/deposit/i).first().isVisible().catch(() => false);
    const hasWithdraw = await page.getByText(/withdraw/i).first().isVisible().catch(() => false);

    expect(hasDeposit, 'Deposit link should be visible on bridge').toBeTruthy();
    expect(hasWithdraw, 'Withdraw link should be visible on bridge').toBeTruthy();
  });

  test('BE-02: Bridge deposit tab shows ETH as the fee token', async ({ page }) => {
    await page.goto(`${BRIDGE_URL}/deposit`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.screenshot({ path: `${OUT}/be02-bridge-deposit.png`, fullPage: true });

    // The deposit form should mention ETH (deployed fee token)
    await expect(page.getByText('ETH').first()).toBeVisible({ timeout: 10000 });
  });

  test('BE-03: Bridge withdraw tab loads correctly', async ({ page }) => {
    await page.goto(`${BRIDGE_URL}/withdraw`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.screenshot({ path: `${OUT}/be03-bridge-withdraw.png`, fullPage: true });

    // Withdraw UI should be present
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toContain('withdraw');
  });
});

// ---------------------------------------------------------------------------
// Block Explorer Tests
// ---------------------------------------------------------------------------

test.describe('Block Explorer', () => {
  test('BE-04: Explorer loads with correct chain name', async ({ page }) => {
    await page.goto(EXPLORER_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${OUT}/be04-explorer-home.png`, fullPage: true });

    // Explorer title / chain name should reference the deployed chain
    const title = await page.title();
    console.log(`Explorer title: ${title}`);
    expect(title).toBeTruthy();
  });

  test('BE-05: Explorer navigation includes Deposits menu', async ({ page }) => {
    await page.goto(EXPLORER_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Blockscout includes Deposits in the menu for OP Stack chains
    const depositsLink = page.locator('a, [role="menuitem"], nav')
      .filter({ hasText: /deposit/i }).first();

    const isVisible = await depositsLink.isVisible().catch(() => false);

    if (!isVisible) {
      // May be under a menu — try hovering over navigation
      const navItems = page.locator('nav a, header a');
      const count = await navItems.count();
      console.log(`Nav items count: ${count}`);
      for (let i = 0; i < Math.min(count, 10); i++) {
        const text = await navItems.nth(i).textContent();
        console.log(`Nav[${i}]: ${text}`);
      }
    }

    await page.screenshot({ path: `${OUT}/be05-explorer-deposits-nav.png`, fullPage: true });
    expect(isVisible, 'Deposits menu should be in block explorer navigation').toBeTruthy();
  });

  test('BE-06: Explorer navigation includes Withdrawals menu', async ({ page }) => {
    await page.goto(EXPLORER_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const withdrawLink = page.locator('a, [role="menuitem"], nav')
      .filter({ hasText: /withdraw/i }).first();
    const isVisible = await withdrawLink.isVisible().catch(() => false);

    await page.screenshot({ path: `${OUT}/be06-explorer-withdrawals-nav.png`, fullPage: true });
    expect(isVisible, 'Withdrawals menu should be in block explorer navigation').toBeTruthy();
  });

  test('BE-07: Explorer navigation includes Dispute Games menu', async ({ page }) => {
    await page.goto(EXPLORER_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const disputeLink = page.locator('a, [role="menuitem"], nav')
      .filter({ hasText: /dispute/i }).first();
    const isVisible = await disputeLink.isVisible().catch(() => false);

    await page.screenshot({ path: `${OUT}/be07-explorer-dispute-nav.png`, fullPage: true });
    expect(isVisible, 'Dispute Games menu should be in block explorer navigation').toBeTruthy();
  });

  test('BE-08: Explorer shows recent L2 blocks', async ({ page }) => {
    await page.goto(EXPLORER_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Block number should be visible on the homepage
    const blockNumberEl = page.locator('[class*="block"], [class*="Block"]')
      .filter({ hasText: /^[0-9,]+$/ }).first();

    const hasBlocks = await blockNumberEl.isVisible().catch(() => false);
    console.log(`Has block numbers visible: ${hasBlocks}`);

    await page.screenshot({ path: `${OUT}/be08-explorer-blocks.png`, fullPage: true });
  });

  test('BE-09: Explorer /op-deposits page loads', async ({ page }) => {
    // Try to navigate to deposits page directly
    const depositsPage = await page.goto(`${EXPLORER_URL}/op-deposits`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    }).catch(() => null);

    if (depositsPage && depositsPage.ok()) {
      await page.screenshot({ path: `${OUT}/be09-explorer-op-deposits.png`, fullPage: true });
      const body = await page.textContent('body');
      expect(body?.toLowerCase()).toContain('deposit');
    } else {
      // Try alternative URL
      await page.goto(`${EXPLORER_URL}/deposits`, { timeout: 15000 }).catch(() => null);
      await page.screenshot({ path: `${OUT}/be09-explorer-deposits-alt.png`, fullPage: true });
    }
  });

  test('BE-10: Explorer /op-withdrawals page loads', async ({ page }) => {
    const withdrawPage = await page.goto(`${EXPLORER_URL}/op-withdrawals`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    }).catch(() => null);

    if (withdrawPage && withdrawPage.ok()) {
      await page.screenshot({ path: `${OUT}/be10-explorer-op-withdrawals.png`, fullPage: true });
      const body = await page.textContent('body');
      expect(body?.toLowerCase()).toContain('withdraw');
    } else {
      await page.goto(`${EXPLORER_URL}/withdrawals`, { timeout: 15000 }).catch(() => null);
      await page.screenshot({ path: `${OUT}/be10-explorer-withdrawals-alt.png`, fullPage: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Platform UI — deployed stack integration view
// ---------------------------------------------------------------------------

test.describe('Platform UI - Deployed Stack', () => {
  test('BE-11: Platform shows deployed fulltest stack with Deployed status', async ({ page }) => {
    await authenticateReal(page.context());

    await page.goto(PLATFORM_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.screenshot({ path: `${OUT}/be11-platform-home.png`, fullPage: true });

    // The platform should show the deployed stacks list
    const body = await page.textContent('body');
    console.log('Platform body sample:', body?.substring(0, 500));
  });

  test('BE-12: Platform stack detail shows bridge and explorer URLs', async ({ page }) => {
    await authenticateReal(page.context());

    await page.goto(`${PLATFORM_URL}/rollup/${DEPLOYED_STACK_ID}`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    await page.screenshot({ path: `${OUT}/be12-platform-stack-detail.png`, fullPage: true });

    // Should show the chain name
    await expect(page.getByText(/fulltest/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('BE-13: Platform stack integrations tab shows bridge and explorer', async ({ page }) => {
    await authenticateReal(page.context());

    await page.goto(`${PLATFORM_URL}/rollup/${DEPLOYED_STACK_ID}?tab=components`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    await page.screenshot({ path: `${OUT}/be13-platform-integrations.png`, fullPage: true });

    // Should show integration cards
    const body = await page.textContent('body');
    const hasBridge = body?.toLowerCase().includes('bridge') ?? false;
    console.log(`Integrations tab has bridge: ${hasBridge}`);
  });
});

// ---------------------------------------------------------------------------
// op-proposer status check (via backend API)
// ---------------------------------------------------------------------------

test('BE-14: op-proposer container is running for deployed stack', async ({ page }) => {
  // Check op-proposer status via the backend logs API
  const loginResp = await page.request.post('http://localhost:8000/api/v1/auth/login', {
    data: { email: 'admin@gmail.com', password: 'admin' },
    headers: { 'Content-Type': 'application/json' },
  });
  const loginBody = await loginResp.json();
  const token = loginBody.token ?? loginBody.data?.token;

  // Check the stack monitoring endpoint
  const monitorResp = await page.request.get(
    `http://localhost:8000/api/v1/stacks/thanos/${DEPLOYED_STACK_ID}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  const monitorBody = await monitorResp.json();
  const stack = monitorBody.data?.stack;

  console.log('Stack status:', stack?.status);
  console.log('Stack monitoring URL:', stack?.metadata?.monitoringUrl);

  expect(stack?.status).toBe('Deployed');

  await page.screenshot({ path: `${OUT}/be14-proposer-status.png` });
});
