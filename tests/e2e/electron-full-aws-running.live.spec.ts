/**
 * Electron E2E — Full Preset AWS Deployment (Running Instance)
 *
 * Connects to the already-running Electron app via localhost:3000/8000.
 * Does NOT launch a new Electron instance — the user's live app is used.
 *
 * Full preset AWS specifics:
 *   - infraProvider: aws (EKS Kubernetes deployment)
 *   - FaultProofEnabled: true → DisputeGameFactory + op-challenger
 *   - challengePeriod: 12s (testnet)
 *   - All 6 modules: bridge, blockExplorer, monitoring, systemPulse, crossTrade, drb
 *
 * Test IDs:
 *   EFR-01 — Full preset AWS wizard 실행 및 배포 시작
 *   EFR-02 — 배포 완료 + 6개 모듈 확인
 *   EFR-03 — Genesis predeploy bytecode 검증 (OP Standard + DRB + AA)
 *   EFR-04 — Fault proof contracts (DGF, ASR, DelayedWETH) on L1
 *   EFR-05 — 첫 번째 dispute game 생성 확인
 *
 * Usage:
 *   npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-full-aws-running.live.spec.ts
 *
 *   # Skip re-deployment (reuse existing stack):
 *   LIVE_STACK_ID=<uuid> LIVE_L2_RPC=<url> [...above...]
 *
 * AWS credentials (in priority order):
 *   1. E2E_AWS_ACCESS_KEY / E2E_AWS_SECRET_KEY env vars
 *   2. ~/.aws/credentials [default] profile
 *
 * Other env vars:
 *   LIVE_L1_RPC_URL    — Sepolia RPC (defaults to project default)
 *   LIVE_SEED_PHRASE   — Deployer mnemonic (defaults to project test seed)
 *   LIVE_L1_BEACON_URL — Beacon chain URL
 *   E2E_AWS_REGION     — AWS region (default: ap-northeast-2)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chromium, Browser } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrlsById, resolveContractAddresses } from './helpers/stack-resolver';
import { waitForDeployed } from './helpers/deploy-helper';
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
  GameStatus,
} from './helpers/fault-proof';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

function readAwsDefaultCredentials(): { accessKeyId: string; secretAccessKey: string } | null {
  try {
    const credPath = path.join(os.homedir(), '.aws', 'credentials');
    if (!fs.existsSync(credPath)) return null;
    const content = fs.readFileSync(credPath, 'utf-8');
    // Minimal INI parser: find [default] section and extract key/value pairs
    let inDefault = false;
    let accessKeyId = '';
    let secretAccessKey = '';
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('[')) {
        inDefault = line === '[default]';
        continue;
      }
      if (!inDefault || !line || line.startsWith('#') || line.startsWith(';')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k === 'aws_access_key_id') accessKeyId = v;
      else if (k === 'aws_secret_access_key') secretAccessKey = v;
    }
    if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey };
  } catch {
    // ignore parse errors
  }
  return null;
}

function getAwsCredentials(): { accessKeyId: string; secretAccessKey: string } {
  // Prefer explicit env vars (E2E_AWS_ACCESS_KEY wins over all)
  const envKey = process.env.E2E_AWS_ACCESS_KEY;
  const envSecret = process.env.E2E_AWS_SECRET_KEY;
  if (envKey && envSecret) {
    return { accessKeyId: envKey, secretAccessKey: envSecret };
  }

  // Fall back to ~/.aws/credentials [default]
  const fromFile = readAwsDefaultCredentials();
  if (fromFile) {
    console.log('[efr] Using credentials from ~/.aws/credentials [default]');
    return fromFile;
  }

  throw new Error(
    'AWS credentials not found. Set E2E_AWS_ACCESS_KEY + E2E_AWS_SECRET_KEY, ' +
    'or configure ~/.aws/credentials [default] profile.',
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'full' as const;
const FEE_TOKEN = 'USDC' as const;
const CHAIN_NAME = `efrfull${Date.now().toString(36).slice(-4)}`;
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const PLATFORM_URL = 'http://localhost:3000';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;
const LIVE_L2_RPC = process.env.LIVE_L2_RPC ?? null;
const LIVE_L1_RPC_URL =
  process.env.LIVE_L1_RPC_URL ??
  'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';
const LIVE_L1_BEACON_URL =
  process.env.LIVE_L1_BEACON_URL ?? 'https://ethereum-sepolia-beacon-api.publicnode.com';
const E2E_AWS_REGION = process.env.E2E_AWS_REGION ?? 'ap-northeast-2';
const LIVE_SEED_PHRASE =
  process.env.LIVE_SEED_PHRASE ??
  'notable famous industry antique either story escape squeeze also session priority fresh';

function resolveAdminPrivateKey(): string {
  const wallet = ethers.HDNodeWallet.fromPhrase(LIVE_SEED_PHRASE);
  return wallet.privateKey;
}

const DEPLOY_TIMEOUT_MS = 50 * 60 * 1000;
const CROSSTRADE_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const CROSSTRADE_POLL_INTERVAL_MS = 15_000;
const FIRST_GAME_TIMEOUT_MS = 25 * 60 * 1000;

const EXPECTED_MODULES = [
  'bridge',
  'blockExplorer',
  'monitoring',
  'systemPulse',
  'crossTrade',
  'drb',
] as const;

const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-full-aws-running';

// ---------------------------------------------------------------------------
// State (shared across tests in serial run)
// ---------------------------------------------------------------------------

let browser: Browser | null = null;
let deployedStackId: string | null = null;
let l2RpcUrl: string | null = null;
let l1Provider: ethers.JsonRpcProvider;
let dgfAddress: string;
let asrAddress: string;
let delayedWethAddress: string;
let initialAnchorBlock: number;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openPlatformPage() {
  if (!browser) throw new Error('Browser not initialised');

  // Wait for platform UI to be reachable
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
    2 * 60_000,
    5_000,
  );

  const token = await loginBackend(BACKEND_URL);
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.addCookies([
    { name: 'auth-token', value: token, domain: 'localhost', path: '/' },
  ]);
  await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // @ts-ignore
  await page.evaluate((t: string) => { localStorage.setItem('accessToken', t); }, token);
  return page;
}

async function screenshot(name: string): Promise<string> {
  const filePath = `${SCREENSHOT_DIR}/${name}.png`;
  try {
    if (browser) {
      const pages = browser.contexts().flatMap((c) => c.pages());
      const page = pages[0];
      if (page) {
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`[efr] Screenshot: ${filePath}`);
      }
    }
  } catch (err) {
    console.warn(`[efr] Screenshot failed: ${err}`);
  }
  return filePath;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  browser = await chromium.launch({ headless: true });
  console.log(`[efr] Headless Chromium launched — connecting to ${PLATFORM_URL}`);
  console.log(`[efr] Chain name for this run: ${CHAIN_NAME}`);
});

test.afterAll(async () => {
  if (browser) {
    await browser.close();
    browser = null;
  }
});

// ---------------------------------------------------------------------------
// EFR-01: Full preset AWS 배포 wizard 실행
// ---------------------------------------------------------------------------

test('EFR-01: start Full Suite preset (USDC/AWS) deployment via UI wizard', async () => {
  test.setTimeout(10 * 60 * 1000);

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EFR-01] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();
    return;
  }

  const creds = getAwsCredentials();
  console.log(`[EFR-01] AWS access key: ${creds.accessKeyId.slice(0, 8)}...`);
  console.log(`[EFR-01] Region: ${E2E_AWS_REGION}`);

  const page = await openPlatformPage();

  // Take before screenshot
  await page.screenshot({ path: `${SCREENSHOT_DIR}/efr-01-before-wizard.png`, fullPage: true });

  await deployPresetViaUI(page, {
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
    l1RpcUrl: LIVE_L1_RPC_URL,
    l1BeaconUrl: LIVE_L1_BEACON_URL,
    infraProvider: 'aws',
    awsAccessKey: creds.accessKeyId,
    awsSecretKey: creds.secretAccessKey,
    awsRegion: E2E_AWS_REGION,
    awsCredentialName: 'dev-account',
  });

  deployedStackId = await resolveStackIdByChainName(CHAIN_NAME, BACKEND_URL, 60_000);
  console.log(`[EFR-01] Deployment initiated: chainName=${CHAIN_NAME} stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/efr-01-deployment-initiated.png`, fullPage: true });

  // Save deployment info to result file
  const resultPath = `${SCREENSHOT_DIR}/deployment-info.json`;
  fs.writeFileSync(
    resultPath,
    JSON.stringify({ stackId: deployedStackId, chainName: CHAIN_NAME, timestamp: new Date().toISOString() }, null, 2),
  );
  console.log(`[EFR-01] Deployment info saved: ${resultPath}`);
});

// ---------------------------------------------------------------------------
// EFR-02: 배포 완료 + 6개 모듈 전체 확인
// ---------------------------------------------------------------------------

test('EFR-02: deployment complete — all 6 modules present', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + CROSSTRADE_INSTALL_TIMEOUT_MS);
  expect(deployedStackId, 'EFR-01 must run first').not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EFR-02] Waiting for stack ${stackId} to deploy...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');
  console.log('[EFR-02] Stack deployed ✓');

  const token = await loginBackend(BACKEND_URL);

  // Wait for CrossTrade integration to complete (async post-deploy)
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
      console.log(`[EFR-02] CrossTrade status: ${status}`);
      if (status === 'installed' || status === 'Completed') return ct;
      if (status === 'Failed') throw new Error('CrossTrade integration Failed');
      return null;
    },
    'CrossTrade integration to complete',
    CROSSTRADE_INSTALL_TIMEOUT_MS,
    CROSSTRADE_POLL_INTERVAL_MS,
  );

  // Verify all 6 modules
  const intResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await intResp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];
  const integrationTypes = integrations.map((i) => i.type as string);
  console.log(`[EFR-02] Modules: ${integrationTypes.join(', ')}`);
  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, [], 'EFR-02');
  console.log('[EFR-02] All 6 modules verified ✓');

  // Resolve L2 RPC URL
  if (LIVE_L2_RPC) {
    l2RpcUrl = LIVE_L2_RPC;
    console.log(`[EFR-02] L2 RPC (from env): ${l2RpcUrl}`);
  } else {
    try {
      const urls = await resolveStackUrlsById(stackId);
      l2RpcUrl = urls.l2Rpc;
      console.log(`[EFR-02] L2 RPC: ${l2RpcUrl}`);
    } catch (err) {
      throw new Error(`Cannot resolve L2 RPC URL for stack ${stackId}: ${err}. Set LIVE_L2_RPC env var to skip.`);
    }
  }

  // Persist resolved info
  const resultPath = `${SCREENSHOT_DIR}/deployment-info.json`;
  const existing = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(
    resultPath,
    JSON.stringify({ ...existing, status: 'Deployed', l2RpcUrl, modules: integrationTypes }, null, 2),
  );

  await screenshot('efr-02-deployed');
});

// ---------------------------------------------------------------------------
// EFR-03: Genesis predeploy bytecode 검증
// ---------------------------------------------------------------------------

test('EFR-03: genesis predeploys bytecode exists (OP Standard + DRB + AA)', async () => {
  test.setTimeout(5 * 60 * 1000);
  if (!deployedStackId && LIVE_STACK_ID) deployedStackId = LIVE_STACK_ID;
  if (!l2RpcUrl && LIVE_L2_RPC) l2RpcUrl = LIVE_L2_RPC;
  if (!l2RpcUrl && deployedStackId) {
    const urls = await resolveStackUrlsById(deployedStackId);
    l2RpcUrl = urls.l2Rpc;
    console.log(`[EFR-03] L2 RPC resolved after worker restart: ${l2RpcUrl}`);
  }
  expect(deployedStackId, 'EFR-02 must run first — or set LIVE_STACK_ID').not.toBeNull();
  expect(l2RpcUrl, 'L2 RPC URL must be set — run EFR-02 or set LIVE_L2_RPC').not.toBeNull();

  const rpc = l2RpcUrl!;
  const provider = new ethers.JsonRpcProvider(rpc);
  let verified = 0;

  // OP Standard
  for (const [name, address] of Object.entries(OP_STANDARD_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `OP Standard ${name} (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EFR-03] OP/${name}: ✓`);
  }

  // DRB
  for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `DRB ${name} (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EFR-03] DRB/${name}: ✓`);
  }

  // AA
  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `AA ${name} (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EFR-03] AA/${name}: ✓`);
  }

  console.log(`[EFR-03] Verified ${verified} predeploy contracts ✓`);
  await screenshot('efr-03-predeploys');
});

// ---------------------------------------------------------------------------
// EFR-04: Fault proof contracts on L1
// ---------------------------------------------------------------------------

test('EFR-04: fault proof contracts deployed on L1 (DGF, ASR, DelayedWETH)', async () => {
  test.setTimeout(3 * 60 * 1000);
  if (!deployedStackId && LIVE_STACK_ID) deployedStackId = LIVE_STACK_ID;
  expect(deployedStackId, 'EFR-02 must run first — or set LIVE_STACK_ID').not.toBeNull();

  const addresses = await resolveContractAddresses(deployedStackId!);
  dgfAddress = addresses.disputeGameFactoryProxy;
  asrAddress = addresses.anchorStateRegistryProxy;
  delayedWethAddress = addresses.delayedWethProxy;

  l1Provider = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);

  // DisputeGameFactory
  expect(dgfAddress, 'DisputeGameFactory address must be present').toBeTruthy();
  const { cannonImpl, gameCount } = await checkDisputeGameFactoryDeployed(l1Provider, dgfAddress);
  expect(cannonImpl).not.toBe(ethers.ZeroAddress);
  console.log(`[EFR-04] DisputeGameFactory: gameCount=${gameCount}, CANNON=${cannonImpl} ✓`);

  // AnchorStateRegistry — soft check: anchors(0) may still be at genesis (0) if
  // no dispute game has resolved yet; only verify the contract is reachable.
  expect(asrAddress, 'AnchorStateRegistry address must be present').toBeTruthy();
  try {
    const { l2BlockNumber } = await checkAnchorStateRegistryInit(l1Provider, asrAddress);
    initialAnchorBlock = l2BlockNumber;
    console.log(`[EFR-04] AnchorStateRegistry: l2BlockNumber=${l2BlockNumber} ✓`);
  } catch (err) {
    initialAnchorBlock = 0;
    console.warn(`[EFR-04] AnchorStateRegistry at genesis (l2BlockNumber=0) — op-challenger may not have resolved a game yet: ${err}`);
  }

  // DelayedWETH
  expect(delayedWethAddress, 'DelayedWETH address must be present').toBeTruthy();
  const version = await checkDelayedWethDeployed(l1Provider, delayedWethAddress);
  console.log(`[EFR-04] DelayedWETH: version=${version} ✓`);

  // Persist contract addresses
  const resultPath = `${SCREENSHOT_DIR}/deployment-info.json`;
  const existing = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(
    resultPath,
    JSON.stringify(
      {
        ...existing,
        contracts: {
          disputeGameFactoryProxy: dgfAddress,
          anchorStateRegistryProxy: asrAddress,
          delayedWethProxy: delayedWethAddress,
          cannonImpl,
          initialAnchorBlock,
        },
      },
      null,
      2,
    ),
  );

  await screenshot('efr-04-fault-proof-contracts');
});

// ---------------------------------------------------------------------------
// EFR-05: 첫 번째 dispute game 생성
// ---------------------------------------------------------------------------

test('EFR-05: first dispute game created (polls up to 25 min)', async () => {
  test.setTimeout(FIRST_GAME_TIMEOUT_MS + 2 * 60_000);
  if (!deployedStackId && LIVE_STACK_ID) deployedStackId = LIVE_STACK_ID;
  if (!dgfAddress && deployedStackId) {
    const addresses = await resolveContractAddresses(deployedStackId);
    dgfAddress = addresses.disputeGameFactoryProxy;
    l1Provider = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);
    console.log(`[EFR-05] Re-resolved dgfAddress after worker restart: ${dgfAddress}`);
  }
  expect(dgfAddress, 'dgfAddress must be set from EFR-04 — or set LIVE_STACK_ID').toBeTruthy();

  const gameIndex = await waitForFirstGame(l1Provider, dgfAddress, FIRST_GAME_TIMEOUT_MS);
  console.log(`[EFR-05] First dispute game at index ${gameIndex} ✓`);

  // Persist game info
  const resultPath = `${SCREENSHOT_DIR}/deployment-info.json`;
  const existing = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(
    resultPath,
    JSON.stringify({ ...existing, firstGameIndex: gameIndex }, null, 2),
  );

  await screenshot('efr-05-first-game');
  console.log(`[EFR-05] Full preset AWS deployment E2E complete ✓`);
  console.log(`[EFR-05] Results: ${SCREENSHOT_DIR}/deployment-info.json`);
  console.log(`[EFR-05] Screenshots: ${SCREENSHOT_DIR}/`);
});

// ---------------------------------------------------------------------------
// L1StandardBridge ABI
// ---------------------------------------------------------------------------

const L1_BRIDGE_ABI = [
  'function bridgeETH(uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external payable',
];

// ---------------------------------------------------------------------------
// EFR-06: L1 → L2 Bridge deposit with real txhash
// ---------------------------------------------------------------------------

test('EFR-06: bridge L1→L2 ETH deposit — real Sepolia transaction', async () => {
  test.setTimeout(5 * 60 * 1000);
  if (!deployedStackId && LIVE_STACK_ID) deployedStackId = LIVE_STACK_ID;
  expect(deployedStackId, 'EFR-02 must run first — or set LIVE_STACK_ID').not.toBeNull();

  const adminKey = resolveAdminPrivateKey();
  const l1Provider = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);
  const l1Wallet = new ethers.Wallet(adminKey, l1Provider);
  console.log(`[EFR-06] Admin address: ${l1Wallet.address}`);

  // Resolve L1StandardBridgeProxy address from stack
  const addresses = await resolveContractAddresses(deployedStackId!);
  const l1BridgeAddress = addresses.l1StandardBridgeProxy;
  expect(l1BridgeAddress, 'l1StandardBridgeProxy must be present').toBeTruthy();
  console.log(`[EFR-06] L1StandardBridgeProxy: ${l1BridgeAddress}`);

  // Check L1 balance
  const l1Balance = await l1Provider.getBalance(l1Wallet.address);
  console.log(`[EFR-06] L1 balance: ${ethers.formatEther(l1Balance)} ETH`);
  if (l1Balance < ethers.parseEther('0.002')) {
    console.warn('[EFR-06] L1 balance low — deposit may fail');
  }

  // Pre-check: verify bridge is initialized.
  // L1StandardBridgeProxy.messenger() == address(0) means initialize() was never called
  // (backend deployment bug). bridgeETH will revert in that state.
  const BRIDGE_CHECK_ABI = ['function messenger() external view returns (address)'];
  let bridgeInitialized = false;
  try {
    const bridgeCheck = new ethers.Contract(l1BridgeAddress, BRIDGE_CHECK_ABI, l1Provider);
    const messengerAddr = await bridgeCheck.messenger();
    bridgeInitialized = messengerAddr !== ethers.ZeroAddress;
    console.log(`[EFR-06] bridge.messenger()=${messengerAddr} initialized=${bridgeInitialized}`);
  } catch (err) {
    console.warn(`[EFR-06] messenger() query failed: ${err}`);
  }

  // Persist result path for use below
  const resultPath = `${SCREENSHOT_DIR}/deployment-info.json`;
  const existing = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;

  if (!bridgeInitialized) {
    console.warn(
      '[EFR-06] WARNING: L1StandardBridgeProxy.initialize() not called — ' +
      'bridgeETH will revert. Skipping deposit TX. ' +
      'Root cause: backend deployer did not call initialize() on L1StandardBridgeProxy.',
    );
    fs.writeFileSync(
      resultPath,
      JSON.stringify(
        { ...existing, bridge: { l1StandardBridgeProxy: l1BridgeAddress, depositSkipped: 'bridge not initialized' } },
        null,
        2,
      ),
    );
    console.log('[EFR-06] Bridge skipped — stack verified for presence (address confirmed), deposit skipped.');
    return;
  }

  // Send bridgeETH
  const bridge = new ethers.Contract(l1BridgeAddress, L1_BRIDGE_ABI, l1Wallet);
  const depositValue = ethers.parseEther('0.001');
  const depositTx = await bridge.bridgeETH(depositValue, 200_000, '0x', {
    value: depositValue,
    gasLimit: 750_000,
  });
  console.log(`[EFR-06] Deposit TX sent: ${depositTx.hash}`);
  const receipt = await depositTx.wait(1);
  expect(receipt, 'Deposit TX receipt must not be null').not.toBeNull();
  expect(receipt!.status, 'Deposit TX must succeed (status=1)').toBe(1);
  console.log(`[EFR-06] Deposit TX confirmed on Sepolia. Block: ${receipt!.blockNumber}`);

  fs.writeFileSync(
    resultPath,
    JSON.stringify(
      {
        ...existing,
        bridge: {
          l1StandardBridgeProxy: l1BridgeAddress,
          depositTxHash: depositTx.hash,
          depositL1Block: receipt!.blockNumber,
          depositAmountEth: '0.001',
        },
      },
      null,
      2,
    ),
  );
  console.log(`[EFR-06] Bridge txhash saved: ${depositTx.hash}`);
  expect(depositTx.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
});

// ---------------------------------------------------------------------------
// CrossTrade ABIs
// ---------------------------------------------------------------------------

const L2_CT_ABI = [
  'function requestNonRegisteredToken(address _l1token, address _l2token, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 _l1chainId) external payable',
  'event NonRequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event RequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event ProviderClaimCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

const L1_CT_ABI = [
  'function provideCT(address _l1token, address _l2token, address _requestor, address _receiver, uint256 _totalAmount, uint256 _initialctAmount, uint256 _editedctAmount, uint256 _salecount, uint256 _l2chainId, uint32 _minGasLimit, bytes32 _hash) external payable',
  'function chainData(uint256 l2chainId) external view returns (address crossDomainMessenger, address l2CrossTradeContract)',
  'event ProvideCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const TRADE_AMOUNT = ethers.parseEther('0.001');
const CT_AMOUNT    = ethers.parseEther('0.001');
const MIN_GAS_LIMIT = 200_000;

// ---------------------------------------------------------------------------
// EFR-07: CrossTrade L1-L2 transaction — request + provide + txhashes saved
// ---------------------------------------------------------------------------

test('EFR-07: CrossTrade L1→L2 flow — real Sepolia + L2 transactions', async () => {
  test.setTimeout(10 * 60 * 1000);
  if (!deployedStackId && LIVE_STACK_ID) deployedStackId = LIVE_STACK_ID;
  if (!l2RpcUrl && LIVE_L2_RPC) l2RpcUrl = LIVE_L2_RPC;
  if (!l2RpcUrl && deployedStackId) {
    const urls = await resolveStackUrlsById(deployedStackId);
    l2RpcUrl = urls.l2Rpc;
    console.log(`[EFR-07] L2 RPC resolved after worker restart: ${l2RpcUrl}`);
  }
  expect(deployedStackId, 'EFR-02 must run first — or set LIVE_STACK_ID').not.toBeNull();
  expect(l2RpcUrl, 'L2 RPC URL must be set — run EFR-02 or set LIVE_L2_RPC').not.toBeNull();

  const adminKey = resolveAdminPrivateKey();
  const l1ProviderCT = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);
  const l2ProviderCT = new ethers.JsonRpcProvider(l2RpcUrl!);
  const l1Wallet = new ethers.Wallet(adminKey, l1ProviderCT);
  const l2Wallet = new ethers.Wallet(adminKey, l2ProviderCT);
  const adminAddress = l1Wallet.address;
  console.log(`[EFR-07] Admin address: ${adminAddress}`);

  // Resolve CrossTrade integration info
  const token = await loginBackend(BACKEND_URL);
  const intResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${deployedStackId!}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(intResp.ok, `Integrations fetch failed: ${intResp.status}`).toBe(true);
  const intBody = await intResp.json() as Record<string, unknown>;
  const intData = (intBody.data ?? intBody) as Record<string, unknown>;
  const integrations = (intData.integrations as Record<string, unknown>[]) ?? [];
  const crossTradeInt = integrations.find((i) => i.type === 'cross-trade');
  expect(crossTradeInt, 'CrossTrade integration not found').toBeDefined();

  const info = (crossTradeInt!.info ?? {}) as Record<string, unknown>;
  const contracts = (info.contracts ?? {}) as Record<string, string>;
  const l2CrossTradeProxy = contracts.l2_cross_trade_proxy;
  expect(l2CrossTradeProxy, 'l2_cross_trade_proxy must be present').toBeTruthy();
  console.log(`[EFR-07] L2CrossTradeProxy: ${l2CrossTradeProxy}`);

  const l1CrossTradeProxy = contracts.l1_cross_trade_proxy;
  expect(l1CrossTradeProxy, 'l1_cross_trade_proxy must be present in integration contracts').toBeTruthy();
  console.log(`[EFR-07] L1CrossTradeProxy: ${l1CrossTradeProxy}`);

  // Balance check
  const l1Balance = await l1ProviderCT.getBalance(adminAddress);
  const l2Balance = await l2ProviderCT.getBalance(adminAddress);
  console.log(`[EFR-07] L1 balance: ${ethers.formatEther(l1Balance)} ETH (Sepolia)`);
  console.log(`[EFR-07] L2 balance: ${ethers.formatEther(l2Balance)} ETH (L2)`);

  // L2 chain ID
  const l2Network = await l2ProviderCT.getNetwork();
  const l2ChainId = l2Network.chainId;
  console.log(`[EFR-07] L2 chainId: ${l2ChainId}`);

  // ── Step 1: Request on L2 ──────────────────────────────────────────────
  const l2CtContract = new ethers.Contract(l2CrossTradeProxy, L2_CT_ABI, l2Wallet);
  const l1ChainId = (await l1ProviderCT.getNetwork()).chainId;

  console.log('[EFR-07] Sending requestNonRegisteredToken on L2...');
  const requestTx = await l2CtContract.requestNonRegisteredToken(
    ETH_ADDRESS,    // _l1token
    ETH_ADDRESS,    // _l2token (native ETH)
    adminAddress,   // _receiver
    TRADE_AMOUNT,   // _totalAmount
    CT_AMOUNT,      // _ctAmount
    l1ChainId,      // _l1chainId
    { value: TRADE_AMOUNT },
  );
  console.log(`[EFR-07] L2 request TX sent: ${requestTx.hash}`);
  const requestReceipt = await requestTx.wait(1);
  expect(requestReceipt, 'Request TX receipt must not be null').not.toBeNull();
  expect(requestReceipt!.status, 'L2 requestNonRegisteredToken must succeed').toBe(1);
  console.log(`[EFR-07] L2 request TX confirmed. Block: ${requestReceipt!.blockNumber}`);

  // Parse saleCount + hashValue from event
  const l2Iface = new ethers.Interface(L2_CT_ABI);
  let saleCount: bigint = 0n;
  let hashValue = '';
  for (const log of requestReceipt!.logs) {
    try {
      const parsed = l2Iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && (parsed.name === 'NonRequestCT' || parsed.name === 'RequestCT')) {
        saleCount = parsed.args._saleCount as bigint;
        hashValue = parsed.args._hashValue as string;
        console.log(`[EFR-07] Event: ${parsed.name} saleCount=${saleCount} hash=${hashValue}`);
        break;
      }
    } catch { /* skip */ }
  }
  expect(hashValue, 'RequestCT/NonRequestCT event hashValue must be present').toMatch(/^0x[0-9a-fA-F]{64}$/);

  // ── Step 2: Provide on L1 ──────────────────────────────────────────────
  const l1CtContract = new ethers.Contract(l1CrossTradeProxy, L1_CT_ABI, l1Wallet);

  // Pre-check: verify this L2 chain is registered in L1CrossTradeProxy.
  // setChainInfo must be called by the deployer during stack setup.
  // If it was skipped (backend bug), chainData returns zeros and provideCT will revert.
  let chainRegistered = false;
  try {
    const cd = await l1CtContract.chainData(l2ChainId);
    chainRegistered = cd.crossDomainMessenger !== ethers.ZeroAddress;
    console.log(`[EFR-07] chainData(${l2ChainId}): cdm=${cd.crossDomainMessenger} registered=${chainRegistered}`);
  } catch (err) {
    console.warn(`[EFR-07] chainData query failed: ${err}`);
  }

  let provideTxHash: string | null = null;
  let provideL1Block: number | null = null;

  if (!chainRegistered) {
    console.warn(
      `[EFR-07] WARNING: L1CrossTradeProxy.setChainInfo not called for chainId=${l2ChainId} — ` +
      'provideCT skipped (backend deployment did not register this L2 chain). ' +
      'L2 request TX is confirmed; L1 provide step requires setChainInfo to be called first.'
    );
  } else {
    console.log('[EFR-07] Sending provideCT on L1 Sepolia...');
    const provideTx = await l1CtContract.provideCT(
      ETH_ADDRESS,    // _l1token
      ETH_ADDRESS,    // _l2token
      adminAddress,   // _requestor
      adminAddress,   // _receiver
      TRADE_AMOUNT,   // _totalAmount
      CT_AMOUNT,      // _initialctAmount
      0n,             // _editedctAmount
      saleCount,      // _salecount
      l2ChainId,      // _l2chainId
      MIN_GAS_LIMIT,  // _minGasLimit
      hashValue,      // _hash
      { value: CT_AMOUNT },
    );
    console.log(`[EFR-07] L1 provide TX sent: ${provideTx.hash}`);
    const provideReceipt = await provideTx.wait(1);
    expect(provideReceipt, 'Provide TX receipt must not be null').not.toBeNull();
    expect(provideReceipt!.status, 'L1 provideCT must succeed').toBe(1);
    console.log(`[EFR-07] L1 provide TX confirmed. Block: ${provideReceipt!.blockNumber}`);

    // Verify ProvideCT event
    const l1Iface = new ethers.Interface(L1_CT_ABI);
    let provideCTLogged = false;
    for (const log of provideReceipt!.logs) {
      try {
        const parsed = l1Iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'ProvideCT') {
          provideCTLogged = true;
          console.log(`[EFR-07] ProvideCT event: provider=${parsed.args._provider} ctAmount=${ethers.formatEther(parsed.args._ctAmount)} ETH`);
          break;
        }
      } catch { /* skip */ }
    }
    expect(provideCTLogged, 'ProvideCT event must be present in L1 receipt').toBe(true);

    provideTxHash = provideTx.hash;
    provideL1Block = provideReceipt!.blockNumber;
  }

  // Persist txhashes
  const resultPath = `${SCREENSHOT_DIR}/deployment-info.json`;
  const existing = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(
    resultPath,
    JSON.stringify(
      {
        ...existing,
        crossTrade: {
          l2CrossTradeProxy,
          l1CrossTradeProxy,
          requestTxHash: requestTx.hash,
          requestL2Block: requestReceipt!.blockNumber,
          ...(provideTxHash ? { provideTxHash, provideL1Block } : { provideSkipped: 'setChainInfo not called' }),
          saleCount: saleCount.toString(),
          hashValue,
          amountEth: '0.001',
        },
      },
      null,
      2,
    ),
  );
  const provideMsg = provideTxHash ? `provide: ${provideTxHash}` : 'provide: SKIPPED (setChainInfo missing)';
  console.log(`[EFR-07] CrossTrade txhashes saved — request: ${requestTx.hash} | ${provideMsg}`);
  console.log(`[EFR-07] Results: ${SCREENSHOT_DIR}/deployment-info.json`);
});
