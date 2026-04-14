/**
 * Electron E2E — Gaming Preset L2 Deployment (Spec E)
 *
 * Launches the built Electron app and verifies a Gaming preset deployment
 * with ETH as the fee token. Gaming preset specifics:
 *   - Modules: bridge, blockExplorer, monitoring, uptimeService, drb
 *   - No crossTrade
 *   - ETH fee token → AA paymaster + bundler required
 *   - Genesis predeploys: OP Standard 13 + DRB 3 + AA 4 = 20
 *   - batchSubmissionFrequency = 300s (fastest)
 *
 * Test IDs:
 *   EGM-01 — Electron 앱 실행 및 Gaming preset 배포 시작
 *   EGM-02 — 배포 완료 대기 및 모듈 검증 (monitoring/uptime/drb 포함, crossTrade 부재)
 *   EGM-03 — DRB 3종 + AA 4종 Genesis predeploy bytecode 검증
 *   EGM-04 — AA bundler alive (eth_supportedEntryPoints)
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-gaming.live.spec.ts
 *
 * Prerequisites:
 *   - Docker running (make up)
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 *   - Optional: LIVE_STACK_ID to reuse existing deployed stack
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrls } from './helpers/stack-resolver';
import { deployPreset, waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { pollUntil } from './helpers/poll';
import {
  DRB_ADDRESSES,
  AA_ADDRESSES,
  EXPECTED_PREDEPLOY_COUNT,
  assertIntegrationModules,
  assertOpStandardBytecode,
  getPresetData,
} from './helpers/presets';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'gaming' as const;
const FEE_TOKEN = 'ETH' as const;
const CHAIN_NAME = 'ect-gaming-eth';
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;

const DEPLOY_TIMEOUT_MS = 30 * 60 * 1000; // 30 min (gaming is heavier than general)
const BUNDLER_POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 min
const BUNDLER_POLL_INTERVAL_MS = 10_000;

// Modules expected for Gaming preset
const EXPECTED_MODULES = ['bridge', 'blockExplorer', 'monitoring', 'systemPulse', 'drb'] as const;
const ABSENT_MODULES = ['crossTrade'] as const;

const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-gaming';

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

  console.log('[egm] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[egm] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  console.log('[egm] Main window URL:', mainWindow.url());

  // Screenshot: app launched state (before deployment)
  const screenshotPath = `${SCREENSHOT_DIR}/egm-00-app-launched.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[egm] App launch screenshot saved: ${screenshotPath}`);
});

test.afterAll(async () => {
  if (electronApp) {
    console.log('[egm] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// EGM-01: Gaming preset 배포 시작
// ---------------------------------------------------------------------------

test('EGM-01: start Gaming preset (ETH) deployment via backend API', async () => {
  test.setTimeout(5 * 60 * 1000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];
  await mainWindow.waitForLoadState('domcontentloaded');
  console.log('[EGM-01] Main window DOM ready');

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EGM-01] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();
    return;
  }

  // Wait for Electron-launched backend to become ready (Docker auto-start takes time)
  await waitForBackendReady(5 * 60 * 1000);

  console.log('[EGM-01] Initiating Gaming preset deployment via API...');
  const result = await deployPreset({
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
  });

  deployedStackId = result.stackId;
  console.log(`[EGM-01] Deployment initiated: stackId=${deployedStackId}`);
  expect(deployedStackId).toBeTruthy();
  expect(result.deploymentId).toBeTruthy();

  // Screenshot: deployment initiated state
  const screenshotPath = `${SCREENSHOT_DIR}/egm-01-deployment-initiated.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EGM-01] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EGM-02: 배포 완료 + 모듈 검증
// ---------------------------------------------------------------------------

test('EGM-02: deployment complete — monitoring/uptime/drb present, crossTrade absent', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + 5 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const stackId = deployedStackId!;
  console.log(`[EGM-02] Waiting for stack ${stackId} to reach Deployed...`);

  const stackStatus = await waitForDeployed(stackId, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');
  console.log(`[EGM-02] Stack deployed`);

  const token = await loginBackend(BACKEND_URL);

  const integrationsResp = await fetch(
    `${BACKEND_URL}/api/v1/stacks/thanos/${stackId}/integrations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(integrationsResp.ok).toBe(true);

  const body = await integrationsResp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];

  const integrationTypes = integrations.map((i) => i.type as string);
  console.log(`[EGM-02] Integration types: ${integrationTypes.join(', ')}`);

  assertIntegrationModules(integrationTypes, EXPECTED_MODULES, ABSENT_MODULES, 'EGM-02');

  // Resolve URLs for subsequent tests
  try {
    const stackUrls = await resolveStackUrls(CHAIN_NAME);
    l2RpcUrl = stackUrls.l2Rpc;
    bundlerUrl = stackUrls.bundlerUrl;
    console.log(`[EGM-02] L2 RPC: ${l2RpcUrl}, Bundler: ${bundlerUrl}`);
  } catch (err) {
    console.warn('[EGM-02] Could not resolve stack URLs, falling back to defaults:', err);
    l2RpcUrl = 'http://localhost:8545';
    bundlerUrl = 'http://localhost:4337';
  }

  // Screenshot main window
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/egm-02-gaming-deployed.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EGM-02] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EGM-03: DRB + AA predeploy bytecode 검증
// ---------------------------------------------------------------------------

test('EGM-03: OP Standard + DRB 3 + AA 4 genesis predeploys have deployed bytecode', async () => {
  test.setTimeout(3 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  const rpc = l2RpcUrl ?? 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);

  // OP Standard 11 predeploys — all presets must have these
  const opCount = await assertOpStandardBytecode(provider, 'EGM-03');
  console.log(`[EGM-03] Verified ${opCount} OP Standard predeploys ✓`);

  // DRB predeploys (3 contracts)
  for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(
      code,
      `DRB predeploy ${name} (${address}) must have deployed bytecode`,
    ).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    console.log(`[EGM-03] DRB/${name}: bytecode present (${code.length} chars)`);
  }

  // AA predeploys (4 contracts)
  for (const [name, address] of Object.entries(AA_ADDRESSES)) {
    const code = await provider.getCode(address);
    expect(
      code,
      `AA predeploy ${name} (${address}) must have deployed bytecode`,
    ).not.toBe('0x');
    expect(code.length).toBeGreaterThan(4);
    console.log(`[EGM-03] AA/${name}: bytecode present (${code.length} chars)`);
  }

  // Screenshot: predeploy bytecode verified state
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/egm-03-predeploys-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EGM-03] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EGM-04: AA bundler alive
// ---------------------------------------------------------------------------

test('EGM-04: AA bundler responds to eth_supportedEntryPoints', async () => {
  test.setTimeout(BUNDLER_POLL_TIMEOUT_MS + 30_000);
  expect(deployedStackId).not.toBeNull();

  const bUrl = bundlerUrl ?? 'http://localhost:4337';
  console.log(`[EGM-04] Polling bundler at ${bUrl}...`);

  const result = await pollUntil<string[]>(
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

  expect(result, 'Bundler must return at least one supported EntryPoint').toBeDefined();
  expect(result!.map((a) => a.toLowerCase())).toContain(
    AA_ADDRESSES.EntryPoint.toLowerCase(),
  );
  console.log(`[EGM-04] Bundler alive, EntryPoints: ${result!.join(', ')}`);

  // Screenshot: bundler verified state
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/egm-04-bundler-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EGM-04] Screenshot saved: ${screenshotPath}`);
});

// ---------------------------------------------------------------------------
// EGM-05: Chain params + overridableFields + predeploy count 계약 검증
// ---------------------------------------------------------------------------

test('EGM-05: chain params and overridable fields match Gaming preset contract', async () => {
  test.setTimeout(2 * 60 * 1000);
  expect(deployedStackId).not.toBeNull();

  // 1. Fixture sanity: predeploy count
  const presetData = getPresetData(PRESET);
  expect(
    presetData.genesisPredeploys.length,
    `Gaming preset genesisPredeploys fixture must have ${EXPECTED_PREDEPLOY_COUNT[PRESET]} entries`,
  ).toBe(EXPECTED_PREDEPLOY_COUNT[PRESET]);
  console.log(`[EGM-05] genesisPredeploys count: ${presetData.genesisPredeploys.length} ✓`);

  // 2. overridableFields from fixture
  const expectedFields = ['l2BlockTime', 'batchSubmissionFrequency', 'outputRootFrequency', 'backupEnabled'];
  expect(
    [...presetData.overridableFields].sort(),
    'overridableFields must match expected 4 fields',
  ).toEqual(expectedFields.sort());
  console.log(`[EGM-05] overridableFields: ${presetData.overridableFields.join(', ')} ✓`);

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
  console.log(`[EGM-05] Chain params: batch=${batch}, output=${output}, backup=${backup}, challenge=${challenge} ✓`);

  // Screenshot
  const mainWindow = await electronApp!.firstWindow();
  const screenshotPath = `${SCREENSHOT_DIR}/egm-05-chain-params-verified.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[EGM-05] Screenshot saved: ${screenshotPath}`);
});
