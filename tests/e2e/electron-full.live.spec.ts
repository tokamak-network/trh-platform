/**
 * Electron E2E — Full Suite Preset L2 Deployment (Spec F)
 *
 * Launches the built Electron app and verifies a Full Suite preset deployment
 * with USDC as the fee token. Full preset specifics:
 *   - All 6 modules: bridge, blockExplorer, monitoring, uptimeService, crossTrade, drb
 *   - USDC fee token → AA paymaster + bundler required
 *   - Genesis predeploys: OP Standard 13 + DeFi 5 + Gaming 7 = 25 total
 *   - batchSubmissionFrequency = 600s
 *
 * Test IDs:
 *   EFL-01 — Electron 앱 실행 및 Full preset 배포 시작
 *   EFL-02 — 배포 완료 대기 및 6개 모듈 모두 존재 확인
 *   EFL-03 — Genesis predeploy 검증 (OP Standard + DRB + AA 총 20개 주소 확인)
 *   EFL-04 — CrossTrade dApp (localhost:3004) + AA bundler 모두 reachable
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-full.live.spec.ts
 *
 * Prerequisites:
 *   - Docker running (make up)
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 *   - Optional: LIVE_STACK_ID to reuse existing deployed stack
 *
 * Note on DeFi predeploys (PP-03 subset):
 *   DEFI_ADDRESSES in helpers/presets.ts is currently empty because Uniswap
 *   contract addresses are deployment-specific and not yet confirmed from genesis
 *   config. EFL-03 skips DeFi address bytecode checks until addresses are known.
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication, chromium } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrls } from './helpers/stack-resolver';
import { deployPreset, waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { pollUntil } from './helpers/poll';
import {
  OP_STANDARD_ADDRESSES,
  DRB_ADDRESSES,
  AA_ADDRESSES,
  DEFI_ADDRESSES,
  EXPECTED_PREDEPLOY_COUNT,
  assertIntegrationModules,
  getPresetData,
} from './helpers/presets';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'full' as const;
const FEE_TOKEN = 'USDC' as const;
const CHAIN_NAME = 'ect-full-usdc';
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const CROSSTRADE_DAPP_URL = 'http://localhost:3004';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;

const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000; // 40 min (full is the heaviest)
const CROSSTRADE_INSTALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const CROSSTRADE_POLL_INTERVAL_MS = 15_000;
const BUNDLER_POLL_TIMEOUT_MS = 3 * 60 * 1000;
const BUNDLER_POLL_INTERVAL_MS = 10_000;

// All 6 modules expected for Full preset
const EXPECTED_MODULES = [
  'bridge',
  'blockExplorer',
  'monitoring',
  'systemPulse',
  'crossTrade',
  'drb',
] as const;

const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-full';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;
let deployedStackId: string | null = null;
let l2RpcUrl: string | null = null;
let bundlerUrl: string | null = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('[efl] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[efl] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  console.log('[efl] Main window URL:', mainWindow.url());

  // Screenshot: app launched state (before deployment)
  const screenshotPath = `${SCREENSHOT_DIR}/efl-00-app-launched.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[efl] App launch screenshot saved: ${screenshotPath}`);
});

test.afterAll(async () => {
  if (electronApp) {
    console.log('[efl] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// EFL-01: Full preset 배포 시작
// ---------------------------------------------------------------------------

test('EFL-01: start Full Suite preset (USDC) deployment via backend API', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];
  await mainWindow.waitForLoadState('domcontentloaded');
  console.log('[EFL-01] Main window DOM ready');

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EFL-01] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();
    return;
  }

  // Wait for Electron-launched backend to become ready (Docker auto-start takes time)
  await waitForBackendReady(5 * 60 * 1000);

  console.log('[EFL-01] Initiating Full Suite preset deployment via API...');
  const result = await deployPreset({
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
  });

  deployedStackId = result.stackId;
  console.log(`[EFL-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();
  expect(result.deploymentId).toBeTruthy();

  // Screenshot: deployment initiated state
  const screenshotPath = `${SCREENSHOT_DIR}/efl-01-deployment-initiated.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFL-01] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EFL-02: 배포 완료 + 6개 모듈 전체 검증
// ---------------------------------------------------------------------------

test('EFL-02: deployment complete — all 6 modules present including crossTrade and drb', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + CROSSTRADE_INSTALL_TIMEOUT_MS);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EFL-02] Waiting for stack ${stackId} to reach Deployed...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');
  console.log(`[EFL-02] Stack deployed, waiting for CrossTrade to install...`);

  const token = await loginBackend(BACKEND_URL);

  // Poll until CrossTrade integration completes (it installs async post-deploy)
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
      console.log(`[EFL-02] CrossTrade status: ${status}`);
      if (status === 'installed' || status === 'Completed') return ct;
      if (status === 'Failed') throw new Error('CrossTrade integration Failed');
      return null;
    },
    'CrossTrade integration to complete',
    CROSSTRADE_INSTALL_TIMEOUT_MS,
    CROSSTRADE_POLL_INTERVAL_MS,
  );

  // Fetch all integrations and verify all 6 expected modules
  const integrationsResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await integrationsResp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];
  const integrationTypes = integrations.map((i) => i.type as string);

  console.log(`[EFL-02] Integration types: ${integrationTypes.join(', ')}`);

  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, [], 'EFL-02');
  console.log('[EFL-02] All 6 modules verified ✓');

  // Resolve stack URLs for subsequent tests
  try {
    const stackUrls = await resolveStackUrls(CHAIN_NAME);
    l2RpcUrl = stackUrls.l2Rpc;
    bundlerUrl = stackUrls.bundlerUrl;
    console.log(`[EFL-02] L2 RPC: ${l2RpcUrl}, Bundler: ${bundlerUrl}`);
  } catch (err) {
    console.warn('[EFL-02] Could not resolve stack URLs, falling back to defaults:', err);
    l2RpcUrl = 'http://localhost:8545';
    bundlerUrl = 'http://localhost:4337';
  }

  // Screenshot
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efl-02-full-deployed.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFL-02] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EFL-03: Genesis predeploy bytecode 검증
// OP Standard 11 + DRB 3 + AA 4 = 18 confirmed addresses
// DeFi 5: skipped until DEFI_ADDRESSES populated
// ---------------------------------------------------------------------------

test('EFL-03: genesis predeploys bytecode exists (OP Standard + DRB + AA)', async () => {
  test.setTimeout(3 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const rpc = l2RpcUrl ?? 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);

  let verified = 0;

  // OP Standard (11 confirmed addresses)
  for (const [name, address] of Object.entries(OP_STANDARD_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `OP Standard ${name} (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EFL-03] OP/${name}: ✓`);
  }

  // DRB (3 addresses)
  for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `DRB ${name} (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EFL-03] DRB/${name}: ✓`);
  }

  // AA (4 addresses)
  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `AA ${name} (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EFL-03] AA/${name}: ✓`);
  }

  // DeFi — check if addresses are known
  const defiEntries = Object.entries(DEFI_ADDRESSES);
  if (defiEntries.length > 0) {
    for (const [name, address] of defiEntries) {
      const code = await provider.getCode(address);
      expect(code, `DeFi ${name} (${address}) must have bytecode`).not.toBe('0x');
      verified++;
      console.log(`[EFL-03] DeFi/${name}: ✓`);
    }
  } else {
    console.warn(
      '[EFL-03] DeFi predeploy addresses not confirmed — Uniswap/USDCBridge/WETH checks skipped. ' +
      'Populate helpers/presets.ts#DEFI_ADDRESSES to enable full 25-contract verification.',
    );
  }

  console.log(`[EFL-03] Verified ${verified} predeploy contracts ✓`);

  // Screenshot: predeploy bytecode verified state
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efl-03-predeploys-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFL-03] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EFL-04: CrossTrade dApp + AA bundler reachable
// ---------------------------------------------------------------------------

test('EFL-04: CrossTrade dApp reachable, L2 contracts present, AA bundler alive', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  const token = await loginBackend(BACKEND_URL);

  // 1. CrossTrade dApp (localhost:3004)
  console.log(`[EFL-04] Probing CrossTrade dApp at ${CROSSTRADE_DAPP_URL}...`);
  const ctResp = await fetch(CROSSTRADE_DAPP_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  expect(
    ctResp.status,
    `CrossTrade dApp must respond with HTTP < 500, got ${ctResp.status}`,
  ).toBeLessThan(500);
  console.log(`[EFL-04] CrossTrade dApp: HTTP ${ctResp.status} ✓`);

  // 2. Verify CrossTrade L2 contract addresses in integration info
  const integrationsResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(integrationsResp.ok).toBe(true);
  const intBody = await integrationsResp.json() as Record<string, unknown>;
  const intData = (intBody.data ?? intBody) as Record<string, unknown>;
  const integrations = (intData.integrations as Record<string, unknown>[]) ?? [];
  const crossTrade = integrations.find(
    (i) => (i.type as string).toLowerCase().replace(/[-_]/g, '') === 'crosstrade',
  );
  expect(crossTrade, 'CrossTrade integration must exist').toBeDefined();

  const info = ((crossTrade?.info ?? {}) as Record<string, unknown>);
  const contracts = ((info.contracts ?? {}) as Record<string, unknown>);
  console.log('[EFL-04] CrossTrade contracts:', JSON.stringify(contracts, null, 2));

  const expectedContracts = [
    'l2_cross_trade',
    'l2_cross_trade_proxy',
    'l2_to_l2_cross_trade_l2',
    'l2_to_l2_cross_trade_proxy',
  ];
  for (const contractName of expectedContracts) {
    const address = contracts[contractName] as string | undefined;
    expect(address, `Expected ${contractName} address to be present`).toBeTruthy();
    expect(address, `Expected ${contractName} to be a valid address`).toMatch(/^0x[0-9a-fA-F]{40}$/);
    console.log(`[EFL-04] ${contractName}: ${address} ✓`);
  }

  // 3. AA bundler
  const bUrl = bundlerUrl ?? 'http://localhost:4337';
  console.log(`[EFL-04] Probing AA bundler at ${bUrl}...`);

  const bundlerResult = await pollUntil<string[]>(
    async () => {
      try {
        const resp = await fetch(bUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_supportedEntryPoints',
            params: [],
            id: 1,
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!resp.ok) return null;
        const json = await resp.json() as { result?: string[] };
        return json.result && json.result.length > 0 ? json.result : null;
      } catch {
        return null;
      }
    },
    'bundler eth_supportedEntryPoints',
    BUNDLER_POLL_TIMEOUT_MS,
    BUNDLER_POLL_INTERVAL_MS,
  );

  expect(bundlerResult, 'AA bundler must return supported EntryPoints').toBeDefined();
  expect(bundlerResult!.map((a) => a.toLowerCase())).toContain(
    AA_ADDRESSES.EntryPoint.toLowerCase(),
  );
  console.log(`[EFL-04] AA bundler: EntryPoints=${bundlerResult!.join(', ')} ✓`);

  // 4. Chromium screenshot of CrossTrade dApp
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(CROSSTRADE_DAPP_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    const dappScreenshot = `${SCREENSHOT_DIR}/efl-04-crosstrade-dapp.png`;
    await page.screenshot({ path: dappScreenshot, fullPage: true });
    console.log(`[EFL-04] CrossTrade dApp screenshot saved: ${dappScreenshot}`);
  } finally {
    await browser.close();
  }

  console.log('[EFL-04] CrossTrade dApp, L2 contracts, and AA bundler all confirmed ✓');

  // Screenshot: main window final verified state
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efl-04-services-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFL-04] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EFL-05: Chain params + overridableFields + predeploy count 계약 검증
// ---------------------------------------------------------------------------

test('EFL-05: chain params and overridable fields match Full Suite preset contract', async () => {
  test.setTimeout(2 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  // 1. Fixture sanity: predeploy count
  const presetData = getPresetData(PRESET);
  expect(
    presetData.genesisPredeploys.length,
    `Full preset genesisPredeploys fixture must have ${EXPECTED_PREDEPLOY_COUNT[PRESET]} entries`,
  ).toBe(EXPECTED_PREDEPLOY_COUNT[PRESET]);
  console.log(`[EFL-05] genesisPredeploys count: ${presetData.genesisPredeploys.length} ✓`);

  // 2. overridableFields from fixture
  const expectedFields = ['l2BlockTime', 'batchSubmissionFrequency', 'outputRootFrequency', 'backupEnabled'];
  expect(
    [...presetData.overridableFields].sort(),
    'overridableFields must match expected 4 fields',
  ).toEqual(expectedFields.sort());
  console.log(`[EFL-05] overridableFields: ${presetData.overridableFields.join(', ')} ✓`);

  // 3. Chain params from API vs fixture defaults
  const token = await loginBackend(BACKEND_URL);
  const stackResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${deployedStackId!}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(stackResp.ok, 'Stack detail API must respond OK').toBe(true);
  const stackBody = await stackResp.json() as Record<string, unknown>;
  const stackData = (stackBody.data ?? stackBody) as Record<string, unknown>;

  const batch = (stackData.batchSubmissionFrequency ?? stackData.batch_submission_frequency) as number;
  const output = (stackData.outputRootFrequency ?? stackData.output_root_frequency) as number;
  const backup = (stackData.backupEnabled ?? stackData.backup_enabled) as boolean;
  const challenge = (stackData.challengePeriod ?? stackData.challenge_period) as number;

  const { chainDefaults } = presetData;
  expect(batch, `batchSubmissionFrequency must be ${chainDefaults.batchSubmissionFrequency}`).toBe(chainDefaults.batchSubmissionFrequency);
  expect(output, `outputRootFrequency must be ${chainDefaults.outputRootFrequency}`).toBe(chainDefaults.outputRootFrequency);
  expect(backup, `backupEnabled must be ${chainDefaults.backupEnabled}`).toBe(chainDefaults.backupEnabled);
  expect(challenge, `challengePeriod must be ${chainDefaults.challengePeriod}`).toBe(chainDefaults.challengePeriod);
  console.log(`[EFL-05] Chain params: batch=${batch}, output=${output}, backup=${backup}, challenge=${challenge} ✓`);

  // Screenshot
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/efl-05-chain-params-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EFL-05] Screenshot saved: ${screenshotPath}`);
});
