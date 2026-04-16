/**
 * Electron E2E — General Preset L2 Deployment (Spec D)
 *
 * Launches the built Electron app and verifies a General preset deployment
 * with TON as the native fee token. This is the lightest preset:
 *   - Modules: bridge, blockExplorer only
 *   - No monitoring, uptime, crossTrade, DRB
 *   - TON fee token → no AA paymaster needed
 *
 * Test IDs:
 *   EGN-01 — Electron 앱 실행 및 General preset 배포 시작
 *   EGN-02 — 배포 완료 대기 및 모듈 검증 (bridge/blockExplorer만 존재)
 *   EGN-03 — L2 RPC alive + TON fee token이므로 paymaster 미배포 확인
 *   EGN-04 — Chain params + overridableFields + predeploy count 계약 검증
 *   EGN-05 — 배포 완료 후 deployment-watcher가 in-app 알림을 NotificationStore에 추가했는지 확인
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-general.live.spec.ts
 *
 * Prerequisites:
 *   - Docker running (make up)
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 *   - Optional: LIVE_STACK_ID to reuse existing deployed stack
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication, chromium } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend } from './helpers/stack-resolver';
import { deployPreset, waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { pollUntil } from './helpers/poll';
import {
  AA_ADDRESSES,
  EXPECTED_PREDEPLOY_COUNT,
  assertIntegrationModules,
  assertOpStandardBytecode,
  getPresetData,
} from './helpers/presets';
import { ethers } from 'ethers';
import type { AppNotification } from '../../src/renderer/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'general' as const;
const FEE_TOKEN = 'TON' as const;
const CHAIN_NAME = 'ect-general-ton';
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;

const DEPLOY_TIMEOUT_MS = 25 * 60 * 1000; // 25 min
const MODULE_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const MODULE_POLL_INTERVAL_MS = 10_000; // 10s

// Modules expected for General preset (from PRESET_MODULES in matrix-config.ts)
const EXPECTED_MODULES = ['bridge', 'blockExplorer'] as const;
const ABSENT_MODULES = ['monitoring', 'systemPulse', 'crossTrade', 'drb'] as const;

// Screenshots
const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-general';

// ---------------------------------------------------------------------------
// Screenshot helper — platform UI (localhost:3000)
//
// All meaningful state lives in the WebContentsView at localhost:3000, not in
// the Electron main BrowserWindow (SetupPage). This helper opens a headless
// Chromium page, navigates to the platform UI, and saves a fullPage screenshot.
// ---------------------------------------------------------------------------

async function screenshotPlatformUI(filePath: string, stackId?: string): Promise<void> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = stackId
      ? `http://localhost:3000/stacks/${stackId}`
      : 'http://localhost:3000';
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[egn] Platform UI screenshot saved: ${filePath}`);
  } catch (err) {
    // Screenshot failures are non-fatal — log and continue.
    // This can happen if localhost:3000 is temporarily unreachable.
    console.warn(`[egn] Screenshot failed (non-fatal): ${filePath} — ${err}`);
  } finally {
    await browser?.close();
  }
}

// ---------------------------------------------------------------------------
// State
//
// Worker-restart-safe pattern:
//   Playwright restarts the worker process when a test throws a TypeError
//   (e.g. fetch failed), resetting all module-level variables. To survive
//   restarts, deployedStackId and l2RpcUrl are persisted to a temp file
//   and restored at the start of each test that needs them.
// ---------------------------------------------------------------------------

const STATE_FILE = '/tmp/pw-egn-state.json';

function saveState(): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ deployedStackId, l2RpcUrl }), 'utf8');
}

function restoreState(): void {
  if (deployedStackId !== null) return; // already set in this worker
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const s = JSON.parse(raw) as { deployedStackId: string | null; l2RpcUrl: string | null };
    if (s.deployedStackId) {
      deployedStackId = s.deployedStackId;
      l2RpcUrl = s.l2RpcUrl;
      console.log(`[egn] Restored state from file: stackId=${deployedStackId}`);
    }
  } catch {
    // state file doesn't exist yet — first run
  }
}

/** Delete state file so next run does a fresh deploy (call when stack no longer exists). */
function clearState(): void {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch { /* already gone */ }
  deployedStackId = null;
  l2RpcUrl = null;
}

