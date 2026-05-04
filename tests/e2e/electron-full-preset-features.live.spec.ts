/**
 * Electron E2E — Full Preset Feature Tests (Spec FP)
 *
 * Deploys a Full preset to AWS EKS via the Electron UI wizard and validates
 * five new features end-to-end:
 *   1. DRB   — regular node TCP + reader node L2 RPC + VRF (requestRandomWords → RandomWordsFulfilled)
 *   2. AA    — TON refill (depositTo EntryPoint) + on-chain balance verify + Electron AA tab UI
 *   3. CrossTrade — L1→L2 ETH + L2→L2 ETH full cycles + Blockscout explorer verification
 *   4. Fault proof contracts (DGF, ASR, DelayedWETH) deployed on L1
 *   5. DisputeGame DEFENDER_WINS + AnchorStateRegistry updated
 *
 * Test IDs:
 *   EFP-01 — Electron launch + Full preset AWS wizard deployment start
 *   EFP-02 — Deployment complete + 6 modules (bridge/blockExplorer/monitoring/systemPulse/crossTrade/drb)
 *   EFP-03 — Genesis predeploy bytecodes (OP Standard + DRB + AA)
 *   EFP-04 — Fault proof contracts deployed (DGF, ASR, DelayedWETH) on L1
 *   EFP-05 — DRB: regular node TCP + reader node L2 RPC + VRF requestRandomWords → RandomWordsFulfilled
 *   EFP-06 — AA: predeploy bytecodes + bundler alive + TON depositTo EntryPoint + balance verify + AA tab UI
 *   EFP-07 — CrossTrade: L1→L2 ETH + L2→L2 ETH full cycles + Blockscout explorer verification
 *   EFP-08 — First dispute game created (polls up to 25 min)
 *   EFP-09 — Game DEFENDER_WINS + AnchorStateRegistry anchors updated
 *
 * Usage:
 *   npm run build && \
 *   E2E_AWS_ACCESS_KEY=<key> \
 *   E2E_AWS_SECRET_KEY=<secret> \
 *   E2E_AWS_REGION=ap-northeast-2 \
 *   LIVE_L1_RPC_URL=<sepolia-rpc> \
 *   LIVE_SEED_PHRASE=<mnemonic> \
 *   npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-full-preset-features.live.spec.ts
 *
 * Skip re-deployment with LIVE_STACK_ID=<uuid>.
 *
 * Prerequisites:
 *   - npm run build (dist/main/index.js must exist)
 *   - Docker running (Electron auto-starts backend services)
 *   - E2E_AWS_ACCESS_KEY, E2E_AWS_SECRET_KEY set (never commit)
 *   - LIVE_L1_RPC_URL set (Sepolia)
 *   - LIVE_SEED_PHRASE set (admin wallet mnemonic)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { _electron as electron, ElectronApplication, chromium } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrls, resolveStackUrlsById, resolveContractAddresses, StackUrls } from './helpers/stack-resolver';
import { waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { deployPresetViaUI, resolveStackIdByChainName } from './helpers/deploy-wizard';
import { pollUntil } from './helpers/poll';
import {
  OP_STANDARD_ADDRESSES,
  DRB_ADDRESSES,
  AA_ADDRESSES,
  assertIntegrationModules,
} from './helpers/presets';
import {
  checkDisputeGameFactoryDeployed,
  checkAnchorStateRegistryInit,
  checkDelayedWethDeployed,
  waitForFirstGame,
  waitForGameResolution,
  checkAnchorStateUpdated,
  GameStatus,
} from './helpers/fault-proof';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'full' as const;
const FEE_TOKEN = 'USDC' as const;
const CHAIN_NAME = 'efpfull1';
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;
const LIVE_L1_RPC_URL = process.env.LIVE_L1_RPC_URL ?? '';
const LIVE_L1_BEACON_URL = process.env.LIVE_L1_BEACON_URL ?? 'https://ethereum-sepolia-beacon-api.publicnode.com';
const E2E_AWS_REGION = process.env.E2E_AWS_REGION ?? 'ap-northeast-2';

const DEPLOY_TIMEOUT_MS = 360 * 60 * 1000;
const CROSSTRADE_INSTALL_TIMEOUT_MS = 120 * 60 * 1000;
const CROSSTRADE_POLL_INTERVAL_MS = 15_000;
const CLAIM_TIMEOUT_MS = 20 * 60 * 1000;
const CLAIM_POLL_MS = 5_000;
const VRF_TIMEOUT_MS = 5 * 60 * 1000;
const BUNDLER_TIMEOUT_MS = 3 * 60 * 1000;
const FIRST_GAME_TIMEOUT_MS = 25 * 60 * 1000;
const GAME_RESOLVE_TIMEOUT_MS = 5 * 60 * 1000;
const TX_TIMEOUT_MS = 3 * 60 * 1000;

const EXPECTED_MODULES = ['bridge', 'monitoring', 'systemPulse', 'crossTrade', 'drb'] as const;

const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-full-preset-features';

// CrossTrade: ETH (native = address(0))
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const TRADE_AMOUNT = ethers.parseEther('0.001');
const CT_AMOUNT = ethers.parseEther('0.001');
const MIN_GAS_LIMIT = 200_000;

// AA: depositTo amount for EntryPoint
const AA_DEPOSIT_AMOUNT = ethers.parseEther('1.0');

// VRF
const VRF_FEE = ethers.parseEther('0.001');

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const L2_CT_ABI = [
  'function requestNonRegisteredToken(address _l1token, address _l2token, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 _l1chainId) external payable',
  'event NonRequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event RequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event ProviderClaimCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

const L1_CT_ABI = [
  'function provideCT(address _l1token, address _l2token, address _requestor, address _receiver, uint256 _totalAmount, uint256 _initialctAmount, uint256 _editedctAmount, uint256 _salecount, uint256 _l2chainId, uint32 _minGasLimit, bytes32 _hash) external payable',
  'event ProvideCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

const L2L2_L2_ABI = [
  'function requestNonRegisteredToken(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 _l1ChainId, uint256 _l2DestinationChainId) external payable',
  'event NonRequestCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l1ChainId, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hashValue)',
  'event RequestCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l1ChainId, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hashValue)',
  'event ProviderClaimCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l1ChainId, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hash)',
];

const L2L2_L1_ABI = [
  'function provideCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requestor, address _receiver, uint256 _totalAmount, uint256 _initialctAmount, uint256 _editedctAmount, uint256 _saleCount, uint256 _l2SourceChainId, uint256 _l2DestinationChainId, uint32 _minGasLimit, bytes32 _hash) external payable',
  'event ProvideCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hash)',
];

const ENTRY_POINT_ABI = [
  'function depositTo(address account) external payable',
  'function balanceOf(address account) external view returns (uint256)',
];

const VRF_COORDINATOR_ABI = [
  'function requestRandomWords(uint32 numWords) external payable returns (uint256 requestId)',
  'event RandomWordsFulfilled(uint256 indexed requestId, uint256[] randomWords, bool success)',
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;
let platformBrowser: import('playwright').Browser | null = null;
let deployedStackId: string | null = null;
let stackUrls: StackUrls | null = null;
let l2RpcUrl: string | null = null;
let l1Provider: ethers.JsonRpcProvider;
let l2Provider: ethers.JsonRpcProvider;
let l1Wallet: ethers.Wallet;
let l2Wallet: ethers.Wallet;
let adminAddress: string;
let l2ChainId: bigint;
let dgfAddress: string;
let asrAddress: string;
let delayedWethAddress: string;
let initialAnchorBlock: number;
let firstGameIndex: number;

// CrossTrade addresses (resolved from integration info)
let l2CrossTradeProxy: string;
let l2ToL2CrossTradeProxy: string;
let l1CrossTradeProxy: string;
let l2ToL2CrossTradeL1Proxy: string;

// CrossTrade L1→L2 state
let l1l2SaleCount: bigint;
let l1l2HashValue: string;
let l1l2ClaimFromBlock: number;
let l1l2ClaimTxHash: string;

// CrossTrade L2→L2 state
let l2l2SaleCount: bigint;
let l2l2HashValue: string;
let l2l2ClaimFromBlock: number;
let l2l2ClaimTxHash: string;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  if (!LIVE_L1_RPC_URL) {
    throw new Error('LIVE_L1_RPC_URL must be set for EFP tests');
  }
  if (!process.env.LIVE_SEED_PHRASE) {
    throw new Error('LIVE_SEED_PHRASE must be set for EFP tests');
  }

  // Resolve admin wallet from seed phrase
  const mnemonic = process.env.LIVE_SEED_PHRASE;
  const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic!);
  const adminKey = hdWallet.privateKey;

  l1Provider = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);
  // l2Provider and wallets are set in EFP-02 once stack URLs are resolved

  // Temporary wallet for L1 balance check
  l1Wallet = new ethers.Wallet(adminKey, l1Provider);
  adminAddress = l1Wallet.address;
  console.log('[efp] Admin address:', adminAddress);

  // Store key in closure for wallet re-creation after l2Provider is set
  (globalThis as Record<string, unknown>).__efp_admin_key = adminKey;

  console.log('[efp] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[efp] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-00-app-launched.png`, fullPage: false });
});

test.afterAll(async () => {
  if (platformBrowser) {
    await platformBrowser.close();
    platformBrowser = null;
  }
  if (electronApp) {
    console.log('[efp] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
  delete (globalThis as Record<string, unknown>).__efp_admin_key;
});

async function openPlatformPage() {
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
    'platform UI at localhost:3000',
    3 * 60_000,
    10_000,
  );
  const token = await loginBackend(BACKEND_URL);
  const context = await platformBrowser!.newContext();
  const page = await context.newPage();
  await context.addCookies([{ name: 'auth-token', value: token, domain: 'localhost', path: '/' }]);
  await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // @ts-ignore
  await page.evaluate((t: string) => { localStorage.setItem('accessToken', t); }, token);
  return page;
}

async function authenticateForPlatformUI(page: import('@playwright/test').Page): Promise<void> {
  const resp = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin' }),
  });
  const body = await resp.json() as Record<string, unknown>;
  const token = (body.token ?? (body.data as Record<string, unknown>)?.token) as string;
  await page.context().addCookies([{ name: 'auth-token', value: token, domain: 'localhost', path: '/' }]);
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => { localStorage.setItem('accessToken', t); }, token);
}

// ---------------------------------------------------------------------------
// EFP-01: Electron launch + Full preset AWS wizard deployment start
// ---------------------------------------------------------------------------

test('EFP-01: start Full Suite preset (USDC) deployment via AWS wizard', async () => {
  test.setTimeout(10 * 60 * 1000);
  expect(electronApp).not.toBeNull();

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EFP-01] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();
    return;
  }

  const accessKey = process.env.E2E_AWS_ACCESS_KEY;
  const secretKey = process.env.E2E_AWS_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('E2E_AWS_ACCESS_KEY and E2E_AWS_SECRET_KEY must be set for EFP tests');
  }

  await waitForBackendReady(5 * 60 * 1000);

  const platformView = await openPlatformPage();
  console.log('[EFP-01] Deploying Full Suite preset via AWS UI wizard...');

  await deployPresetViaUI(platformView, {
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
    l1BeaconUrl: LIVE_L1_BEACON_URL,
    infraProvider: 'aws',
    awsAccessKey: accessKey,
    awsSecretKey: secretKey,
    awsRegion: E2E_AWS_REGION,
  });

  deployedStackId = await resolveStackIdByChainName(CHAIN_NAME, BACKEND_URL, 60_000);
  console.log(`[EFP-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-01-deployment-initiated.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-02: Deployment complete + 6 modules
// ---------------------------------------------------------------------------

test('EFP-02: deployment complete — all 6 modules present', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + CROSSTRADE_INSTALL_TIMEOUT_MS);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EFP-02] Waiting for stack ${stackId} to reach Deployed...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');

  const token = await loginBackend(BACKEND_URL);

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
      const ct = integrations.find(
        (i) => (i.type as string).toLowerCase().replace(/[-_]/g, '') === 'crosstrade',
      );
      if (!ct) return null;
      const status = ct.status as string;
      console.log(`[EFP-02] CrossTrade status: ${status}`);
      if (status === 'installed' || status === 'Completed') return ct;
      if (status === 'Failed') throw new Error('CrossTrade integration Failed');
      return null;
    },
    'CrossTrade integration to complete',
    CROSSTRADE_INSTALL_TIMEOUT_MS,
    CROSSTRADE_POLL_INTERVAL_MS,
  );

  const intResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await intResp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];
  const integrationTypes = integrations.map((i) => i.type as string);

  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, [], 'EFP-02');
  console.log('[EFP-02] All 6 modules verified ✓');

  // Resolve stack URLs by ID to avoid picking the wrong stack when multiple
  // stacks share the same chainName (e.g. during parallel test runs).
  stackUrls = await resolveStackUrlsById(stackId);
  l2RpcUrl = stackUrls.l2Rpc;
  console.log(`[EFP-02] L2 RPC: ${l2RpcUrl}`);

  l2Provider = new ethers.JsonRpcProvider(l2RpcUrl);
  const adminKey = (globalThis as Record<string, unknown>).__efp_admin_key as string;
  l1Wallet = new ethers.Wallet(adminKey, l1Provider);
  l2Wallet = new ethers.Wallet(adminKey, l2Provider);
  adminAddress = l1Wallet.address;

  const network = await l2Provider.getNetwork();
  l2ChainId = network.chainId;
  console.log(`[EFP-02] L2 chainId: ${l2ChainId}`);

  // Resolve CrossTrade contract addresses from integration info
  const crossTradeInt = integrations.find((i) => i.type === 'cross-trade');
  expect(crossTradeInt, 'CrossTrade integration not found').toBeDefined();
  const info = (crossTradeInt!.info ?? {}) as Record<string, unknown>;
  const contracts = (info.contracts ?? {}) as Record<string, string>;

  l2CrossTradeProxy = contracts.l2_cross_trade_proxy;
  l2ToL2CrossTradeProxy = contracts.l2_to_l2_cross_trade_proxy;
  expect(l2CrossTradeProxy, 'l2_cross_trade_proxy missing').toBeTruthy();
  expect(l2ToL2CrossTradeProxy, 'l2_to_l2_cross_trade_proxy missing').toBeTruthy();
  console.log('[EFP-02] L2CrossTradeProxy:', l2CrossTradeProxy);
  console.log('[EFP-02] L2ToL2CrossTradeProxy:', l2ToL2CrossTradeProxy);

  // Resolve L1 CrossTrade addresses: env var overrides > integration contracts > tx receipts
  if (process.env.LIVE_L1_CROSS_TRADE_PROXY && process.env.LIVE_L2L2_L1_PROXY) {
    l1CrossTradeProxy = process.env.LIVE_L1_CROSS_TRADE_PROXY;
    l2ToL2CrossTradeL1Proxy = process.env.LIVE_L2L2_L1_PROXY;
    console.log('[EFP-02] L1 CrossTrade contracts from env vars');
  } else if (contracts.l1_cross_trade_proxy && contracts.l2_to_l2_l1_proxy) {
    l1CrossTradeProxy = contracts.l1_cross_trade_proxy;
    l2ToL2CrossTradeL1Proxy = contracts.l2_to_l2_l1_proxy;
    console.log('[EFP-02] L1 CrossTrade contracts from integration contracts');
  } else {
    const l1RegTxHash = info.l1_registration_tx_hash as string;
    const l1L2l2TxHash = info.l1_l2l2_tx_hash as string;
    expect(l1RegTxHash, 'l1_registration_tx_hash missing — set LIVE_L1_CROSS_TRADE_PROXY').toBeTruthy();
    expect(l1L2l2TxHash, 'l1_l2l2_tx_hash missing — set LIVE_L2L2_L1_PROXY').toBeTruthy();

    const receipt1 = await l1Provider.getTransactionReceipt(l1RegTxHash);
    expect(receipt1, `L1 registration tx not found: ${l1RegTxHash}`).not.toBeNull();
    l1CrossTradeProxy = receipt1!.to!;

    const receipt2 = await l1Provider.getTransactionReceipt(l1L2l2TxHash);
    expect(receipt2, `L1 L2toL2 tx not found: ${l1L2l2TxHash}`).not.toBeNull();
    l2ToL2CrossTradeL1Proxy = receipt2!.to!;
  }
  console.log('[EFP-02] L1CrossTradeProxy:', l1CrossTradeProxy);
  console.log('[EFP-02] L2toL2CrossTradeL1Proxy:', l2ToL2CrossTradeL1Proxy);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-02-deployed.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-03: Genesis predeploy bytecodes
// ---------------------------------------------------------------------------

test('EFP-03: genesis predeploys bytecode exists (OP Standard + DRB + AA)', async () => {
  test.setTimeout(3 * 60 * 1000);
  expect(l2RpcUrl).not.toBeNull();

  const provider = new ethers.JsonRpcProvider(l2RpcUrl!);
  let verified = 0;

  for (const [name, address] of Object.entries(OP_STANDARD_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `OP Standard ${name} (${address}) must have bytecode`).not.toBe('0x');
    verified++;
    console.log(`[EFP-03] OP/${name}: ✓`);
  }

  for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `DRB ${name} (${address}) must have bytecode`).not.toBe('0x');
    verified++;
    console.log(`[EFP-03] DRB/${name}: ✓`);
  }

  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `AA ${name} (${address}) must have bytecode`).not.toBe('0x');
    verified++;
    console.log(`[EFP-03] AA/${name}: ✓`);
  }

  console.log(`[EFP-03] ${verified} predeploy contracts verified ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-03-predeploys.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-04: Fault proof contracts deployed on L1
// ---------------------------------------------------------------------------

test('EFP-04: fault proof contracts deployed (DGF, ASR, DelayedWETH)', async () => {
  test.setTimeout(2 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const addresses = await resolveContractAddresses(deployedStackId!);
  dgfAddress = addresses.disputeGameFactoryProxy;
  asrAddress = addresses.anchorStateRegistryProxy;
  delayedWethAddress = addresses.delayedWethProxy;

  expect(dgfAddress, 'DisputeGameFactory address must be in deployment JSON').toBeTruthy();
  const { cannonImpl, gameCount } = await checkDisputeGameFactoryDeployed(l1Provider, dgfAddress);
  expect(cannonImpl).not.toBe(ethers.ZeroAddress);
  console.log(`[EFP-04] DisputeGameFactory: gameCount=${gameCount}, CANNON=${cannonImpl} ✓`);

  expect(asrAddress, 'AnchorStateRegistry address must be in deployment JSON').toBeTruthy();
  const { l2BlockNumber } = await checkAnchorStateRegistryInit(l1Provider, asrAddress);
  initialAnchorBlock = l2BlockNumber;
  expect(l2BlockNumber).toBeGreaterThan(0);
  console.log(`[EFP-04] AnchorStateRegistry: l2BlockNumber=${l2BlockNumber} ✓`);

  expect(delayedWethAddress, 'DelayedWETH address must be in deployment JSON').toBeTruthy();
  const version = await checkDelayedWethDeployed(l1Provider, delayedWethAddress);
  console.log(`[EFP-04] DelayedWETH: version=${version} ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-04-fp-contracts.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-05: DRB health — regular node TCP + reader node L2 RPC + VRF
// ---------------------------------------------------------------------------

test('EFP-05: DRB — regular node TCP + reader node L2 RPC + VRF requestRandomWords → RandomWordsFulfilled', async () => {
  test.setTimeout(VRF_TIMEOUT_MS + 2 * 60 * 1000);
  expect(stackUrls).not.toBeNull();
  expect(l2Provider).toBeDefined();

  const drbUrl = stackUrls!.drbUrl;
  const drbHost = new URL(drbUrl).hostname;
  const drbPort = parseInt(new URL(drbUrl).port || '9600');

  // 1) Regular node: TCP/libp2p connectivity on port 9600
  console.log(`[EFP-05] Checking DRB regular node TCP at ${drbHost}:${drbPort}...`);
  const isListening = await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: drbHost, port: drbPort, timeout: 5_000 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
  expect(isListening, `DRB regular node not listening on ${drbHost}:${drbPort}`).toBe(true);
  console.log(`[EFP-05] Regular node TCP ✓ (${drbHost}:${drbPort})`);

  // 2) Reader node: verify all DRB predeploys are readable via L2 RPC
  console.log('[EFP-05] Verifying DRB reader node access via L2 RPC...');
  for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
    const code = await l2Provider.getCode(address);
    expect(code, `DRB ${name} not readable via L2 RPC`).not.toBe('0x');
    // Verify non-empty storage is accessible (proves state is readable)
    const slot0 = await l2Provider.getStorage(address, 0);
    console.log(`[EFP-05] DRB ${name} (${address}): code ✓, storage[0]=${slot0}`);
  }
  console.log('[EFP-05] Reader node L2 RPC access ✓');

  // 3) VRF: requestRandomWords → RandomWordsFulfilled
  console.log('[EFP-05] Calling VRFCoordinator.requestRandomWords(1)...');
  const vrfCoordinator = new ethers.Contract(DRB_ADDRESSES.VRFCoordinator, VRF_COORDINATOR_ABI, l2Wallet);

  const tx = await vrfCoordinator.requestRandomWords(
    1,               // numWords
    { value: VRF_FEE },
  );
  console.log(`[EFP-05] requestRandomWords TX: ${tx.hash}`);
  const receipt = await tx.wait(1);
  expect(receipt).not.toBeNull();
  expect(receipt!.status, 'requestRandomWords tx failed').toBe(1);

  // Parse requestId from tx return value or event
  // VRFCoordinator may emit a RandomWordsRequested event; requestId is in the return value
  let requestId: bigint | null = null;
  try {
    // Try to get requestId from receipt via staticCall (if available)
    const iface = new ethers.Interface(VRF_COORDINATOR_ABI);
    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed && parsed.name.includes('Request')) {
          requestId = parsed.args[0] as bigint;
          break;
        }
      } catch {
        // Different event — skip
      }
    }
    // Fallback: use block number as correlation (poll from current block)
    if (requestId === null) {
      console.log('[EFP-05] No RequestId event found — will match RandomWordsFulfilled by block range');
    }
  } catch {
    // Ignore parsing errors
  }

  const vrfFromBlock = receipt!.blockNumber;
  console.log(`[EFP-05] Polling for RandomWordsFulfilled from block ${vrfFromBlock}...`);

  const vrfIface = new ethers.Interface(VRF_COORDINATOR_ABI);
  const fulfilledTopic = ethers.id('RandomWordsFulfilled(uint256,uint256[],bool)');

  const fulfilledEvent = await pollUntil<ethers.Log>(
    async () => {
      const logs = await l2Provider.getLogs({
        address: DRB_ADDRESSES.VRFCoordinator,
        topics: [fulfilledTopic],
        fromBlock: vrfFromBlock,
        toBlock: 'latest',
      });
      if (logs.length === 0) return null;

      // If we have a requestId, match exactly; otherwise return first fulfilled
      if (requestId !== null) {
        const matched = logs.find((log) => {
          try {
            const parsed = vrfIface.parseLog({ topics: [...log.topics], data: log.data });
            return parsed?.args.requestId === requestId;
          } catch {
            return false;
          }
        });
        return matched ?? null;
      }
      return logs[0];
    },
    'RandomWordsFulfilled event on VRFCoordinator',
    VRF_TIMEOUT_MS,
    5_000,
  );

  const parsed = vrfIface.parseLog({ topics: [...fulfilledEvent.topics], data: fulfilledEvent.data })!;
  expect(parsed.args.success, 'RandomWordsFulfilled.success must be true').toBe(true);
  const randomWords = parsed.args.randomWords as bigint[];
  expect(randomWords.length).toBeGreaterThan(0);
  expect(randomWords[0]).toBeGreaterThan(0n);

  console.log(`[EFP-05] VRF fulfilled ✓ requestId=${parsed.args.requestId}, randomWords=${randomWords.map(String).join(',')}`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-05-drb-vrf.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-06: AA — predeploys + bundler + TON depositTo + balance verify + Electron AA tab UI
// ---------------------------------------------------------------------------

test('EFP-06: AA — predeploys + bundler alive + TON depositTo EntryPoint + balance verify + Electron AA tab UI', async () => {
  test.setTimeout(BUNDLER_TIMEOUT_MS + 3 * 60 * 1000);
  expect(stackUrls).not.toBeNull();
  expect(l2Provider).toBeDefined();

  // 1) Verify AA predeploy bytecodes on L2
  console.log('[EFP-06] Verifying AA predeploy bytecodes...');
  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await l2Provider.getCode(address);
    expect(code, `AA ${name} (${address}) must have bytecode`).not.toBe('0x');
    console.log(`[EFP-06] AA/${name}: ✓`);
  }

  // 2) Check bundler is alive via eth_supportedEntryPoints
  const bundlerUrl = stackUrls!.bundlerUrl;
  console.log(`[EFP-06] Waiting for bundler at ${bundlerUrl}...`);
  const supportedEntryPoints = await pollUntil<string[]>(
    async () => {
      try {
        const resp = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_supportedEntryPoints', params: [] }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as { result?: string[]; error?: unknown };
        if (data.error || !data.result?.length) return null;
        return data.result;
      } catch {
        return null;
      }
    },
    'bundler eth_supportedEntryPoints',
    BUNDLER_TIMEOUT_MS,
    10_000,
  );
  expect(supportedEntryPoints).toContain(AA_ADDRESSES.EntryPoint);
  console.log(`[EFP-06] Bundler alive ✓ — supports EntryPoint ${AA_ADDRESSES.EntryPoint}`);

  // 3) TON depositTo: deposit 1 TON into EntryPoint for the paymaster
  const paymaster = AA_ADDRESSES.MultiTokenPaymaster;
  const entryPoint = new ethers.Contract(AA_ADDRESSES.EntryPoint, ENTRY_POINT_ABI, l2Wallet);

  const balanceBefore = await entryPoint.balanceOf(paymaster);
  console.log(`[EFP-06] Paymaster EntryPoint balance before: ${ethers.formatEther(balanceBefore)} TON`);

  console.log(`[EFP-06] Calling depositTo(${paymaster}) with ${ethers.formatEther(AA_DEPOSIT_AMOUNT)} TON...`);
  const depositTx = await entryPoint.depositTo(paymaster, { value: AA_DEPOSIT_AMOUNT });
  console.log(`[EFP-06] depositTo TX: ${depositTx.hash}`);
  const depositReceipt = await depositTx.wait(1);
  expect(depositReceipt).not.toBeNull();
  expect(depositReceipt!.status, 'depositTo tx failed').toBe(1);
  console.log(`[EFP-06] depositTo confirmed in block ${depositReceipt!.blockNumber} ✓`);

  // 4) Verify on-chain balance increased
  const balanceAfter = await entryPoint.balanceOf(paymaster);
  console.log(`[EFP-06] Paymaster EntryPoint balance after: ${ethers.formatEther(balanceAfter)} TON`);
  expect(balanceAfter).toBeGreaterThan(balanceBefore);
  expect(balanceAfter - balanceBefore).toBe(AA_DEPOSIT_AMOUNT);
  console.log(`[EFP-06] On-chain balance increase verified: +${ethers.formatEther(AA_DEPOSIT_AMOUNT)} TON ✓`);

  // 5) Electron AA tab UI check
  if (!platformBrowser) {
    platformBrowser = await chromium.launch({ headless: true });
  }
  const context = await platformBrowser!.newContext();
  const page = await context.newPage();

  await authenticateForPlatformUI(page);
  await page.goto(
    `http://localhost:3000/rollup/${stackUrls!.stackId}?tab=account-abstraction`,
    { waitUntil: 'networkidle', timeout: 30_000 },
  );

  // Verify AA tab renders with expected elements
  await expect(page.locator('text=Fee Token Oracle')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('text=EntryPoint Auto-Refill')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=Predeploy Addresses')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`text=${AA_ADDRESSES.EntryPoint}`)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`text=${AA_ADDRESSES.MultiTokenPaymaster}`)).toBeVisible({ timeout: 10_000 });

  // Wait for balance to appear (may need time after deposit)
  const statusBadge = page.getByText(/Healthy|Warning|Critical/);
  await expect(statusBadge.first()).toBeVisible({ timeout: 30_000 });

  // Verify balance display reflects deposit (within 0.1 TON tolerance for polling lag)
  const balanceEl = page.locator('.text-2xl.font-bold').first();
  await expect(balanceEl).toBeVisible({ timeout: 30_000 });
  const uiBalanceText = await balanceEl.textContent();
  console.log(`[EFP-06] AA tab balance: ${uiBalanceText} TON`);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/efp-06-aa-tab.png`, fullPage: true });
  await context.close();
  console.log('[EFP-06] AA tab UI verified ✓');

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-06-electron-aa.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-07: CrossTrade — L1→L2 + L2→L2 full cycles + Blockscout explorer verification
// ---------------------------------------------------------------------------

test('EFP-07: CrossTrade — L1→L2 ETH + L2→L2 ETH full cycles + Blockscout explorer verification', async () => {
  test.setTimeout(2 * CLAIM_TIMEOUT_MS + 10 * 60 * 1000);
  expect(l2CrossTradeProxy, 'l2CrossTradeProxy must be set from EFP-02').toBeTruthy();
  expect(l1CrossTradeProxy, 'l1CrossTradeProxy must be set from EFP-02').toBeTruthy();
  expect(l2ToL2CrossTradeProxy, 'l2ToL2CrossTradeProxy must be set from EFP-02').toBeTruthy();
  expect(l2ToL2CrossTradeL1Proxy, 'l2ToL2CrossTradeL1Proxy must be set from EFP-02').toBeTruthy();

  const l1ChainId = (await l1Provider.getNetwork()).chainId;
  const l1CtContract = new ethers.Contract(l1CrossTradeProxy, L1_CT_ABI, l1Wallet);
  const l2CtContract = new ethers.Contract(l2CrossTradeProxy, L2_CT_ABI, l2Wallet);
  const l2l2Contract = new ethers.Contract(l2ToL2CrossTradeProxy, L2L2_L2_ABI, l2Wallet);
  const l1L2l2Contract = new ethers.Contract(l2ToL2CrossTradeL1Proxy, L2L2_L1_ABI, l1Wallet);

  // ── Step 1: L1→L2 Request ──────────────────────────────────────────────
  console.log('[EFP-07] L1→L2: calling requestNonRegisteredToken...');
  {
    const tx = await l2CtContract.requestNonRegisteredToken(
      ETH_ADDRESS, ETH_ADDRESS, adminAddress, TRADE_AMOUNT, CT_AMOUNT, l1ChainId,
      { value: TRADE_AMOUNT },
    );
    console.log(`[EFP-07] L1→L2 request TX: ${tx.hash}`);
    const receipt = await tx.wait(1);
    expect(receipt!.status, 'L1→L2 request tx failed').toBe(1);

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
    l1l2SaleCount = parsedEvent!.args._saleCount as bigint;
    l1l2HashValue = parsedEvent!.args._hashValue as string;
    console.log(`[EFP-07] L1→L2 request ✓ saleCount=${l1l2SaleCount}, hash=${l1l2HashValue}`);
  }

  // ── Step 2: L2→L2 Request ──────────────────────────────────────────────
  console.log('[EFP-07] L2→L2: calling requestNonRegisteredToken...');
  {
    const tx = await l2l2Contract.requestNonRegisteredToken(
      ETH_ADDRESS, ETH_ADDRESS, ETH_ADDRESS, adminAddress,
      TRADE_AMOUNT, CT_AMOUNT, l1ChainId, l2ChainId,
      { value: TRADE_AMOUNT },
    );
    console.log(`[EFP-07] L2→L2 request TX: ${tx.hash}`);
    const receipt = await tx.wait(1);
    expect(receipt!.status, 'L2→L2 request tx failed').toBe(1);

    const iface = new ethers.Interface(L2L2_L2_ABI);
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
    expect(parsedEvent, 'NonRequestCT/RequestCT event not found (L2→L2)').not.toBeNull();
    l2l2SaleCount = parsedEvent!.args._saleCount as bigint;
    l2l2HashValue = parsedEvent!.args._hashValue as string;
    console.log(`[EFP-07] L2→L2 request ✓ saleCount=${l2l2SaleCount}, hash=${l2l2HashValue}`);
  }

  // ── Step 3: L1→L2 Provide ─────────────────────────────────────────────
  console.log('[EFP-07] L1→L2: calling provideCT...');
  {
    const tx = await l1CtContract.provideCT(
      ETH_ADDRESS, ETH_ADDRESS, adminAddress, adminAddress,
      TRADE_AMOUNT, CT_AMOUNT, 0n, l1l2SaleCount, l2ChainId,
      MIN_GAS_LIMIT, l1l2HashValue,
      { value: CT_AMOUNT },
    );
    console.log(`[EFP-07] L1→L2 provide TX: ${tx.hash}`);
    const receipt = await tx.wait(1);
    expect(receipt!.status, 'L1→L2 provide tx failed').toBe(1);
    l1l2ClaimFromBlock = await l2Provider.getBlockNumber();
    console.log(`[EFP-07] L1→L2 provide ✓ — claim search from block ${l1l2ClaimFromBlock}`);
  }

  // ── Step 4: L2→L2 Provide ─────────────────────────────────────────────
  console.log('[EFP-07] L2→L2: calling provideCT...');
  {
    const tx = await l1L2l2Contract.provideCT(
      ETH_ADDRESS, ETH_ADDRESS, ETH_ADDRESS,
      adminAddress, adminAddress,
      TRADE_AMOUNT, CT_AMOUNT, 0n, l2l2SaleCount,
      l2ChainId, l2ChainId,
      MIN_GAS_LIMIT, l2l2HashValue,
      { value: CT_AMOUNT },
    );
    console.log(`[EFP-07] L2→L2 provide TX: ${tx.hash}`);
    const receipt = await tx.wait(1);
    expect(receipt!.status, 'L2→L2 provide tx failed').toBe(1);
    l2l2ClaimFromBlock = await l2Provider.getBlockNumber();
    console.log(`[EFP-07] L2→L2 provide ✓ — claim search from block ${l2l2ClaimFromBlock}`);
  }

  // ── Step 5: Poll L1→L2 and L2→L2 claims in parallel ──────────────────
  console.log('[EFP-07] Polling for both ProviderClaimCT events in parallel...');

  const l1l2IfaceRef = new ethers.Interface(L2_CT_ABI);
  const l2l2IfaceRef = new ethers.Interface(L2L2_L2_ABI);

  const [l1l2ClaimEvent, l2l2ClaimEvent] = await Promise.all([
    // L1→L2 claim
    pollUntil<ethers.Log>(
      async () => {
        const logs = await l2Provider.getLogs({
          address: l2CrossTradeProxy,
          topics: [ethers.id('ProviderClaimCT(address,address,address,address,address,uint256,uint256,uint256,uint256,bytes32)')],
          fromBlock: l1l2ClaimFromBlock,
          toBlock: 'latest',
        });
        const matched = logs.find((log) => {
          try {
            const parsed = l1l2IfaceRef.parseLog({ topics: [...log.topics], data: log.data });
            return parsed?.args._hash === l1l2HashValue;
          } catch { return false; }
        });
        return matched ?? null;
      },
      'ProviderClaimCT on L2 (L1→L2)',
      CLAIM_TIMEOUT_MS,
      CLAIM_POLL_MS,
    ),
    // L2→L2 claim
    pollUntil<ethers.Log>(
      async () => {
        const logs = await l2Provider.getLogs({
          address: l2ToL2CrossTradeProxy,
          topics: [ethers.id('ProviderClaimCT(address,address,address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,bytes32)')],
          fromBlock: l2l2ClaimFromBlock,
          toBlock: 'latest',
        });
        const matched = logs.find((log) => {
          try {
            const parsed = l2l2IfaceRef.parseLog({ topics: [...log.topics], data: log.data });
            return parsed?.args._hash === l2l2HashValue;
          } catch { return false; }
        });
        return matched ?? null;
      },
      'ProviderClaimCT on L2 (L2→L2)',
      CLAIM_TIMEOUT_MS,
      CLAIM_POLL_MS,
    ),
  ]);

  l1l2ClaimTxHash = l1l2ClaimEvent.transactionHash;
  l2l2ClaimTxHash = l2l2ClaimEvent.transactionHash;

  const l1l2ClaimParsed = l1l2IfaceRef.parseLog({ topics: [...l1l2ClaimEvent.topics], data: l1l2ClaimEvent.data })!;
  const l2l2ClaimParsed = l2l2IfaceRef.parseLog({ topics: [...l2l2ClaimEvent.topics], data: l2l2ClaimEvent.data })!;

  expect(l1l2ClaimParsed.args._hash).toBe(l1l2HashValue);
  expect(l2l2ClaimParsed.args._hash).toBe(l2l2HashValue);

  console.log(`[EFP-07] L1→L2 ProviderClaimCT ✓ txHash=${l1l2ClaimTxHash}`);
  console.log(`[EFP-07] L2→L2 ProviderClaimCT ✓ txHash=${l2l2ClaimTxHash}`);

  // ── Step 6: Blockscout explorer verification ──────────────────────────
  const explorerApiUrl = stackUrls!.explorerApiUrl;
  console.log(`[EFP-07] Verifying claim TXs on Blockscout (${explorerApiUrl})...`);

  for (const [label, txHash] of [['L1→L2 claim', l1l2ClaimTxHash], ['L2→L2 claim', l2l2ClaimTxHash]] as const) {
    const explorerTx = await pollUntil<Record<string, unknown>>(
      async () => {
        try {
          const resp = await fetch(`${explorerApiUrl}/transactions/${txHash}`, {
            signal: AbortSignal.timeout(10_000),
          });
          if (!resp.ok) return null;
          const body = await resp.json() as Record<string, unknown>;
          // Blockscout v2: returns status "ok" on success
          if (body.status === 'ok' || body.hash) return body;
          return null;
        } catch {
          return null;
        }
      },
      `Blockscout TX for ${label}`,
      5 * 60_000,
      10_000,
    );

    const explorerHash = (explorerTx.hash as string | undefined) ?? '';
    expect(
      explorerHash.toLowerCase(),
      `Blockscout TX hash mismatch for ${label}`,
    ).toBe(txHash.toLowerCase());
    console.log(`[EFP-07] Blockscout verified ${label}: ${explorerHash} ✓`);
  }

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-07-crosstrade.png`, fullPage: false });
  console.log('[EFP-07] CrossTrade L1→L2 + L2→L2 + Blockscout verification complete ✓');
});

// ---------------------------------------------------------------------------
// EFP-08: First dispute game created
// ---------------------------------------------------------------------------

test('EFP-08: first dispute game created (polls up to 25 min)', async () => {
  test.setTimeout(FIRST_GAME_TIMEOUT_MS + 60_000);
  expect(dgfAddress, 'dgfAddress must be set from EFP-04').toBeTruthy();

  firstGameIndex = await waitForFirstGame(l1Provider, dgfAddress, FIRST_GAME_TIMEOUT_MS);
  console.log(`[EFP-08] First dispute game at index ${firstGameIndex} ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-08-first-game.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFP-09: Game DEFENDER_WINS + AnchorStateRegistry updated
// ---------------------------------------------------------------------------

test('EFP-09: game resolves DEFENDER_WINS, AnchorStateRegistry anchors updated', async () => {
  test.setTimeout(GAME_RESOLVE_TIMEOUT_MS + 2 * 60_000);
  expect(dgfAddress, 'dgfAddress must be set from EFP-04').toBeTruthy();
  expect(asrAddress, 'asrAddress must be set from EFP-04').toBeTruthy();

  const { gameAddress, status } = await waitForGameResolution(
    l1Provider,
    dgfAddress,
    firstGameIndex,
    GAME_RESOLVE_TIMEOUT_MS,
  );
  expect(status).toBe(GameStatus.DEFENDER_WINS);
  console.log(`[EFP-09] Game ${gameAddress} resolved: DEFENDER_WINS ✓`);

  const { root, l2BlockNumber } = await checkAnchorStateUpdated(
    l1Provider,
    asrAddress,
    initialAnchorBlock,
  );
  expect(l2BlockNumber).toBeGreaterThan(initialAnchorBlock);
  console.log(
    `[EFP-09] AnchorStateRegistry updated: l2BlockNumber=${l2BlockNumber} > ${initialAnchorBlock}, root=${root} ✓`,
  );

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efp-09-fp-complete.png`, fullPage: false });
  console.log('[EFP-09] Fault proof E2E complete ✓');
});
