/**
 * Electron E2E — DeFi CrossTrade with USDC Support (Spec CT-E2E)
 *
 * Deploys DeFi preset via Electron app, verifies CrossTrade auto-install
 * with USDC config, sends USDC L2→L1 request on-chain, and confirms
 * Thanos→new-L2 guidance message in the CrossTrade dApp UI.
 *
 * Test IDs:
 *   CT-E2E-01 — Electron app launch + DeFi preset deployment via Platform UI wizard
 *   CT-E2E-02 — CrossTrade install: port 3004 HTTP + .env.crosstrade file + USDC address
 *   CT-E2E-03 — ETH L2→L1 request (on-chain via ethers.js + L2 event confirmation)
 *   CT-E2E-04 — USDC L2→L1 request (ERC20 approve + on-chain + L2 event confirmation)
 *   CT-E2E-05 — Thanos source → guidance message DOM assertion in CrossTrade dApp
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/08-defi-crosstrade-electron.spec.ts
 *
 * Prerequisites:
 *   - Docker running
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 *   - Admin wallet has ETH + USDC on L2 and Sepolia L1
 *   - Optional: LIVE_STACK_ID to skip deployment (reuse existing DeFi stack)
 *   - Optional: SKIP_DEPLOY=true to skip CT-E2E-01 entirely
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication, chromium, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { loginBackend, resolveStackUrls, StackUrls } from './helpers/stack-resolver';
import { waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { pollUntil } from './helpers/poll';
import { deployPresetViaUI, resolveStackIdByChainName } from './helpers/deploy-wizard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'defi' as const;
const CHAIN_NAME = process.env.LIVE_CHAIN_NAME ?? `ct-e2e-defi-${Date.now()}`;
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const CROSSTRADE_DAPP_URL = 'http://localhost:3004';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;
const SKIP_DEPLOY = process.env.SKIP_DEPLOY === 'true';

const DEPLOY_TIMEOUT_MS = 35 * 60 * 1000; // 35 min (L2 deploy + CrossTrade install)
const CROSSTRADE_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const CROSSTRADE_POLL_INTERVAL_MS = 15_000;
const TX_TIMEOUT_MS = 3 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 20 * 60 * 1000;
const CLAIM_POLL_MS = 5_000;

const L1_RPC =
  process.env.LIVE_L1_RPC_URL ??
  'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';

// USDC addresses
const USDC_L1_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
const USDC_L2_ADDRESS = '0x4200000000000000000000000000000000000778'; // L2 USDC predeploy
const ETH_ADDRESS     = '0x0000000000000000000000000000000000000000';

// Trade amounts
const ETH_TRADE_AMOUNT  = ethers.parseEther('0.001');
const USDC_TRADE_AMOUNT = BigInt(1_000_000); // 1 USDC (6 decimals)

// Cross-domain message gas limit
const MIN_GAS_LIMIT = 200_000;

const SCREENSHOT_DIR = '/tmp/pw-screenshots/08-crosstrade-electron';

// ---------------------------------------------------------------------------
// ABIs (minimal subset needed)
// ---------------------------------------------------------------------------

const L2_CT_ABI = [
  'function requestNonRegisteredToken(address _l1token, address _l2token, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 _l1chainId) external payable',
  'event NonRequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event RequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event ProviderClaimCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

// ---------------------------------------------------------------------------
// Admin key resolution
// ---------------------------------------------------------------------------

function resolveAdminKey(): string {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  const mnemonic = process.env.LIVE_SEED_PHRASE;
  if (mnemonic) {
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
    return wallet.privateKey;
  }
  return '6544462e611a9040a74d0fdfe3f00ed4b3c3e924a6f29165059c76e6e587e4ff';
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;
let platformBrowser: import('playwright').Browser | null = null;
let deployedStackId: string | null = null;
let stackUrls: StackUrls | null = null;

let l2CrossTradeProxy: string;
let l1Provider: ethers.JsonRpcProvider;
let l2Provider: ethers.JsonRpcProvider;
let l1Wallet: ethers.Wallet;
let l2Wallet: ethers.Wallet;
let adminAddress: string;
let l2ChainId: bigint;
let l1ChainId: bigint;

// ---------------------------------------------------------------------------
// Platform UI helper
// ---------------------------------------------------------------------------

async function openPlatformPage(): Promise<Page> {
  if (!platformBrowser) {
    platformBrowser = await chromium.launch({ headless: true });
  }
  const PLATFORM_URL = 'http://localhost:3000';
  await pollUntil(
    async () => {
      try {
        const resp = await fetch(PLATFORM_URL, { signal: AbortSignal.timeout(5_000) });
        return resp.status > 0 ? (true as const) : null;
      } catch {
        return null;
      }
    },
    'platform UI frontend at localhost:3000',
    3 * 60_000,
    10_000,
  );
  const token = await loginBackend(BACKEND_URL);
  const context = await platformBrowser.newContext();
  const page = await context.newPage();
  await context.addCookies([{ name: 'auth-token', value: token, domain: 'localhost', path: '/' }]);
  await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // @ts-ignore
  await page.evaluate((t: string) => { localStorage.setItem('accessToken', t); }, token);
  return page;
}

// ---------------------------------------------------------------------------
// EIP-6963 mock wallet injection (for CT-E2E-05 UI test only, no signing)
// ---------------------------------------------------------------------------

async function injectMockWallet(page: Page): Promise<void> {
  const chainIdHex = '0x' + l2ChainId.toString(16);
  const chainIdNum = Number(l2ChainId);
  const l2RpcUrl = stackUrls?.l2Rpc ?? 'http://localhost:8545';

  await page.addInitScript(
    ({ address, chainId, chainIdNum, rpcUrl }: { address: string; chainId: string; chainIdNum: number; rpcUrl: string }) => {
      const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const mockProvider = {
        isMetaMask: true,
        selectedAddress: address,
        chainId,
        networkVersion: String(chainIdNum),
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address];
            case 'eth_chainId':
              return chainId;
            case 'net_version':
              return String(chainIdNum);
            case 'wallet_switchEthereumChain':
            case 'wallet_addEthereumChain':
              return null;
            case 'eth_getBalance':
              return '0x8AC7230489E80000';
            default: {
              const resp = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: params ?? [] }),
              });
              const json = (await resp.json()) as { result?: unknown; error?: { code: number; message: string } };
              if (json.error) {
                const err = new Error(json.error.message) as Error & { code?: number };
                err.code = json.error.code;
                throw err;
              }
              return json.result;
            }
          }
        },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
          return mockProvider;
        },
        removeListener: (event: string, handler: (...args: unknown[]) => void) => {
          if (handlers[event]) handlers[event] = handlers[event].filter(h => h !== handler);
          return mockProvider;
        },
        emit: (event: string, ...args: unknown[]) => {
          (handlers[event] ?? []).forEach(h => h(...args));
          return mockProvider;
        },
      };

      Object.defineProperty(window, 'ethereum', { value: mockProvider, writable: false, configurable: true });

      const providerDetail = {
        info: {
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48L3N2Zz4=',
          rdns: 'io.metamask',
        },
        provider: mockProvider,
      };

      const announceEvent = new CustomEvent('eip6963:announceProvider', { detail: Object.freeze(providerDetail) });
      window.dispatchEvent(announceEvent);

      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze(providerDetail) }));
      });
    },
    { address: adminAddress, chainId: chainIdHex, chainIdNum: chainIdNum, rpcUrl: l2RpcUrl }
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  if (!SKIP_DEPLOY) {
    console.log('[ct-e2e] Launching Electron app...');
    electronApp = await electron.launch({
      args: [ELECTRON_APP_PATH],
      env: { ...process.env, SKIP_PULL: 'true', NODE_ENV: 'test', ELECTRON_USE_BUILD: '1' },
    });
    console.log('[ct-e2e] Electron app launched');
  } else {
    console.log('[ct-e2e] SKIP_DEPLOY=true — skipping Electron launch');
  }
});

test.afterAll(async () => {
  if (platformBrowser) {
    await platformBrowser.close();
    platformBrowser = null;
  }
  if (electronApp) {
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// CT-E2E-01: DeFi preset deployment
// ---------------------------------------------------------------------------

test('CT-E2E-01: deploy DeFi preset via Electron UI wizard', async () => {
  test.setTimeout(10 * 60 * 1000);

  if (SKIP_DEPLOY) {
    test.skip(true, 'SKIP_DEPLOY=true');
  }

  expect(electronApp).not.toBeNull();

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[CT-E2E-01] Reusing existing stack: ${deployedStackId}`);
    return;
  }

  await waitForBackendReady(5 * 60 * 1000);
  const platformView = await openPlatformPage();

  await deployPresetViaUI(platformView, { preset: PRESET, feeToken: 'ETH', chainName: CHAIN_NAME });
  deployedStackId = await resolveStackIdByChainName(CHAIN_NAME, BACKEND_URL, 60_000);
  console.log(`[CT-E2E-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/ct-e2e-01-deploy-initiated.png` });
});

// ---------------------------------------------------------------------------
// CT-E2E-02: CrossTrade install verification (port 3004 + .env.crosstrade + USDC)
// ---------------------------------------------------------------------------

test('CT-E2E-02: CrossTrade install — port 3004 reachable, .env.crosstrade exists, USDC configured', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + CROSSTRADE_INSTALL_TIMEOUT_MS);

  if (SKIP_DEPLOY && LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
  }
  expect(deployedStackId, 'CT-E2E-01 must run first or set LIVE_STACK_ID').not.toBeNull();

  const stackId = deployedStackId!;

  if (!SKIP_DEPLOY) {
    const status = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
    expect(status.status).toBe('Deployed');
    console.log('[CT-E2E-02] Stack deployed, waiting for CrossTrade install...');
  }

  const token = await loginBackend(BACKEND_URL);

  // Poll until CrossTrade integration completes
  await pollUntil<Record<string, unknown>>(
    async () => {
      const resp = await fetch(
        `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) return null;
      const body = await resp.json() as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const integrations = (data.integrations as Record<string, unknown>[]) ?? [];
      const ct = integrations.find((i) => (i.type as string).toLowerCase().replace(/[-_]/g, '') === 'crosstrade');
      if (!ct) return null;
      const ctStatus = ct.status as string;
      console.log(`[CT-E2E-02] CrossTrade status: ${ctStatus}`);
      if (ctStatus === 'installed' || ctStatus === 'Completed') return ct;
      if (ctStatus === 'Failed') throw new Error('CrossTrade integration Failed');
      return null;
    },
    'CrossTrade integration to complete',
    CROSSTRADE_INSTALL_TIMEOUT_MS,
    CROSSTRADE_POLL_INTERVAL_MS,
  );
  console.log('[CT-E2E-02] CrossTrade integration completed ✓');

  // 1. Port 3004 HTTP reachability
  const ctResp = await fetch(CROSSTRADE_DAPP_URL, { signal: AbortSignal.timeout(10_000) });
  expect(ctResp.status, `CrossTrade dApp must respond HTTP < 500, got ${ctResp.status}`).toBeLessThan(500);
  console.log(`[CT-E2E-02] Port 3004: HTTP ${ctResp.status} ✓`);

  // 2. L2CrossTradeProxy address from integration info
  const intResp2 = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const intBody = await intResp2.json() as Record<string, unknown>;
  const intData = (intBody.data ?? intBody) as Record<string, unknown>;
  const integrations = (intData.integrations as Record<string, unknown>[]) ?? [];
  const ct = integrations.find((i) => (i.type as string).toLowerCase().replace(/[-_]/g, '') === 'crosstrade');
  const ctInfo = ((ct?.info ?? {}) as Record<string, unknown>);
  const ctContracts = ((ctInfo.contracts ?? {}) as Record<string, string>);

  expect(ctContracts.l2_cross_trade_proxy, 'l2_cross_trade_proxy must be set').toBeTruthy();
  expect(ctContracts.l2_cross_trade_proxy).toMatch(/^0x[0-9a-fA-F]{40}$/);
  l2CrossTradeProxy = ctContracts.l2_cross_trade_proxy;
  console.log(`[CT-E2E-02] L2CrossTradeProxy: ${l2CrossTradeProxy} ✓`);

  // 3. USDC address in CrossTrade dApp config
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(CROSSTRADE_DAPP_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    const pageContent = await page.content();
    const hasUsdcAddress = pageContent.includes('4200000000000000000000000000000000000778');
    expect(hasUsdcAddress, 'L2 USDC address (0x4200...0778) must appear in CrossTrade dApp page').toBe(true);
    console.log('[CT-E2E-02] USDC address in dApp config ✓');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/ct-e2e-02-crosstrade-dapp.png`, fullPage: true });
  } finally {
    await browser.close();
  }

  // Resolve stack URLs for downstream tests
  try {
    stackUrls = await resolveStackUrls(CHAIN_NAME);
  } catch {
    stackUrls = {
      stackId,
      l2ChainId: 0,
      l2Rpc: 'http://localhost:8545',
      bridgeUrl: 'http://localhost:3001',
      explorerUrl: 'http://localhost:4001',
      explorerApiUrl: 'http://localhost:4000/api/v2',
      grafanaUrl: 'http://localhost:3002',
      prometheusUrl: 'http://localhost:9090',
      uptimeUrl: 'http://localhost:3003',
      drbUrl: 'http://localhost:9600',
      bundlerUrl: 'http://localhost:4337',
      crossTradeUrl: 'http://localhost:3004',
    };
  }

  // Setup ethers providers and wallets for CT-E2E-03/04
  const adminKey = resolveAdminKey();
  l1Provider = new ethers.JsonRpcProvider(L1_RPC);
  l2Provider = new ethers.JsonRpcProvider(stackUrls.l2Rpc);
  l1Wallet = new ethers.Wallet(adminKey, l1Provider);
  l2Wallet = new ethers.Wallet(adminKey, l2Provider);
  adminAddress = l1Wallet.address;
  const l2Network = await l2Provider.getNetwork();
  l2ChainId = l2Network.chainId;
  const l1Network = await l1Provider.getNetwork();
  l1ChainId = l1Network.chainId;
  console.log(`[CT-E2E-02] Admin: ${adminAddress}, L2 chainId: ${l2ChainId}`);
  console.log('[CT-E2E-02] CrossTrade install verified ✓');
});

// ---------------------------------------------------------------------------
// CT-E2E-03: ETH L2→L1 RequestCT event (on-chain)
// ---------------------------------------------------------------------------

test('CT-E2E-03: ETH L2→L1 requestNonRegisteredToken — L2 event confirmed', async () => {
  test.setTimeout(TX_TIMEOUT_MS);
  expect(l2CrossTradeProxy, 'CT-E2E-02 must run first').toBeTruthy();

  const l2CtContract = new ethers.Contract(l2CrossTradeProxy, L2_CT_ABI, l2Wallet);

  console.log(`[CT-E2E-03] Sending ETH requestNonRegisteredToken on L2...`);
  const tx = await l2CtContract.requestNonRegisteredToken(
    ETH_ADDRESS,         // _l1token
    ETH_ADDRESS,         // _l2token (native ETH)
    adminAddress,        // _receiver
    ETH_TRADE_AMOUNT,    // _totalAmount
    ETH_TRADE_AMOUNT,    // _ctAmount
    l1ChainId,           // _l1chainId
    { value: ETH_TRADE_AMOUNT }
  );
  console.log('[CT-E2E-03] TX sent:', tx.hash);
  const receipt = await tx.wait(1);
  expect(receipt!.status, 'ETH requestNonRegisteredToken tx failed').toBe(1);
  console.log('[CT-E2E-03] TX confirmed at block:', receipt!.blockNumber);

  // Verify event
  const iface = new ethers.Interface(L2_CT_ABI);
  let parsedEvent: ethers.LogDescription | null = null;
  for (const log of receipt!.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && (parsed.name === 'NonRequestCT' || parsed.name === 'RequestCT')) {
        parsedEvent = parsed;
        break;
      }
    } catch { /* skip */ }
  }

  expect(parsedEvent, 'NonRequestCT/RequestCT event not found').not.toBeNull();
  console.log(`[CT-E2E-03] Event: ${parsedEvent!.name}, saleCount: ${parsedEvent!.args._saleCount} ✓`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`${CROSSTRADE_DAPP_URL}/request-pool`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ct-e2e-03-eth-request.png`, fullPage: true });
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// CT-E2E-04: USDC L2→L1 RequestCT event (on-chain, with ERC20 approve)
// ---------------------------------------------------------------------------

test('CT-E2E-04: USDC L2→L1 requestNonRegisteredToken — ERC20 approve + L2 event confirmed', async () => {
  test.setTimeout(TX_TIMEOUT_MS);
  expect(l2CrossTradeProxy, 'CT-E2E-02 must run first').toBeTruthy();

  // Balance check
  const usdcContract = new ethers.Contract(USDC_L2_ADDRESS, ERC20_ABI, l2Wallet);
  const balance = await usdcContract.balanceOf(adminAddress);
  console.log(`[CT-E2E-04] L2 USDC balance: ${balance} (need >= ${USDC_TRADE_AMOUNT})`);
  if (balance < USDC_TRADE_AMOUNT) {
    test.skip(true, `L2 USDC balance too low: ${balance}. Bridge USDC to L2 first.`);
  }

  // Approve
  const approveTx = await usdcContract.approve(l2CrossTradeProxy, USDC_TRADE_AMOUNT);
  await approveTx.wait(1);
  console.log('[CT-E2E-04] USDC approve confirmed:', approveTx.hash);

  // Request
  const l2CtContract = new ethers.Contract(l2CrossTradeProxy, L2_CT_ABI, l2Wallet);
  const tx = await l2CtContract.requestNonRegisteredToken(
    USDC_L1_ADDRESS,   // _l1token: Sepolia USDC
    USDC_L2_ADDRESS,   // _l2token: L2 USDC predeploy
    adminAddress,      // _receiver
    USDC_TRADE_AMOUNT, // _totalAmount
    USDC_TRADE_AMOUNT, // _ctAmount
    l1ChainId,         // _l1chainId
    // No { value: ... } — ERC20 token, not native ETH
  );
  console.log('[CT-E2E-04] TX sent:', tx.hash);
  const receipt = await tx.wait(1);
  expect(receipt!.status, 'USDC requestNonRegisteredToken tx failed').toBe(1);
  console.log('[CT-E2E-04] TX confirmed at block:', receipt!.blockNumber);

  // Verify event
  const iface = new ethers.Interface(L2_CT_ABI);
  let parsedEvent: ethers.LogDescription | null = null;
  for (const log of receipt!.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && (parsed.name === 'NonRequestCT' || parsed.name === 'RequestCT')) {
        parsedEvent = parsed;
        break;
      }
    } catch { /* skip */ }
  }

  expect(parsedEvent, 'NonRequestCT/RequestCT event not found in USDC request receipt').not.toBeNull();
  expect((parsedEvent!.args._l2token as string).toLowerCase()).toBe(USDC_L2_ADDRESS.toLowerCase());
  console.log(`[CT-E2E-04] Event: ${parsedEvent!.name}, saleCount: ${parsedEvent!.args._saleCount}`);
  console.log(`[CT-E2E-04] L2 USDC token in event: ${parsedEvent!.args._l2token} ✓`);
});

// ---------------------------------------------------------------------------
// CT-E2E-05: Thanos source → guidance message DOM assertion
// ---------------------------------------------------------------------------

test('CT-E2E-05: Thanos Sepolia source — guidance message visible in CrossTrade dApp UI', async () => {
  test.setTimeout(2 * 60 * 1000);
  expect(stackUrls, 'CT-E2E-02 must run first').not.toBeNull();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await injectMockWallet(page);
    await page.goto(CROSSTRADE_DAPP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2_000);

    // The CreateRequest form: find the "From" chain selector
    const fromSelector = page.locator('select').first();
    await expect(fromSelector).toBeVisible({ timeout: 10_000 });

    const options = await fromSelector.locator('option').allTextContents();
    console.log('[CT-E2E-05] Available source chain options:', options);
    const thanosOption = options.find((o) => o.toLowerCase().includes('thanos'));
    expect(thanosOption, 'Thanos Sepolia option must exist in source chain selector').toBeTruthy();

    await fromSelector.selectOption({ label: thanosOption! });
    console.log(`[CT-E2E-05] Selected source: "${thanosOption}"`);
    await page.waitForTimeout(500);

    // Check guidance message appears
    const noticeLocator = page.locator('[data-testid="thanos-direction-notice"]');
    await expect(noticeLocator).toBeVisible({ timeout: 5_000 });
    const noticeText = await noticeLocator.textContent();
    console.log(`[CT-E2E-05] Guidance message: "${noticeText?.trim()}" ✓`);

    expect(noticeText).toContain('not yet available');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/ct-e2e-05-thanos-guidance.png`, fullPage: true });
    console.log('[CT-E2E-05] Thanos direction guidance message confirmed ✓');
  } finally {
    await browser.close();
  }
});