let electronApp: ElectronApplication | null = null;
let deployedStackId: string | null = null;
let l2RpcUrl: string | null = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('[egn] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[egn] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  console.log('[egn] Main window URL:', mainWindow.url());

  // Screenshot: app launched state (before deployment)
  const screenshotPath = `${SCREENSHOT_DIR}/egn-00-app-launched.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[egn] App launch screenshot saved: ${screenshotPath}`);

  // Always wait for backend to be ready — covers both fresh deploy and LIVE_STACK_ID reuse paths.
  // Docker is started by the Electron app's SetupPage; this polls until it responds.
  await waitForBackendReady(5 * 60 * 1000);
});

test.afterAll(async () => {
  if (electronApp) {
    console.log('[egn] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// EGN-01: General preset 배포 시작
// ---------------------------------------------------------------------------

test('EGN-01: start General preset (TON) deployment via backend API', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];
  await mainWindow.waitForLoadState('domcontentloaded');
  console.log('[EGN-01] Main window DOM ready');

  if (LIVE_STACK_ID) {
    // Verify the stack still exists before reusing it (state may be stale after DB reset)
    try {
      const token = await loginBackend(BACKEND_URL);
      const checkResp = await fetch(
        `${BACKEND_URL}/api/v1/stacks/thanos/${LIVE_STACK_ID}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (checkResp.ok) {
        deployedStackId = LIVE_STACK_ID;
        console.log(`[EGN-01] Reusing existing stack: ${deployedStackId}`);
        saveState();
        await screenshotPlatformUI(`${SCREENSHOT_DIR}/egn-01-reusing-stack.png`);
        return;
      }
      console.warn(`[EGN-01] LIVE_STACK_ID=${LIVE_STACK_ID} returned ${checkResp.status} — stack gone, deploying fresh`);
    } catch (err) {
      console.warn(`[EGN-01] LIVE_STACK_ID check failed: ${err} — deploying fresh`);
    }
    clearState();
  }

  console.log('[EGN-01] Initiating General preset deployment via API...');
  const result = await deployPreset({
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
  });

  deployedStackId = result.stackId;
  console.log(`[EGN-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();
  expect(result.deploymentId).toBeTruthy();
  saveState();

  // Screenshot: platform UI after deployment initiated
  await screenshotPlatformUI(`${SCREENSHOT_DIR}/egn-01-deployment-initiated.png`);
});

// ---------------------------------------------------------------------------
// EGN-02: 배포 완료 + 모듈 검증
// ---------------------------------------------------------------------------

test('EGN-02: deployment complete — only bridge and blockExplorer modules present', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + MODULE_POLL_TIMEOUT_MS);
  restoreState();
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EGN-02] Waiting for stack ${stackId} to reach Deployed...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');
  console.log(`[EGN-02] Stack deployed`);

  const token = await loginBackend(BACKEND_URL);

  // Fetch integrations and resolve l2RpcUrl for EGN-03
  const integrationsResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(integrationsResp.ok).toBe(true);

  const body = await integrationsResp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];

  const integrationTypes = integrations.map((i) => i.type as string);
  console.log(`[EGN-02] Integration types: ${integrationTypes.join(', ')}`);

  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, ABSENT_MODULES, 'EGN-02');

  // Store L2 RPC for EGN-03
  const stackResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (stackResp.ok) {
    const stackBody = await stackResp.json() as Record<string, unknown>;
    const stackData = (stackBody.data ?? stackBody) as Record<string, unknown>;
    l2RpcUrl = (stackData.l2RpcUrl ?? stackData.l2_rpc_url ?? 'http://localhost:8545') as string;
    console.log(`[EGN-02] L2 RPC URL: ${l2RpcUrl}`);
    saveState(); // persist l2RpcUrl for EGN-03 in case of worker restart
  }

  // Screenshot: platform UI stack detail (deployed)
  await screenshotPlatformUI(`${SCREENSHOT_DIR}/egn-02-deployment-complete.png`, stackId);
});

// ---------------------------------------------------------------------------
// EGN-03: L2 RPC alive + paymaster 미배포 (TON = no AA)
// ---------------------------------------------------------------------------

test('EGN-03: OP Standard predeploys deployed + no AA bundler service (TON fee token)', async () => {
  test.setTimeout(3 * 60 * 1000);
  restoreState();
  expect(deployedStackId).not.toBeNull();

  const rpc = l2RpcUrl ?? 'http://localhost:8545';
  console.log(`[EGN-03] Checking L2 RPC: ${rpc}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  // L2 RPC must respond to eth_blockNumber
  const blockNumber = await provider.getBlockNumber();
  expect(blockNumber, 'L2 must have produced at least 1 block').toBeGreaterThanOrEqual(1);
  console.log(`[EGN-03] L2 block number: ${blockNumber}`);

  // OP Standard 11 predeploys — all presets must have these
  const opCount = await assertOpStandardBytecode(provider, 'EGN-03');
  console.log(`[EGN-03] Verified ${opCount} OP Standard predeploys ✓`);

  // NOTE: AA predeploy addresses (including MultiTokenPaymaster at 0x4200...0067)
  // are included in Thanos genesis even for General+TON. The behavioral distinction
  // is that the AA bundler SERVICE is not deployed for TON fee token (no ERC-4337
  // userop processing). Bytecode presence alone is not a valid signal here.
  const paymasterCode = await provider.getCode(AA_ADDRESSES.MultiTokenPaymaster);
  console.log(
    `[EGN-03] MultiTokenPaymaster (${AA_ADDRESSES.MultiTokenPaymaster}) bytecode length: ${paymasterCode.length}` +
    ' (present in genesis regardless of fee token — expected)',
  );

  // AA bundler must NOT be reachable for TON fee token (no bundler service deployed)
  const bundlerUrl = 'http://localhost:4337';
  let bundlerReachable = false;
  try {
    const resp = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_supportedEntryPoints', params: [], id: 1 }),
      signal: AbortSignal.timeout(5_000),
    });
    bundlerReachable = resp.ok;
  } catch {
    bundlerReachable = false;
  }
  expect(bundlerReachable, 'General+TON must NOT have an AA bundler running').toBe(false);
  console.log('[EGN-03] Verified: no AA bundler on General+TON ✓');

  // Screenshot: platform UI stack detail (RPC verified)
  await screenshotPlatformUI(`${SCREENSHOT_DIR}/egn-03-rpc-verified.png`, deployedStackId!);
});

// ---------------------------------------------------------------------------
// EGN-04: Chain params + overridableFields + predeploy count 계약 검증
// ---------------------------------------------------------------------------

test('EGN-04: chain params and overridable fields match General preset contract', async () => {
  test.setTimeout(2 * 60 * 1000);
  restoreState();
  expect(deployedStackId).not.toBeNull();

  // 1. Fixture sanity: predeploy count from presets.json must match expected constant
  const presetData = getPresetData(PRESET);
  expect(
    presetData.genesisPredeploys.length,
    `General preset genesisPredeploys fixture must have ${EXPECTED_PREDEPLOY_COUNT[PRESET]} entries`,
  ).toBe(EXPECTED_PREDEPLOY_COUNT[PRESET]);
  console.log(`[EGN-04] genesisPredeploys count: ${presetData.genesisPredeploys.length} ✓`);

  // 2. overridableFields from fixture
  const expectedFields = ['l2BlockTime', 'batchSubmissionFrequency', 'outputRootFrequency', 'backupEnabled'];
  expect(
    [...presetData.overridableFields].sort(),
    'overridableFields must match expected 4 fields',
  ).toEqual(expectedFields.sort());
  console.log(`[EGN-04] overridableFields: ${presetData.overridableFields.join(', ')} ✓`);

  // 3. Chain params from API vs fixture defaults
  const token = await loginBackend(BACKEND_URL);
  const stackResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${deployedStackId!}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(stackResp.ok, 'Stack detail API must respond OK').toBe(true);
  const stackBody = await stackResp.json() as Record<string, unknown>;
  // Single-stack API response: { data: { stack: { config: { ... } } } }
  // or flat:                   { data: { batchSubmissionFrequency: ... } }
  const dataObj = (stackBody.data ?? stackBody) as Record<string, unknown>;
  const stackObj = (dataObj.stack ?? dataObj) as Record<string, unknown>;
  const configObj = (stackObj.config ?? stackObj) as Record<string, unknown>;

  // Diagnostic: log response layers to identify actual field names
  console.log('[EGN-04] dataObj keys:', Object.keys(dataObj));
  console.log('[EGN-04] stackObj keys:', Object.keys(stackObj));
  console.log('[EGN-04] configObj keys:', Object.keys(configObj));

  // Try config nesting first (canonical), then flat data/stack (older backends)
  const batch =
    configObj.batchSubmissionFrequency ?? configObj.batch_submission_frequency ??
    stackObj.batchSubmissionFrequency ?? stackObj.batch_submission_frequency ??
    dataObj.batchSubmissionFrequency ?? dataObj.batch_submission_frequency;
  const output =
    configObj.outputRootFrequency ?? configObj.output_root_frequency ??
    stackObj.outputRootFrequency ?? stackObj.output_root_frequency ??
    dataObj.outputRootFrequency ?? dataObj.output_root_frequency;
  const backup =
    configObj.backupEnabled ?? configObj.backup_enabled ??
    stackObj.backupEnabled ?? stackObj.backup_enabled ??
    dataObj.backupEnabled ?? dataObj.backup_enabled;
  const challenge =
    configObj.challengePeriod ?? configObj.challenge_period ??
    stackObj.challengePeriod ?? stackObj.challenge_period ??
    dataObj.challengePeriod ?? dataObj.challenge_period;

  const { chainDefaults } = presetData;
  expect(
    Number(batch),
    `batchSubmissionFrequency must be ${chainDefaults.batchSubmissionFrequency} (raw: ${batch})`,
  ).toBe(chainDefaults.batchSubmissionFrequency);
  expect(
    Number(output),
    `outputRootFrequency must be ${chainDefaults.outputRootFrequency} (raw: ${output})`,
  ).toBe(chainDefaults.outputRootFrequency);
  expect(
    Boolean(backup),
    `backupEnabled must be ${chainDefaults.backupEnabled} (raw: ${backup})`,
  ).toBe(chainDefaults.backupEnabled);
  expect(
    Number(challenge),
    `challengePeriod must be ${chainDefaults.challengePeriod} (raw: ${challenge})`,
  ).toBe(chainDefaults.challengePeriod);
  console.log(`[EGN-04] Chain params: batch=${batch}, output=${output}, backup=${backup}, challenge=${challenge} ✓`);

  // Screenshot: platform UI stack detail (chain params verified)
  await screenshotPlatformUI(`${SCREENSHOT_DIR}/egn-04-chain-params-verified.png`, deployedStackId!);
});

// ---------------------------------------------------------------------------
// EGN-05: deployment-watcher가 in-app 알림을 추가했는지 확인
// ---------------------------------------------------------------------------

test('EGN-05: deployment-watcher adds L2 Deployment Complete notification after stack deployed', async () => {
  test.setTimeout(2 * 60 * 1000);
  restoreState();
  expect(deployedStackId, 'deployedStackId must be set — run EGN-01 first').not.toBeNull();
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];

  // Query the in-app NotificationStore via IPC (preload bridge)
  const notifications = await mainWindow.evaluate<AppNotification[]>(async () => {
    return window.electronAPI.notifications.getAll();
  });

  console.log(`[EGN-05] Total notifications in store: ${notifications.length}`);
  notifications.forEach((n) => console.log(`[EGN-05]  - [${n.type}] "${n.title}"`));

  // The deployment-watcher must have added at least one 'L2 Deployment Complete' notification
  const deployNotif = notifications.find((n) => n.title === 'L2 Deployment Complete');
  expect(
    deployNotif,
    'deployment-watcher must add an "L2 Deployment Complete" notification when stack reaches Deployed',
  ).toBeTruthy();

  // Notification message should reference the deployed stack
  expect(deployNotif!.message).toMatch(/is now deployed and running/);

  // Type must be 'deployment'
  expect(deployNotif!.type).toBe('deployment');

  console.log(`[EGN-05] Deployment notification found: "${deployNotif!.title}" — ${deployNotif!.message} ✓`);

  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/egn-05-notification-store.png` });
});
