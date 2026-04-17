/**
 * Electron E2E — DRB Gaming Preset Deployment
 *
 * Launches the built Electron app, drives the real Platform UI deployment
 * wizard inside the Electron WebContentsView, then verifies that:
 *   - the stack reaches Deployed
 *   - DRB containers are running and healthy
 *   - the DRB predeploy has bytecode on L2
 *   - at least 3 operators are activated on-chain
 *
 * Test IDs:
 *   DRB-E2E-03 — Electron UI deploy flow for Gaming + USDT
 *   DRB-E2E-04 — runtime smoke validation (containers / predeploy / activation)
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { test, expect } from '@playwright/test';
import { deployPresetViaUI, resolveStackIdByChainName } from './helpers/deploy-wizard';
import {
  ensureNoActiveStacks,
  teardownStack,
  waitForBackendReady,
  waitForDeployed,
} from './helpers/deploy-helper';
import { getPlatformView } from './helpers/platform-view';

const execAsync = promisify(exec);

test.describe.configure({ mode: 'serial' });

const PRESET = 'gaming' as const;
const FEE_TOKEN = 'USDT' as const;
const CHAIN_NAME = `drb-gaming-usdt-${Date.now()}`;
const BACKEND_READY_TIMEOUT_MS = 5 * 60 * 1000;
const DEPLOY_TIMEOUT_MS = 30 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 5 * 60 * 1000;
const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const DRB_PREDEPLOY_ADDRESS = '0x4200000000000000000000000000000000000060';
const DRB_CONTAINERS = ['drb-leader', 'drb-regular-1', 'drb-regular-2', 'drb-regular-3'];
const SCREENSHOT_DIR = '/tmp/pw-screenshots/drb-gaming-deploy';

let electronApp: ElectronApplication | null = null;
let deployedStackId: string | null = null;

async function waitForContainer(containerName: string, maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const { stdout } = await execAsync(
        `docker ps --filter "name=${containerName}" --format "{{.Names}}"`,
      );
      if (stdout.includes(containerName)) {
        return true;
      }
    } catch {
      // Retry until deadline.
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  return false;
}

async function waitForHealthyContainers(containerNames: string[], maxWaitMs: number): Promise<void> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const checks = await Promise.all(containerNames.map(async (containerName) => {
      try {
        const { stdout } = await execAsync(
          `docker inspect -f '{{.State.Health.Status}}' ${containerName}`,
        );
        return stdout.trim() === 'healthy';
      } catch {
        return false;
      }
    }));

    if (checks.every(Boolean)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(`containers did not become healthy within ${maxWaitMs}ms`);
}

async function checkPredeploy(rpcUrl: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `cast code ${DRB_PREDEPLOY_ADDRESS} --rpc-url ${rpcUrl}`,
      { timeout: 10_000 },
    );
    const code = stdout.trim();
    return code !== '0x' && code.length > 2;
  } catch {
    return false;
  }
}

async function checkActivatedOperators(rpcUrl: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `cast call ${DRB_PREDEPLOY_ADDRESS} "getActivatedOperators()(address[])" --rpc-url ${rpcUrl}`,
      { timeout: 10_000 },
    );
    return (stdout.match(/0x[a-fA-F0-9]{40}/g) || []).length;
  } catch {
    return 0;
  }
}

test.beforeAll(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });

  await waitForBackendReady(BACKEND_READY_TIMEOUT_MS);
});

test.afterAll(async () => {
  if (deployedStackId) {
    try {
      await teardownStack(deployedStackId);
    } catch (error) {
      console.warn('[drb-e2e] teardown failed:', error);
    }
  }

  if (electronApp) {
    await electronApp.close();
    electronApp = null;
  }
});

test('DRB-E2E-03: deploy Gaming + USDT via Electron UI and verify DRB runtime', async () => {
  test.setTimeout(DEPLOY_TIMEOUT_MS + HEALTH_TIMEOUT_MS);

  expect(electronApp).not.toBeNull();
  await ensureNoActiveStacks();

  const platformView = await getPlatformView(electronApp!, BACKEND_READY_TIMEOUT_MS);
  await platformView.screenshot({
    path: `${SCREENSHOT_DIR}/drb-01-platform-ready.png`,
    fullPage: false,
  });

  await deployPresetViaUI(platformView, {
    preset: PRESET,
    feeToken: FEE_TOKEN,
    chainName: CHAIN_NAME,
  });

  deployedStackId = await resolveStackIdByChainName(CHAIN_NAME, undefined, 60_000);
  expect(deployedStackId).toBeTruthy();

  await platformView.screenshot({
    path: `${SCREENSHOT_DIR}/drb-02-deploy-initiated.png`,
    fullPage: false,
  });

  const stackStatus = await waitForDeployed(deployedStackId!, DEPLOY_TIMEOUT_MS);
  expect(stackStatus.status).toBe('Deployed');

  for (const containerName of DRB_CONTAINERS) {
    const exists = await waitForContainer(containerName, 60_000);
    expect(exists, `${containerName} should be running`).toBe(true);
  }

  await waitForHealthyContainers(DRB_CONTAINERS, HEALTH_TIMEOUT_MS);

  const rpcUrl = 'http://localhost:8545';
  const predeployExists = await checkPredeploy(rpcUrl);
  expect(predeployExists, 'CommitReveal2L2 predeploy should exist').toBe(true);

  const operatorCount = await checkActivatedOperators(rpcUrl);
  expect(operatorCount, 'should have at least 3 activated operators').toBeGreaterThanOrEqual(3);

  await platformView.goto(`http://localhost:3000/rollup/${deployedStackId!}?tab=components`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await platformView.screenshot({
    path: `${SCREENSHOT_DIR}/drb-03-components-tab.png`,
    fullPage: false,
  });
});
