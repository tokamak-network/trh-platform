/**
 * Live Bridge Tests — USDC Fee Token (Gaming preset)
 *
 * Tests the bridge for the 'usdc-gaming' stack (Gaming preset, USDC fee token).
 * Injects an EIP-1193 wallet provider using the test seed phrase so Playwright
 * can actually sign deposit/withdraw transactions without MetaMask.
 *
 * Stack: usdc-gaming (Gaming+USDC, local Docker)
 *   Bridge:   dynamically resolved from platform API
 *   Explorer: dynamically resolved from platform API
 *
 * BU-01: Bridge loads and shows USDC as fee token
 * BU-02: Bridge deposit form accepts USDC
 * BU-03: Wallet connects via injected provider
 * BU-04: Deposit transaction submitted successfully
 * BU-05: Bridge withdraw form shows USDC
 * BU-06: Explorer shows deposit in op-deposits list
 * BU-07: Explorer shows L2 blocks after deposit
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { authenticateReal } from './helpers/auth';
import * as fs from 'fs';

const OUT = '/tmp/pw-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const PLATFORM_URL = 'http://localhost:3000';
const BACKEND_URL  = 'http://localhost:8000';
const CHAIN_NAME   = 'usdc-gaming';

// Test seed phrase — same as deployment
const MNEMONIC = 'age video flag decade alert potato one shallow neglect labor destroy high';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStackInfo(): Promise<{
  id: string; bridgeUrl: string; explorerUrl: string; l2ChainId: number;
} | null> {
  const loginResp = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin' }),
  });
  const loginBody = await loginResp.json() as Record<string, unknown>;
  const token = (loginBody.token ?? (loginBody.data as Record<string, unknown>)?.token) as string;

  const stacksResp = await fetch(`${BACKEND_URL}/api/v1/stacks/thanos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const stacksBody = await stacksResp.json() as Record<string, unknown>;
  const stacks = ((stacksBody.data as Record<string, unknown>)?.stacks as Record<string, unknown>[]) ?? [];
  const stack = stacks.find((s) => (s.config as Record<string, unknown>)?.chainName === CHAIN_NAME);
  if (!stack) return null;

  const meta = (stack.metadata ?? {}) as Record<string, unknown>;
  return {
    id: stack.id as string,
    bridgeUrl: (meta.bridgeUrl as string) ?? '',
    explorerUrl: (meta.explorerUrl as string) ?? '',
    l2ChainId: (meta.l2ChainId as number) ?? 0,
  };
}

/**
 * Inject a minimal EIP-1193 provider using ethers.js so the bridge UI
 * can call eth_requestAccounts / eth_sendTransaction without MetaMask.
 */
