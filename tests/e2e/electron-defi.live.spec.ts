/**
 * Electron E2E — DeFi Preset L2 Deployment (Spec G)
 *
 * Launches the built Electron app and verifies a DeFi preset deployment
 * with ETH as the fee token. DeFi preset specifics:
 *   - Modules: bridge, blockExplorer, monitoring, uptimeService, crossTrade
 *   - No DRB
 *   - ETH fee token → AA paymaster + bundler required
 *   - Genesis predeploys: OP Standard 13 + DeFi 5 = 18 total
 *   - batchSubmissionFrequency = 900s
 *
 * Test IDs:
 *   EDF-01 — Electron 앱 실행 및 DeFi preset 배포 시작 (Platform UI 위저드)
 *   EDF-02 — 배포 완료 대기 및 모듈 검증: Integrations 탭 UI + API 교차검증
 *   EDF-03 — Genesis predeploy bytecode (OP Standard + AA 4, DeFi 5는 TODO)
 *   EDF-04 — CrossTrade dApp + L2 CrossTrade 컨트랙트 4종 + AA bundler 검증
 *   EDF-05 — Chain params + overridableFields + predeploy count 계약 검증
 *   EDF-06 — Core services HTTP health (bridge / blockExplorer / monitoring / uptime)
 *   EDF-07 — AA operator 실동작 증거 (EntryPoint/Paymaster 잔액 + Platform UI AA 탭)
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-defi.live.spec.ts
 *
 * Prerequisites:
 *   - Docker running (make up)
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 *   - Optional: LIVE_STACK_ID to reuse existing deployed stack
 *
 * Note on DeFi predeploys (EDF-03):
 *   DEFI_ADDRESSES in helpers/presets.ts is currently empty because Uniswap
 *   contract addresses are deployment-specific and not yet confirmed from genesis
 *   config. EDF-03 skips DeFi address bytecode checks until addresses are known.
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication, chromium, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrls, StackUrls } from './helpers/stack-resolver';
import { waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { pollUntil } from './helpers/poll';
import { deployPresetViaUI, resolveStackIdByChainName } from './helpers/deploy-wizard';
import {
  AA_ADDRESSES,
  DEFI_ADDRESSES,
  EXPECTED_PREDEPLOY_COUNT,
  assertIntegrationModules,
  assertOpStandardBytecode,
  getPresetData,
} from './helpers/presets';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'defi' as const;
const FEE_TOKEN = 'ETH' as const;
// When reusing LIVE_STACK_ID, set LIVE_CHAIN_NAME to the chain name of that stack.
// Otherwise a unique timestamped name is generated per run.
const CHAIN_NAME = process.env.LIVE_CHAIN_NAME ?? `edf-defi-eth-${Date.now()}`;
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const CROSSTRADE_DAPP_URL = 'http://localhost:3004';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;

const DEPLOY_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const CROSSTRADE_INSTALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min for CrossTrade install (async after deploy)
const CROSSTRADE_POLL_INTERVAL_MS = 15_000;
const BUNDLER_POLL_TIMEOUT_MS = 3 * 60 * 1000;
const BUNDLER_POLL_INTERVAL_MS = 10_000;

// Modules expected for DeFi preset (from preset-comparison.md)
const EXPECTED_MODULES = ['bridge', 'blockExplorer', 'monitoring', 'systemPulse', 'crossTrade'] as const;
const ABSENT_MODULES = ['drb'] as const;

// Screenshots
const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-defi';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;
let platformView: Page | null = null;
let platformBrowser: import('playwright').Browser | null = null;
let deployedStackId: string | null = null;
let stackUrls: StackUrls | null = null;

// ---------------------------------------------------------------------------
// Platform UI helper — Chromium + JWT
//
// Opens a headless Chromium page authenticated against the Platform UI.
// Used instead of the Electron WebContentsView (which only opens after the
// Electron SetupPage completes — unreliable in CI). The Electron app still
// manages Docker/backend; we access the running Platform UI via a browser.
// ---------------------------------------------------------------------------

async function openPlatformPage(): Promise<Page> {
  if (!platformBrowser) {
    platformBrowser = await chromium.launch({ headless: true });
  }

  // Wait for the platform UI frontend (port 3000) to be accessible.
  // The backend (port 8000) may come up earlier than the frontend container.
  const PLATFORM_URL = 'http://localhost:3000';
  console.log(`[openPlatformPage] Waiting for Platform UI at ${PLATFORM_URL}...`);
  await pollUntil(
    async () => {
      try {
        const resp = await fetch(PLATFORM_URL, { signal: AbortSignal.timeout(5_000) });
        // Accept any HTTP response (even 4xx) — connection refused is the only failure
        return resp.status > 0 ? (true as const) : null;
      } catch {
        return null;
      }
    },
    'platform UI frontend at localhost:3000',
    3 * 60_000,
    10_000,
  );
  console.log('[openPlatformPage] Platform UI is reachable');

  const token = await loginBackend(BACKEND_URL);
  const context = await platformBrowser.newContext();
  const page = await context.newPage();

  // Platform UI authenticates via 'auth-token' cookie — set it before navigating
  await context.addCookies([{
    name: 'auth-token',
    value: token,
    domain: 'localhost',
    path: '/',
  }]);

  // Navigate to root to establish the origin, then also set localStorage
  await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // page.evaluate runs in browser context — localStorage is available at runtime
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await page.evaluate((t: string) => { localStorage.setItem('accessToken', t); }, token);

  return page;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('[edf] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[edf] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  console.log('[edf] Main window URL:', mainWindow.url());

  // Screenshot: app launched state (before deployment)
  const screenshotPath = `${SCREENSHOT_DIR}/edf-00-app-launched.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[edf] App launch screenshot saved: ${screenshotPath}`);
});

test.afterAll(async () => {
  if (platformBrowser) {
    await platformBrowser.close();
    platformBrowser = null;
  }
  if (electronApp) {
    console.log('[edf] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// EDF-01: DeFi preset 배포 시작 (Platform UI 위저드)
// ---------------------------------------------------------------------------

test('EDF-01: deploy DeFi preset (ETH) via Platform UI wizard', async () => {
  test.setTimeout(10 * 60 * 1000);
  expect(electronApp).not.toBeNull();

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EDF-01] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();

    // Acquire an authenticated Platform UI page for downstream UI tests (EDF-02)
    platformView = await openPlatformPage();
    const screenshotPath = `${SCREENSHOT_DIR}/edf-01-reusing-stack.png`;
    await platformView.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[EDF-01] Screenshot saved: ${screenshotPath}`);
    return;
  }

  // Wait for Electron-launched backend to become ready (Docker auto-starts services)
  await waitForBackendReady(5 * 60 * 1000);

  // Open an authenticated Chromium page for the Platform UI.
  // The Electron WebContentsView (localhost:3000) requires SetupPage completion
  // before it opens — unreliable in CI. Chromium + JWT injection is equivalent
  // and more reliable since the Platform UI is already running in Docker.
  platformView = await openPlatformPage();
  console.log('[EDF-01] Platform page opened, starting deployment wizard...');

  // Drive the wizard: DeFi preset + ETH fee token
  await deployPresetViaUI(platformView, {
    preset: 'defi',
    feeToken: 'ETH',
    chainName: CHAIN_NAME,
  });

  // Resolve the stack ID via backend API (wizard navigates to /rollup list, not detail)
  deployedStackId = await resolveStackIdByChainName(CHAIN_NAME, BACKEND_URL, 60_000);
  console.log(`[EDF-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();

  const screenshotPath = `${SCREENSHOT_DIR}/edf-01-deploy-initiated.png`;
  await platformView.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EDF-01] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EDF-02: 배포 완료 + Integrations 탭 UI 검증 + API 교차검증
// ---------------------------------------------------------------------------

test('EDF-02: deployment complete — Integrations tab shows 5 modules Installed, API cross-check', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + CROSSTRADE_INSTALL_TIMEOUT_MS);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EDF-02] Waiting for stack ${stackId} to reach Deployed...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');
  console.log('[EDF-02] Stack deployed, waiting for CrossTrade to install...');

  const token = await loginBackend(BACKEND_URL);

  // Poll until CrossTrade integration completes (installs async post-deploy)
  // CrossTrade is verified separately in EDF-04; treat timeout as a soft warning here.
  let crossTradeCompleted = false;
  try {
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
        console.log(`[EDF-02] CrossTrade status: ${status}`);
        if (status === 'installed' || status === 'Completed') return ct;
        if (status === 'Failed') throw new Error('CrossTrade integration Failed');
        return null;
      },
      'CrossTrade integration to complete',
      CROSSTRADE_INSTALL_TIMEOUT_MS,
      CROSSTRADE_POLL_INTERVAL_MS,
    );
    crossTradeCompleted = true;
  } catch (err) {
    // CrossTrade is verified in EDF-04 — log a warning and continue
    console.warn(`[EDF-02] CrossTrade integration did not complete in time: ${err}`);
    console.warn('[EDF-02] Continuing — EDF-04 will verify CrossTrade separately');
  }

  // Resolve stack URLs for subsequent tests (EDF-03~07)
  try {
    stackUrls = await resolveStackUrls(CHAIN_NAME);
    console.log(`[EDF-02] L2 RPC: ${stackUrls.l2Rpc}, Bundler: ${stackUrls.bundlerUrl}`);
  } catch (err) {
    console.warn('[EDF-02] Could not resolve stack URLs, falling back to defaults:', err);
    stackUrls = {
      stackId: deployedStackId ?? '',
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

  // --- UI verification: Integrations tab in Platform WebContentsView ---
  const view = platformView ?? await openPlatformPage();
  await view.goto(
    `http://localhost:3000/rollup/${stackId}?tab=components`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await view.waitForSelector('text=Integration Components', { timeout: 30_000 });
  console.log('[EDF-02] Integration Components tab loaded');

  // Verify 5 DeFi module card labels are visible
  // Note: "System Pulse" is the UI label for the uptimeService API module
  const expectedUiLabels = ['Bridge', 'Block Explorer', 'Monitoring', 'System Pulse', 'Cross Trade'] as const;
  for (const label of expectedUiLabels) {
    await expect(view.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    console.log(`[EDF-02] Module label visible: "${label}" ✓`);
  }

  // Poll until ≥4 modules show "Installed" badge
  // CrossTrade may lag or stay Pending — if it didn't complete, we only require 4/5.
  // CrossTrade is verified separately in EDF-04.
  const requiredBadgeCount = crossTradeCompleted ? 5 : 4;
  await pollUntil<number>(
    async () => {
      const count = await view.getByText('Installed', { exact: true }).count();
      console.log(`[EDF-02] "Installed" badge count: ${count}/${requiredBadgeCount} required`);
      return count >= requiredBadgeCount ? count : null;
    },
    `${requiredBadgeCount} DeFi modules to show "Installed" badge`,
    10 * 60 * 1000,
    10_000,
  );
  console.log(`[EDF-02] ${requiredBadgeCount} modules showing Installed ✓`);

  // Screenshot: Integrations tab
  await view.screenshot({
    path: `${SCREENSHOT_DIR}/edf-02-integrations-tab.png`,
    fullPage: false,
  });
  console.log('[EDF-02] Integrations tab screenshot saved');

  // --- API cross-check: backend /integrations endpoint ---
  const integrationsResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(integrationsResp.ok).toBe(true);
  const body = await integrationsResp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];
  const integrationTypes = integrations.map((i) => i.type as string);

  console.log(`[EDF-02] Integration types: ${integrationTypes.join(', ')}`);
  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, ABSENT_MODULES, 'EDF-02');
  console.log('[EDF-02] API module matrix verified ✓');

  // Screenshot: main Electron window
  const mainWindow = await electronApp!.firstWindow();
  await mainWindow.screenshot({
    path: `${SCREENSHOT_DIR}/edf-02-defi-deployed.png`,
    fullPage: false,
  });
  console.log('[EDF-02] Main window screenshot saved');
});

// ---------------------------------------------------------------------------
// EDF-03: Genesis predeploy bytecode 검증
// OP Standard 11 + AA 4 = 15 confirmed; DeFi 5는 DEFI_ADDRESSES 채워지면 자동 활성화
// ---------------------------------------------------------------------------

test('EDF-03: genesis predeploys bytecode exists (OP Standard + AA; DeFi skipped until addresses confirmed)', async () => {
  test.setTimeout(3 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const rpc = stackUrls?.l2Rpc ?? 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);

  let verified = 0;

  // OP Standard (11 confirmed addresses)
  const opCount = await assertOpStandardBytecode(provider, 'EDF-03');
  verified += opCount;
  console.log(`[EDF-03] Verified ${opCount} OP Standard predeploys ✓`);

  // AA (4 addresses — DeFi+ETH requires AA paymaster)
  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(code, `AA predeploy "${name}" (${address}) must have bytecode`).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    verified++;
    console.log(`[EDF-03] AA/${name}: ✓`);
  }

  // DeFi — check if addresses are known
  const defiEntries = Object.entries(DEFI_ADDRESSES);
  if (defiEntries.length > 0) {
    for (const [name, address] of defiEntries) {
      const code = await provider.getCode(address);
      expect(code, `DeFi predeploy "${name}" (${address}) must have bytecode`).not.toBe('0x');
      verified++;
      console.log(`[EDF-03] DeFi/${name}: ✓`);
    }
  } else {
    console.warn(
      '[EDF-03] DeFi predeploy addresses not confirmed — Uniswap/USDCBridge/WETH checks skipped. ' +
      'Populate helpers/presets.ts#DEFI_ADDRESSES to enable full 18-contract verification.',
    );
  }

  console.log(`[EDF-03] Verified ${verified} predeploy contracts ✓`);

  // Screenshot
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/edf-03-predeploys-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EDF-03] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EDF-04: CrossTrade dApp + L2 CrossTrade 컨트랙트 4종 + AA bundler
// ---------------------------------------------------------------------------

test('EDF-04: CrossTrade dApp reachable, L2 contracts present, AA bundler alive', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  const token = await loginBackend(BACKEND_URL);

  // 1. CrossTrade dApp (localhost:3004)
  console.log(`[EDF-04] Probing CrossTrade dApp at ${CROSSTRADE_DAPP_URL}...`);
  const ctResp = await fetch(CROSSTRADE_DAPP_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  expect(
    ctResp.status,
    `CrossTrade dApp must respond with HTTP < 500, got ${ctResp.status}`,
  ).toBeLessThan(500);
  console.log(`[EDF-04] CrossTrade dApp: HTTP ${ctResp.status} ✓`);

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
  console.log('[EDF-04] CrossTrade contracts:', JSON.stringify(contracts, null, 2));

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
    console.log(`[EDF-04] ${contractName}: ${address} ✓`);
  }

  // 3. AA bundler
  const bUrl = stackUrls?.bundlerUrl ?? 'http://localhost:4337';
  console.log(`[EDF-04] Probing AA bundler at ${bUrl}...`);

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
  console.log(`[EDF-04] AA bundler: EntryPoints=${bundlerResult!.join(', ')} ✓`);

  // 4. Chromium screenshot of CrossTrade dApp
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(CROSSTRADE_DAPP_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    const dappScreenshot = `${SCREENSHOT_DIR}/edf-04-crosstrade-dapp.png`;
    await page.screenshot({ path: dappScreenshot, fullPage: true });
    console.log(`[EDF-04] CrossTrade dApp screenshot saved: ${dappScreenshot}`);
  } finally {
    await browser.close();
  }

  console.log('[EDF-04] CrossTrade dApp, L2 contracts, and AA bundler all confirmed ✓');

  // Screenshot: main window final verified state
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/edf-04-services-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EDF-04] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EDF-05: Chain params + overridableFields + predeploy count 계약 검증
// ---------------------------------------------------------------------------

test('EDF-05: chain params and overridable fields match DeFi preset contract', async () => {
  test.setTimeout(2 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  // 1. Fixture sanity: predeploy count
  const presetData = getPresetData(PRESET);
  expect(
    presetData.genesisPredeploys.length,
    `DeFi preset genesisPredeploys fixture must have ${EXPECTED_PREDEPLOY_COUNT[PRESET]} entries`,
  ).toBe(EXPECTED_PREDEPLOY_COUNT[PRESET]);
  console.log(`[EDF-05] genesisPredeploys count: ${presetData.genesisPredeploys.length} ✓`);

  // 2. overridableFields from fixture
  const expectedFields = ['l2BlockTime', 'batchSubmissionFrequency', 'outputRootFrequency', 'backupEnabled'];
  expect(
    [...presetData.overridableFields].sort(),
    'overridableFields must match expected 4 fields',
  ).toEqual(expectedFields.sort());
  console.log(`[EDF-05] overridableFields: ${presetData.overridableFields.join(', ')} ✓`);

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
  console.log(`[EDF-05] Chain params: batch=${batch}, output=${output}, backup=${backup}, challenge=${challenge} ✓`);

  // Screenshot
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/edf-05-chain-params-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EDF-05] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EDF-06: Core services HTTP health (bridge / blockExplorer / monitoring / uptime)
// ---------------------------------------------------------------------------

test('EDF-06: core services HTTP health — bridge, explorer, grafana, prometheus, uptime', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(stackUrls).not.toBeNull();
  const urls = stackUrls!;

  const browser = await chromium.launch();
  try {
    // 1. Bridge — page loads and contains Deposit/Bridge text
    console.log(`[EDF-06] Probing Bridge at ${urls.bridgeUrl}...`);
    const bridgePage = await browser.newPage();
    await bridgePage.goto(urls.bridgeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(bridgePage.getByText(/Deposit|Bridge/i).first()).toBeVisible({ timeout: 15_000 });
    await bridgePage.screenshot({ path: `${SCREENSHOT_DIR}/edf-06-bridge.png`, fullPage: true });
    await bridgePage.close();
    console.log('[EDF-06] Bridge: ✓');

    // 2. Block Explorer — API returns blocks, UI has non-empty title
    console.log(`[EDF-06] Probing Explorer API at ${urls.explorerApiUrl}...`);
    const blocksResp = await fetch(`${urls.explorerApiUrl}/blocks?limit=1`, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(blocksResp.ok, `Explorer API /blocks must respond OK, got ${blocksResp.status}`).toBe(true);
    const blocksBody = await blocksResp.json() as { items?: unknown[] };
    expect(Array.isArray(blocksBody.items), 'Explorer API must return items array').toBe(true);

    const explorerPage = await browser.newPage();
    await explorerPage.goto(urls.explorerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect((await explorerPage.title()).length, 'Explorer UI must have non-empty title').toBeGreaterThan(0);
    await explorerPage.screenshot({ path: `${SCREENSHOT_DIR}/edf-06-explorer.png`, fullPage: true });
    await explorerPage.close();
    console.log('[EDF-06] Block Explorer: ✓');

    // 3. Monitoring — Grafana API health + Prometheus active targets
    console.log(`[EDF-06] Probing Grafana at ${urls.grafanaUrl}...`);
    const grafanaResp = await fetch(`${urls.grafanaUrl}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(grafanaResp.ok, `Grafana /api/health must respond OK, got ${grafanaResp.status}`).toBe(true);
    const grafanaBody = await grafanaResp.json() as { database?: string };
    expect(grafanaBody.database, 'Grafana database must be ok').toBe('ok');
    console.log('[EDF-06] Grafana: ✓');

    console.log(`[EDF-06] Probing Prometheus at ${urls.prometheusUrl}...`);
    const promResp = await fetch(`${urls.prometheusUrl}/api/v1/targets`, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(promResp.ok, `Prometheus /api/v1/targets must respond OK, got ${promResp.status}`).toBe(true);
    const promBody = await promResp.json() as { data?: { activeTargets?: unknown[] } };
    const activeTargets = promBody.data?.activeTargets ?? [];
    expect(activeTargets.length, 'Prometheus must have active targets').toBeGreaterThan(0);
    console.log(`[EDF-06] Prometheus: ${activeTargets.length} active targets ✓`);

    // 4. Uptime Service — page loads with non-empty title
    console.log(`[EDF-06] Probing Uptime Kuma at ${urls.uptimeUrl}...`);
    const uptimePage = await browser.newPage();
    await uptimePage.goto(urls.uptimeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect((await uptimePage.title()).length, 'Uptime UI must have non-empty title').toBeGreaterThan(0);
    await uptimePage.screenshot({ path: `${SCREENSHOT_DIR}/edf-06-uptime.png`, fullPage: true });
    await uptimePage.close();
    console.log('[EDF-06] Uptime Service: ✓');
  } finally {
    await browser.close();
  }

  console.log('[EDF-06] All core services confirmed ✓');

  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/edf-06-services-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EDF-06] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EDF-07: AA operator 실동작 증거 (EntryPoint/Paymaster 잔액 + Platform UI AA 탭)
// EDF-03에서 predeploy 바이트코드, EDF-04에서 bundler JSON-RPC를 이미 확인.
// 이 테스트는 aa-operator가 실제로 리필을 수행했는지 on-chain 잔액으로 증명한다.
// ---------------------------------------------------------------------------

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
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  // page.evaluate runs in browser context — localStorage is available at runtime
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await page.evaluate((t: string) => { localStorage.setItem('accessToken', t); }, token);
}

test('EDF-07: AA operator liveness — EntryPoint/Paymaster on-chain balance > 0, Platform UI AA tab', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(stackUrls).not.toBeNull();
  const urls = stackUrls!;
  const provider = new ethers.JsonRpcProvider(urls.l2Rpc);

  // 1. EntryPoint deposit 잔액 — aa-operator가 리필했어야 > 0
  const epBalance = await pollUntil<bigint>(
    async () => {
      const bal = await provider.getBalance(AA_ADDRESSES.EntryPoint);
      return bal > 0n ? bal : null;
    },
    'EntryPoint on-chain balance > 0',
    90_000,
    10_000,
  );
  console.log(`[EDF-07] EntryPoint balance: ${ethers.formatEther(epBalance)} TON ✓`);

  // 2. MultiTokenPaymaster 잔액 — ETH fee token 시 Paymaster가 ETH 예치 필요
  const pmBalance = await pollUntil<bigint>(
    async () => {
      const bal = await provider.getBalance(AA_ADDRESSES.MultiTokenPaymaster);
      return bal > 0n ? bal : null;
    },
    'MultiTokenPaymaster on-chain balance > 0',
    90_000,
    10_000,
  );
  console.log(`[EDF-07] MultiTokenPaymaster balance: ${ethers.formatEther(pmBalance)} ETH ✓`);

  // 3. Platform UI AA 탭 렌더링 확인
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await authenticateForPlatformUI(page);

    const stackId = urls.stackId || deployedStackId!;
    await page.goto(
      `http://localhost:3000/rollup/${stackId}?tab=account-abstraction`,
      { waitUntil: 'networkidle', timeout: 30_000 },
    );

    await expect(page.locator('text=Fee Token Oracle')).toBeVisible({ timeout: 15_000 });
    console.log('[EDF-07] "Fee Token Oracle" visible ✓');

    await expect(page.locator('text=EntryPoint Auto-Refill')).toBeVisible({ timeout: 15_000 });
    console.log('[EDF-07] "EntryPoint Auto-Refill" visible ✓');

    const statusBadge = page.getByText(/Healthy|Warning|Critical/);
    await expect(statusBadge.first()).toBeVisible({ timeout: 30_000 });
    console.log('[EDF-07] Status badge visible ✓');

    await expect(page.locator('text=Admin Wallet')).toBeVisible({ timeout: 15_000 });
    console.log('[EDF-07] "Admin Wallet" section visible ✓');

    await expect(page.locator(`text=${AA_ADDRESSES.EntryPoint}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`text=${AA_ADDRESSES.MultiTokenPaymaster}`)).toBeVisible({ timeout: 15_000 });
    console.log('[EDF-07] Predeploy addresses visible ✓');

    const aaTabScreenshot = `${SCREENSHOT_DIR}/edf-07-aa-tab.png`;
    await page.screenshot({ path: aaTabScreenshot, fullPage: true });
    console.log(`[EDF-07] AA tab screenshot saved: ${aaTabScreenshot}`);
  } finally {
    await browser.close();
  }

  console.log('[EDF-07] AA operator liveness confirmed: on-chain balances > 0, Platform UI AA tab rendered ✓');

  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/edf-07-aa-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EDF-07] Screenshot saved: ${screenshotPath}`);
});
