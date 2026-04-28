/**
 * Electron E2E — Full Suite Preset L2 Deployment via AWS (Spec FA)
 *
 * Launches the built Electron app and deploys a Full Suite preset to AWS EKS
 * via the UI wizard. Extends the local Full Suite spec (EFL) with fault proof
 * and op-challenger K8s verification.
 *
 * Full preset AWS specifics:
 *   - infraProvider: aws (EKS Kubernetes deployment)
 *   - FaultProofEnabled: true → DisputeGameFactory + op-challenger
 *   - challengePeriod: 12s (testnet) → games resolve quickly
 *   - outputRootFrequency: 600s → ~10 min for first game
 *
 * Test IDs:
 *   EFA-01 — Electron 앱 실행 및 AWS Full preset UI 위저드로 배포 시작
 *   EFA-02 — 배포 완료 대기 및 6개 모듈 모두 존재 확인
 *   EFA-03 — Genesis predeploy bytecode 검증 (OP Standard + DRB + AA)
 *   EFA-04 — Fault proof contract 배포 검증 (DGF, ASR, DelayedWETH)
 *   EFA-05 — op-challenger K8s pod Running 확인
 *   EFA-06 — 첫 번째 dispute game 생성 확인 (최대 25분 대기)
 *   EFA-07 — Game DEFENDER_WINS 해소 + AnchorStateRegistry 업데이트 확인
 *
 * Usage:
 *   npm run build && \
 *   E2E_AWS_ACCESS_KEY=<key> E2E_AWS_SECRET_KEY=<secret> \
 *   LIVE_CLUSTER_NAME=<cluster> \
 *   npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-full-aws.live.spec.ts
 *
 * Skip re-deployment with:
 *   LIVE_STACK_ID=<uuid> LIVE_L2_RPC=<url> [...above...]
 *
 * Prerequisites:
 *   - Docker running (Electron auto-starts backend)
 *   - E2E_AWS_ACCESS_KEY, E2E_AWS_SECRET_KEY set (never commit)
 *   - LIVE_L1_RPC_URL set (Sepolia)
 *   - LIVE_CLUSTER_NAME set (EKS cluster name for K8s checks)
 *   - aws CLI + kubectl installed (for K8s checks)
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication, chromium } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrls, resolveContractAddresses } from './helpers/stack-resolver';
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
  checkOpChallengerK8s,
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
const CHAIN_NAME = 'efa-full-usdc';
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;
const LIVE_L1_RPC_URL = process.env.LIVE_L1_RPC_URL ?? 'https://eth-sepolia.g.alchemy.com/v2/x4EOshikyKeyJci-23VSqFnwKIddeS7f';
const LIVE_CLUSTER_NAME = process.env.LIVE_CLUSTER_NAME ?? '';
const E2E_AWS_REGION = process.env.E2E_AWS_REGION ?? 'ap-northeast-2';

const DEPLOY_TIMEOUT_MS = 50 * 60 * 1000; // 50 min (AWS EKS + fault proof setup)
const CROSSTRADE_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const CROSSTRADE_POLL_INTERVAL_MS = 15_000;
const FIRST_GAME_TIMEOUT_MS = 25 * 60 * 1000; // 25 min (outputRootFrequency 600s + buffer)
const GAME_RESOLVE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min (challengePeriod 12s)

const EXPECTED_MODULES = [
  'bridge',
  'blockExplorer',
  'monitoring',
  'systemPulse',
  'crossTrade',
  'drb',
] as const;

const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-full-aws';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;
let platformBrowser: import('playwright').Browser | null = null;
let deployedStackId: string | null = null;
let l2RpcUrl: string | null = null;
let l1Provider: ethers.JsonRpcProvider;
let dgfAddress: string;
let asrAddress: string;
let delayedWethAddress: string;
let initialAnchorBlock: number;
let firstGameIndex: number;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('[efa] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[efa] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efa-00-app-launched.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[efa] App launch screenshot: ${screenshotPath}`);
});

test.afterAll(async () => {
  if (platformBrowser) {
    await platformBrowser.close();
    platformBrowser = null;
  }
  if (electronApp) {
    console.log('[efa] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
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
// EFA-01: AWS Full preset 배포 시작
// ---------------------------------------------------------------------------

test('EFA-01: start Full Suite preset (USDC) deployment via AWS wizard', async () => {
  test.setTimeout(10 * 60 * 1000);
  expect(electronApp).not.toBeNull();

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EFA-01] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();
    return;
  }

  // Verify AWS credentials available
  const accessKey = process.env.E2E_AWS_ACCESS_KEY;
  const secretKey = process.env.E2E_AWS_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      'E2E_AWS_ACCESS_KEY and E2E_AWS_SECRET_KEY must be set for EFA tests'
    );
  }

  await waitForBackendReady(5 * 60 * 1000);

  console.log('[EFA-01] Deploying Full Suite preset via AWS UI wizard...');
  const platformView = await openPlatformPage();

  await deployPresetViaUI(platformView, {
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
    infraProvider: 'aws',
    awsAccessKey: accessKey,
    awsSecretKey: secretKey,
    awsRegion: E2E_AWS_REGION,
  });

  deployedStackId = await resolveStackIdByChainName(CHAIN_NAME, BACKEND_URL, 60_000);
  console.log(`[EFA-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();

  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efa-01-deployment-initiated.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFA-01] Screenshot: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EFA-02: 배포 완료 + 6개 모듈 확인
// ---------------------------------------------------------------------------

test('EFA-02: deployment complete — all 6 modules present', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + CROSSTRADE_INSTALL_TIMEOUT_MS);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EFA-02] Waiting for stack ${stackId} to reach Deployed...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');

  const token = await loginBackend(BACKEND_URL);

  // Wait for CrossTrade integration to complete
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
      console.log(`[EFA-02] CrossTrade status: ${status}`);
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

  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, [], 'EFA-02');
  console.log('[EFA-02] All 6 modules verified ✓');

  // Resolve L2 RPC URL for subsequent tests
  try {
    const stackUrls = await resolveStackUrls(CHAIN_NAME);
    l2RpcUrl = stackUrls.l2Rpc;
    console.log(`[EFA-02] L2 RPC: ${l2RpcUrl}`);
  } catch {
    console.warn('[EFA-02] Could not resolve L2 RPC URL — will use stack metadata fallback');
  }

  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efa-02-deployed.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFA-02] Screenshot: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EFA-03: Genesis predeploy bytecode 검증
// ---------------------------------------------------------------------------

test('EFA-03: genesis predeploys bytecode exists (OP Standard + DRB + AA)', async () => {
  test.setTimeout(3 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const rpc = l2RpcUrl ?? 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);
  let verified = 0;

  for (const [name, address] of Object.entries(OP_STANDARD_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `OP Standard ${name} (${address}) must have bytecode`).not.toBe('0x');
    verified++;
    console.log(`[EFA-03] OP/${name}: ✓`);
  }

  for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `DRB ${name} (${address}) must have bytecode`).not.toBe('0x');
    verified++;
    console.log(`[EFA-03] DRB/${name}: ✓`);
  }

  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `AA ${name} (${address}) must have bytecode`).not.toBe('0x');
    verified++;
    console.log(`[EFA-03] AA/${name}: ✓`);
  }

  console.log(`[EFA-03] ${verified} predeploy contracts verified ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efa-03-predeploys.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFA-04: Fault proof contracts 배포 검증
// ---------------------------------------------------------------------------

test('EFA-04: fault proof contracts deployed (DGF, ASR, DelayedWETH)', async () => {
  test.setTimeout(2 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const addresses = await resolveContractAddresses(deployedStackId!);
  dgfAddress = addresses.disputeGameFactoryProxy;
  asrAddress = addresses.anchorStateRegistryProxy;
  delayedWethAddress = addresses.delayedWethProxy;

  l1Provider = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);

  // DisputeGameFactory
  expect(dgfAddress, 'DisputeGameFactory address must be in deployment JSON').toBeTruthy();
  const { cannonImpl, gameCount } = await checkDisputeGameFactoryDeployed(l1Provider, dgfAddress);
  expect(cannonImpl).not.toBe(ethers.ZeroAddress);
  console.log(`[EFA-04] DisputeGameFactory: gameCount=${gameCount}, CANNON=${cannonImpl} ✓`);

  // AnchorStateRegistry
  expect(asrAddress, 'AnchorStateRegistry address must be in deployment JSON').toBeTruthy();
  const { l2BlockNumber } = await checkAnchorStateRegistryInit(l1Provider, asrAddress);
  initialAnchorBlock = l2BlockNumber;
  expect(l2BlockNumber).toBeGreaterThan(0);
  console.log(`[EFA-04] AnchorStateRegistry: l2BlockNumber=${l2BlockNumber} ✓`);

  // DelayedWETH
  expect(delayedWethAddress, 'DelayedWETH address must be in deployment JSON').toBeTruthy();
  const version = await checkDelayedWethDeployed(l1Provider, delayedWethAddress);
  console.log(`[EFA-04] DelayedWETH: version=${version} ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efa-04-fp-contracts.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFA-05: op-challenger K8s pod Running
// ---------------------------------------------------------------------------

test('EFA-05: op-challenger pod Running in EKS', async () => {
  test.setTimeout(60_000);

  if (!LIVE_CLUSTER_NAME) {
    console.warn('[EFA-05] LIVE_CLUSTER_NAME not set — skipping K8s check');
    test.skip();
    return;
  }

  const result = checkOpChallengerK8s(LIVE_CLUSTER_NAME, 'default', E2E_AWS_REGION);
  expect(result.running, `op-challenger pod must be Running, got "${result.status}"`).toBe(true);
  console.log(`[EFA-05] op-challenger: pod=${result.podName}, status=${result.status} ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efa-05-op-challenger.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFA-06: 첫 번째 dispute game 생성
// ---------------------------------------------------------------------------

test('EFA-06: first dispute game created (polls up to 25 min)', async () => {
  test.setTimeout(FIRST_GAME_TIMEOUT_MS + 60_000);

  expect(dgfAddress, 'dgfAddress must be set from EFA-04').toBeTruthy();

  firstGameIndex = await waitForFirstGame(l1Provider, dgfAddress, FIRST_GAME_TIMEOUT_MS);
  console.log(`[EFA-06] First dispute game at index ${firstGameIndex} ✓`);

  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/efa-06-first-game.png`, fullPage: false });
});

// ---------------------------------------------------------------------------
// EFA-07: DEFENDER_WINS + AnchorStateRegistry 업데이트
// ---------------------------------------------------------------------------

test('EFA-07: game resolves DEFENDER_WINS, AnchorStateRegistry anchors updated', async () => {
  test.setTimeout(GAME_RESOLVE_TIMEOUT_MS + 2 * 60_000);

  expect(dgfAddress, 'dgfAddress must be set from EFA-04').toBeTruthy();
  expect(asrAddress, 'asrAddress must be set from EFA-04').toBeTruthy();

  // Wait for DEFENDER_WINS resolution
  const { gameAddress, status } = await waitForGameResolution(
    l1Provider,
    dgfAddress,
    firstGameIndex,
    GAME_RESOLVE_TIMEOUT_MS,
  );
  expect(status).toBe(GameStatus.DEFENDER_WINS);
  console.log(`[EFA-07] Game ${gameAddress} resolved: DEFENDER_WINS ✓`);

  // Verify AnchorStateRegistry updated
  const { root, l2BlockNumber } = await checkAnchorStateUpdated(
    l1Provider,
    asrAddress,
    initialAnchorBlock,
  );
  expect(l2BlockNumber).toBeGreaterThan(initialAnchorBlock);
  console.log(
    `[EFA-07] AnchorStateRegistry updated: l2BlockNumber=${l2BlockNumber} > ${initialAnchorBlock}, root=${root} ✓`
  );

  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efa-07-fp-complete.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFA-07] Fault proof E2E complete ✓ Screenshot: ${screenshotPath}`);
});