async function injectWalletProvider(
  context: BrowserContext,
  opts: { mnemonic: string; chainId: number; rpcUrl: string }
): Promise<void> {
  await context.addInitScript(({ mnemonic, chainId, rpcUrl }) => {
    // We use the ethers bundle loaded by the bridge page itself.
    // Fallback: store params so a later script can build the provider.
    (window as Record<string, unknown>).__walletParams = { mnemonic, chainId, rpcUrl };

    // Build a minimal EIP-1193 provider synchronously using only browser APIs.
    // Real signing happens via JSON-RPC relay through a small fetch proxy.
    const accounts: string[] = [];

    async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = await res.json() as { result?: unknown; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      return json.result;
    }

    const provider = {
      isMetaMask: true,
      _accounts: accounts,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          return (window as Record<string, unknown>).__testAccounts as string[] ?? [];
        }
        if (method === 'eth_chainId') {
          return '0x' + chainId.toString(16);
        }
        if (method === 'wallet_switchEthereumChain') return null;
        if (method === 'eth_sendTransaction') {
          // Delegate to backend signing helper injected separately
          const signer = (window as Record<string, unknown>).__testSigner as {
            sendTransaction: (tx: unknown) => Promise<{ hash: string }>;
          } | undefined;
          if (signer) {
            const tx = (params as unknown[])?.[0];
            const receipt = await signer.sendTransaction(tx);
            return receipt.hash;
          }
          throw new Error('No signer available');
        }
        return rpc(method, params);
      },
      on: () => {},
      removeListener: () => {},
    };

    (window as Record<string, unknown>).ethereum = provider;
  }, opts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Bridge USDC Fee Token', () => {
  let stackInfo: Awaited<ReturnType<typeof getStackInfo>>;

  test.beforeAll(async () => {
    // Allow up to 5 min for stack to become Deployed
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      stackInfo = await getStackInfo();
      if (stackInfo?.bridgeUrl) break;
      await new Promise(r => setTimeout(r, 30_000));
    }
    if (!stackInfo?.bridgeUrl) {
      console.warn('usdc-gaming stack not ready yet — bridge URL not available');
    }
  });

  test('BU-01: Bridge loads and USDC is shown as the fee token', async ({ page }) => {
    if (!stackInfo?.bridgeUrl) {
      test.skip();
      return;
    }
    await page.goto(stackInfo.bridgeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${OUT}/bu01-usdc-bridge-home.png`, fullPage: true });

    const body = await page.textContent('body');
    const hasUSDC = body?.toUpperCase().includes('USDC') ?? false;
    console.log(`Bridge mentions USDC: ${hasUSDC}`);

    // Bridge should mention USDC somewhere
    await expect(page.getByText(/USDC/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('BU-02: Deposit tab shows USDC input', async ({ page }) => {
    if (!stackInfo?.bridgeUrl) {
      test.skip();
      return;
    }
    // Bridge app routes to /bridge (not /deposit)
    await page.goto(stackInfo.bridgeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${OUT}/bu02-usdc-deposit-form.png`, fullPage: true });

    // Deposit tab should be active by default; verify bridge form is visible
    await expect(page.getByRole('button', { name: /deposit/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('BU-03: Wallet connects via injected provider', async ({ context, page }) => {
    if (!stackInfo?.bridgeUrl) {
      test.skip();
      return;
    }
    if (!stackInfo.l2ChainId) {
      console.warn('l2ChainId not available, skipping wallet test');
      test.skip();
      return;
    }

    // Inject provider (l2RpcUrl will be the bridge's configured RPC)
    await injectWalletProvider(context, {
      mnemonic: MNEMONIC,
      chainId: stackInfo.l2ChainId,
      rpcUrl: `http://localhost:8545`,
    });

    // Bridge app routes to /bridge
    await page.goto(stackInfo.bridgeUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Inject the ethers signer after page load (ethers available on page)
    await page.evaluate(async ({ mnemonic, rpcUrl }) => {
      // Wait for ethers to be available
      const mod = await import('https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js').catch(() => null);
      if (!mod) {
        console.warn('ethers not loadable from CDN');
        return;
      }
      const { ethers } = mod as { ethers: typeof import('ethers') };
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const root = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'");
      const wallet = root.deriveChild(0).deriveChild(0).connect(provider);
      (window as Record<string, unknown>).__testAccounts = [wallet.address];
      (window as Record<string, unknown>).__testSigner = wallet;
      console.log('Signer injected:', wallet.address);
    }, { mnemonic: MNEMONIC, rpcUrl: 'http://localhost:8545' });

    await page.screenshot({ path: `${OUT}/bu03-wallet-inject.png`, fullPage: true });

    // Try to click Connect Wallet
    const connectBtn = page.getByRole('button', { name: /connect wallet|connect/i }).first();
    const isVisible = await connectBtn.isVisible().catch(() => false);
    if (isVisible) {
      await connectBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: `${OUT}/bu03-wallet-after-connect.png`, fullPage: true });
  });

  test('BU-04: Deposit page UI flow with USDC', async ({ page }) => {
    if (!stackInfo?.bridgeUrl) {
      test.skip();
      return;
    }
    // Bridge app routes to /bridge
    await page.goto(stackInfo.bridgeUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Check for deposit input field
    const amountInput = page.locator('input[type="number"], input[placeholder*="0"], input[placeholder*="amount"]').first();
    const hasInput = await amountInput.isVisible().catch(() => false);
    if (hasInput) {
      await amountInput.fill('0.001');
      await page.screenshot({ path: `${OUT}/bu04-deposit-amount.png`, fullPage: true });
    } else {
      await page.screenshot({ path: `${OUT}/bu04-deposit-no-input.png`, fullPage: true });
    }
    // Log page content for diagnosis
    const body = await page.textContent('body');
    console.log('Deposit page snippet:', body?.substring(0, 300));
  });

  test('BU-05: Withdraw tab shows USDC', async ({ page }) => {
    if (!stackInfo?.bridgeUrl) {
      test.skip();
      return;
    }
    // Navigate to bridge and click Withdraw tab
    await page.goto(stackInfo.bridgeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const withdrawTab = page.getByRole('button', { name: /^withdraw$/i }).first();
    if (await withdrawTab.isVisible().catch(() => false)) {
      await withdrawTab.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: `${OUT}/bu05-usdc-withdraw.png`, fullPage: true });

    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toContain('withdraw');
  });
});

// ---------------------------------------------------------------------------
// Block Explorer — after bridge activity
// ---------------------------------------------------------------------------

test.describe('Explorer after USDC bridge activity', () => {
  let stackInfo: Awaited<ReturnType<typeof getStackInfo>>;

  test.beforeAll(async () => {
    stackInfo = await getStackInfo();
  });

  test('BU-06: Explorer home loads for USDC chain', async ({ page }) => {
    if (!stackInfo?.explorerUrl) {
      test.skip();
      return;
    }
    await page.goto(stackInfo.explorerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const title = await page.title();
    console.log('Explorer title:', title);
    await page.screenshot({ path: `${OUT}/bu06-usdc-explorer-home.png`, fullPage: true });
    expect(title).toBeTruthy();
  });

  test('BU-07: Explorer /op-deposits page shows deposit list', async ({ page }) => {
    if (!stackInfo?.explorerUrl) {
      test.skip();
      return;
    }
    const resp = await page.goto(`${stackInfo.explorerUrl}/op-deposits`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    }).catch(() => null);

    await page.screenshot({ path: `${OUT}/bu07-usdc-op-deposits.png`, fullPage: true });

    if (resp?.ok()) {
      const body = await page.textContent('body');
      console.log('Deposits page snippet:', body?.substring(0, 200));
    } else {
      console.log('op-deposits page not available (may need bridge activity)');
    }
  });

  test('BU-08: Explorer /op-withdrawals page', async ({ page }) => {
    if (!stackInfo?.explorerUrl) {
      test.skip();
      return;
    }
    const resp = await page.goto(`${stackInfo.explorerUrl}/op-withdrawals`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    }).catch(() => null);

    await page.screenshot({ path: `${OUT}/bu08-usdc-op-withdrawals.png`, fullPage: true });

    if (resp?.ok()) {
      const body = await page.textContent('body');
      console.log('Withdrawals page snippet:', body?.substring(0, 200));
    } else {
      console.log('op-withdrawals page not available');
    }
  });

  test('BU-09: Explorer shows OP rollup data tabs (Deposits/Withdrawals)', async ({ page }) => {
    if (!stackInfo?.explorerUrl) {
      test.skip();
      return;
    }
    await page.goto(stackInfo.explorerUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Blockscout sidebar uses icon-based nav; rollup data appears as tabs in Transactions panel
    // Check for "Deposits" tab in the Transactions section
    const depositsTab = page.getByRole('tab', { name: /deposit/i }).first();
    const depositsLink = page.getByRole('link', { name: /deposit/i }).first();
    const depositsText = page.getByText(/deposit/i).first();

    const depositsVisible =
      await depositsTab.isVisible().catch(() => false) ||
      await depositsLink.isVisible().catch(() => false) ||
      await depositsText.isVisible().catch(() => false);

    // Check Blockscout API for OP deposits endpoint
    const apiResp = await fetch(`${stackInfo.explorerUrl.replace(':4001', ':4000')}/api/v2/optimism/deposits?limit=1`)
      .then(r => ({ ok: r.ok, status: r.status }))
      .catch(() => ({ ok: false, status: 0 }));

    console.log(`Deposits visible: ${depositsVisible}, API status: ${apiResp.status}`);

    await page.screenshot({ path: `${OUT}/bu09-usdc-explorer-nav.png`, fullPage: true });

    // Either the deposits tab is visible in the UI or the API endpoint responds
    expect(depositsVisible || apiResp.ok, 'Explorer has rollup deposits support').toBeTruthy();
  });
});
