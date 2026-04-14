/**
 * Electron E2E — DeFi Preset L2 Deployment on AWS (Spec G-AWS)
 *
 * Launches the built Electron app and verifies a DeFi preset deployment
 * using AWS EKS as the infrastructure provider.
 *
 * This spec is intentionally minimal (seed spec) — it validates the happy
 * path end-to-end: SSO login → preset deploy trigger → deployment completes →
 * L2 RPC responds → integration modules are reachable.
 *
 * Test IDs:
 *   EDA-01 — Electron app launch with AWS SSO credentials available
 *   EDA-02 — Deploy DeFi preset to AWS via Platform UI wizard
 *   EDA-03 — Wait for deployment to complete (EKS provisioning + module install)
 *   EDA-04 — L2 RPC responds to eth_chainId
 *   EDA-05 — Integration modules reachable (bridge / blockExplorer / monitoring)
 *
 * Gating env vars (test.skip if any are missing):
 *   E2E_AWS_PROFILE    — AWS CLI profile name with SSO configured
 *   E2E_AWS_REGION     — AWS region (e.g. ap-northeast-2)
 *   E2E_AWS_SSO_ROLE   — IAM role name to assume via SSO
 *
 * Credential injection (optional, override SSO profile):
 *   E2E_AWS_ACCESS_KEY — AWS access key ID (for static-cred CI runners)
 *   E2E_AWS_SECRET_KEY — AWS secret access key
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-defi-aws.live.spec.ts
 *
 * Prerequisites:
 *   - E2E_AWS_PROFILE, E2E_AWS_REGION, E2E_AWS_SSO_ROLE env vars set
 *   - Docker running (Electron app manages its own backend via Docker)
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 *
 * NOTE: EKS provisioning + module install takes ~25 min. Set test timeout
 * accordingly. Gaming/Full AWS specs are deferred until ADR ④ (backend preset
 * module install automation) is shipped.
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication, chromium, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import { loginBackend, resolveStackUrls, StackUrls } from './helpers/stack-resolver';
import { deployPreset, waitForDeployed, waitForBackendReady } from './helpers/deploy-helper';
import { pollUntil } from './helpers/poll';
import {
  assertIntegrationModules,
} from './helpers/presets';

// ---------------------------------------------------------------------------
// Gate — skip entire suite when AWS env vars are absent
// ---------------------------------------------------------------------------

const AWS_PROFILE = process.env.E2E_AWS_PROFILE;
const AWS_REGION = process.env.E2E_AWS_REGION;
const AWS_SSO_ROLE = process.env.E2E_AWS_SSO_ROLE;

const awsGateActive = !AWS_PROFILE || !AWS_REGION || !AWS_SSO_ROLE;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET = 'defi' as const;
const FEE_TOKEN = 'ETH' as const;
const CHAIN_NAME = process.env.LIVE_CHAIN_NAME ?? `eda-defi-eth-${Date.now()}`;
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? null;

// AWS EKS provisioning + module install can take up to 25 min
const DEPLOY_TIMEOUT_MS = 35 * 60 * 1000; // 35 min safety margin

// Modules expected for DeFi preset (from preset-comparison.md)
const EXPECTED_MODULES = ['bridge', 'blockExplorer', 'monitoring', 'systemPulse', 'crossTrade'] as const;
const ABSENT_MODULES = ['drb'] as const;

// Screenshots
const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-defi-aws';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;
let platformBrowser: import('playwright').Browser | null = null;
let deployedStackId: string | null = null;
let stackUrls: StackUrls | null = null;

// ---------------------------------------------------------------------------
// Platform UI helper — Chromium + JWT
// ---------------------------------------------------------------------------

async function openPlatformPage(): Promise<Page> {
  if (!platformBrowser) {
    platformBrowser = await chromium.launch({ headless: true });
  }

  const PLATFORM_URL = 'http://localhost:3000';
  console.log(`[openPlatformPage] Waiting for Platform UI at ${PLATFORM_URL}...`);
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
  console.log('[openPlatformPage] Platform UI is reachable');

  const token = await loginBackend(BACKEND_URL);
  const context = await platformBrowser.newContext();
  const page = await context.newPage();

  await context.addCookies([{
    name: 'auth-token',
    value: token,
    domain: 'localhost',
    path: '/',
  }]);

  await page.goto(PLATFORM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await page.evaluate((t: string) => { localStorage.setItem('accessToken', t); }, token);

  return page;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  if (awsGateActive) return; // lifecycle is a no-op when gated

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('[eda] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
      // Surface AWS region to the main process so credential injection works
      E2E_AWS_REGION: AWS_REGION ?? '',
    },
  });
  console.log('[eda] Electron app launched');

  const mainWindow = await electronApp.firstWindow();
  console.log('[eda] Main window URL:', mainWindow.url());

  const screenshotPath = `${SCREENSHOT_DIR}/eda-00-app-launched.png`;
  await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[eda] App launch screenshot saved: ${screenshotPath}`);
});

test.afterAll(async () => {
  if (platformBrowser) {
    await platformBrowser.close();
    platformBrowser = null;
  }
  if (electronApp) {
    console.log('[eda] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// EDA-01: Electron app launches with AWS env vars present
// ---------------------------------------------------------------------------

test('EDA-01: Electron app launches with AWS credentials available', async () => {
  test.skip(awsGateActive, 'Skipped: E2E_AWS_PROFILE / E2E_AWS_REGION / E2E_AWS_SSO_ROLE not set');
  test.setTimeout(5 * 60 * 1000);

  expect(electronApp).not.toBeNull();

  console.log(`[EDA-01] AWS profile: ${AWS_PROFILE}, region: ${AWS_REGION}, role: ${AWS_SSO_ROLE}`);

  // Verify backend becomes reachable (Electron auto-started Docker)
  await waitForBackendReady(5 * 60 * 1000, 10_000);
  console.log('[EDA-01] Backend ready');
});

// ---------------------------------------------------------------------------
// EDA-02: Deploy DeFi preset to AWS via Platform UI wizard
// ---------------------------------------------------------------------------

test('EDA-02: deploy DeFi preset (ETH) to AWS via backend API', async () => {
  test.skip(awsGateActive, 'Skipped: E2E_AWS_PROFILE / E2E_AWS_REGION / E2E_AWS_SSO_ROLE not set');
  test.setTimeout(10 * 60 * 1000);

  expect(electronApp).not.toBeNull();

  if (LIVE_STACK_ID) {
    deployedStackId = LIVE_STACK_ID;
    console.log(`[EDA-02] Reusing existing stack: ${deployedStackId}`);
    expect(deployedStackId).toBeTruthy();
    return;
  }

  // For the AWS provider path, trigger deployment via the backend API directly.
  // The Platform UI wizard (localhost:3000) does not yet expose an infra-provider
  // selector — that UI work is tracked in ADR ④. Until then, the API is the
  // authoritative entry point for AWS preset deploys in E2E tests.
  const result = await deployPreset({
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
    provider: 'aws',
  });

  deployedStackId = result.stackId;
  console.log(`[EDA-02] Deploy initiated: stackId=${deployedStackId}, deploymentId=${result.deploymentId}`);
  expect(deployedStackId).toBeTruthy();
});

// ---------------------------------------------------------------------------
// EDA-03: Wait for deployment to complete
// ---------------------------------------------------------------------------

test('EDA-03: wait for AWS deployment to complete', async () => {
  test.skip(awsGateActive, 'Skipped: E2E_AWS_PROFILE / E2E_AWS_REGION / E2E_AWS_SSO_ROLE not set');
  test.setTimeout(DEPLOY_TIMEOUT_MS);

  expect(deployedStackId).toBeTruthy();
  if (!deployedStackId) throw new Error('No stack ID from EDA-02');

  console.log(`[EDA-03] Polling stack ${deployedStackId} (AWS EKS — may take ~25 min)...`);
  const status = await waitForDeployed(deployedStackId, DEPLOY_TIMEOUT_MS);

  expect(status.status).toBe('Deployed');
  console.log(`[EDA-03] Stack deployed: chainName=${status.chainName}`);

  // Resolve service URLs for subsequent tests
  stackUrls = await resolveStackUrls(deployedStackId, BACKEND_URL);
  console.log('[EDA-03] Stack URLs:', JSON.stringify(stackUrls));
});

// ---------------------------------------------------------------------------
// EDA-04: L2 RPC responds to eth_chainId
// ---------------------------------------------------------------------------

test('EDA-04: L2 RPC responds to eth_chainId', async () => {
  test.skip(awsGateActive, 'Skipped: E2E_AWS_PROFILE / E2E_AWS_REGION / E2E_AWS_SSO_ROLE not set');
  test.setTimeout(2 * 60 * 1000);

  expect(stackUrls).not.toBeNull();
  if (!stackUrls) throw new Error('No stack URLs from EDA-03');

  const rpcUrl = stackUrls.l2Rpc;
  expect(rpcUrl).toBeTruthy();

  console.log(`[EDA-04] Probing L2 RPC at ${rpcUrl}...`);

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
    signal: AbortSignal.timeout(15_000),
  });

  expect(resp.ok).toBe(true);
  const json = await resp.json() as { result?: string };
  expect(typeof json.result).toBe('string');
  expect(json.result?.startsWith('0x')).toBe(true);

  console.log(`[EDA-04] L2 chainId: ${json.result}`);
});

// ---------------------------------------------------------------------------
// EDA-05: Integration modules reachable
// ---------------------------------------------------------------------------

test('EDA-05: integration modules reachable (bridge / blockExplorer / monitoring)', async () => {
  test.skip(awsGateActive, 'Skipped: E2E_AWS_PROFILE / E2E_AWS_REGION / E2E_AWS_SSO_ROLE not set');
  test.setTimeout(3 * 60 * 1000);

  expect(stackUrls).not.toBeNull();
  expect(deployedStackId).toBeTruthy();
  if (!stackUrls || !deployedStackId) throw new Error('No stack data from prior tests');

  // Fetch integration list from API
  const token = await loginBackend(BACKEND_URL);
  const resp = await fetch(`${BACKEND_URL}/api/v1/stacks/thanos/${deployedStackId}/integrations`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  expect(resp.ok).toBe(true);
  const body = await resp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const integrations = (data.integrations as Record<string, unknown>[]) ?? [];
  const integrationTypes = integrations.map((i) => (i.type as string) ?? '');

  assertIntegrationModules(
    integrationTypes,
    EXPECTED_MODULES,
    ABSENT_MODULES,
    `EDA-05 [stackId=${deployedStackId}]`,
  );
  console.log('[EDA-05] Integration module assertions passed');

  // Screenshot the platform UI integrations view
  const page = await openPlatformPage();
  try {
    await page.goto(`http://localhost:3000/rollup/${deployedStackId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/eda-05-integrations.png` });
  } finally {
    await page.close();
  }
});
