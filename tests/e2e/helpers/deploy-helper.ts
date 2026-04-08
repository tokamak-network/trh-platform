/**
 * Deploy Helper — Deploy and teardown stacks via backend API.
 *
 * Used by full-cycle matrix tests to programmatically deploy an L2 stack
 * with a given preset/feeToken, wait for deployment to complete, and
 * tear it down after verification.
 */

import { loginBackend } from './stack-resolver';
import { pollUntil } from './poll';
import type { Preset, FeeToken } from './matrix-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Matches backend PresetDeployRequest DTO (json field names). */
export interface DeployRequest {
  presetId: string;
  chainName: string;
  network: string;
  seedPhrase: string;
  infraProvider: string;
  l1RpcUrl: string;
  l1BeaconUrl: string;
  feeToken: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
}

export interface DeployResult {
  stackId: string;
  deploymentId: string;
}

export interface StackStatus {
  id: string;
  status: string;
  chainName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default 12-word test mnemonic (well-known, never use for real funds). */
const DEFAULT_TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

const DEPLOY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (Sepolia L1 contract deploy varies)
const DEPLOY_POLL_INTERVAL_MS = 15_000;    // 15 seconds
const TEARDOWN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TEARDOWN_POLL_INTERVAL_MS = 10_000;  // 10 seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackendUrl(): string {
  return process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
}

function getL1RpcUrl(): string {
  return process.env.LIVE_L1_RPC_URL ?? 'http://localhost:8545';
}

function getL1BeaconUrl(): string {
  return process.env.LIVE_L1_BEACON_URL ?? 'https://ethereum-sepolia-beacon-api.publicnode.com';
}

function getSeedPhrase(): string {
  return process.env.LIVE_SEED_PHRASE ?? DEFAULT_TEST_MNEMONIC;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Ensure no active (non-Terminated) stacks exist before deploying.
 * Local Docker uses fixed ports, so concurrent stacks cause conflicts.
 */
export async function ensureNoActiveStacks(): Promise<void> {
  const backendUrl = getBackendUrl();
  const token = await loginBackend(backendUrl);

  const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return; // can't check — proceed anyway

  const body = await resp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const stacks = (data.stacks as Record<string, unknown>[]) ?? [];

  const active = stacks.filter(
    (s) => (s.status as string) !== 'Terminated'
  );

  if (active.length === 0) {
    console.log('[deploy] No active stacks — safe to deploy');
    return;
  }

  console.log(`[deploy] Found ${active.length} active stack(s), terminating...`);
  for (const stack of active) {
    const id = stack.id as string;
    console.log(`[deploy] Terminating ${id} (status: ${stack.status})...`);
    await fetch(`${backendUrl}/api/v1/stacks/thanos/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Wait for all to terminate
  await pollUntil(
    async () => {
      const checkResp = await fetch(`${backendUrl}/api/v1/stacks/thanos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!checkResp.ok) return null;
      const checkBody = await checkResp.json() as Record<string, unknown>;
      const checkData = (checkBody.data ?? checkBody) as Record<string, unknown>;
      const remaining = ((checkData.stacks as Record<string, unknown>[]) ?? []).filter(
        (s) => (s.status as string) !== 'Terminated'
      );
      return remaining.length === 0 ? true : null;
    },
    'all stacks to terminate',
    TEARDOWN_TIMEOUT_MS,
    TEARDOWN_POLL_INTERVAL_MS
  );

  console.log('[deploy] All stacks terminated — safe to deploy');
}

/**
 * Deploy an L2 stack via the preset-deploy API.
 * Automatically ensures no active stacks exist before deploying.
 *
 * @param config - Deployment configuration (preset, feeToken, chainName)
 * @returns Stack ID and deployment ID from the API response
 */
export async function deployPreset(config: {
  preset: Preset;
  feeToken: FeeToken;
  chainName: string;
}): Promise<DeployResult> {
  // Ensure no active stacks (local Docker has fixed ports)
  await ensureNoActiveStacks();

  const backendUrl = getBackendUrl();
  const token = await loginBackend(backendUrl);

  const body: DeployRequest = {
    presetId: config.preset,
    chainName: config.chainName,
    network: process.env.LIVE_NETWORK ?? 'Testnet',
    infraProvider: process.env.LIVE_INFRA_PROVIDER ?? 'local',
    seedPhrase: getSeedPhrase(),
    l1RpcUrl: getL1RpcUrl(),
    l1BeaconUrl: getL1BeaconUrl(),
    feeToken: config.feeToken,
  };

  console.log(`[deploy] Starting preset-deploy: ${config.preset}/${config.feeToken} as "${config.chainName}"`);

  const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos/preset-deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `preset-deploy failed: ${resp.status} ${resp.statusText}\n${text}`
    );
  }

  const result = await resp.json() as Record<string, unknown>;
  const data = (result.data ?? result) as Record<string, unknown>;

  const deploymentId = (data.deploymentId ?? data.deployment_id ?? '') as string;
  const directStackId = (data.stackId ?? data.stack_id ?? data.id ?? '') as string;

  if (!deploymentId && !directStackId) {
    throw new Error(`preset-deploy returned no IDs: ${JSON.stringify(result)}`);
  }

  // Resolve actual stackId.
  // The backend's preset-deploy API returns the stack UUID as "deploymentId" (misleading name).
  // Use it directly rather than re-fetching by chainName, which could match stale stacks.
  let resolvedStackId = directStackId;
  if (!resolvedStackId && deploymentId) {
    resolvedStackId = deploymentId;
    console.log(`[deploy] using returned id as stackId: ${resolvedStackId}`);
  }

  if (!resolvedStackId) {
    throw new Error(
      `Could not resolve stackId for chainName="${config.chainName}". deploymentId=${deploymentId}`
    );
  }

  console.log(`[deploy] Initiated: stackId=${resolvedStackId}, deploymentId=${deploymentId}`);
  return { stackId: resolvedStackId, deploymentId };
}

/**
 * Poll the stack status until it reaches 'Deployed' (or fails).
 *
 * @param stackId - Stack ID to monitor
 * @param timeoutMs - Maximum wait time (default 20 min)
 * @returns Final stack status
 */
export async function waitForDeployed(
  stackId: string,
  timeoutMs = DEPLOY_TIMEOUT_MS
): Promise<StackStatus> {
  const backendUrl = getBackendUrl();
  const token = await loginBackend(backendUrl);

  const terminalStatuses = ['Deployed', 'FailedToDeploy', 'Failed', 'Terminated'];

  const status = await pollUntil<StackStatus>(
    async () => {
      const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos/${stackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) return null;

      const body = await resp.json() as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const stack = (data.stack ?? data) as Record<string, unknown>;
      const currentStatus = (stack.status as string) ?? 'Unknown';
      const chainName = ((stack.config as Record<string, unknown>)?.chainName as string) ?? '';

      console.log(`[deploy] Stack ${stackId}: ${currentStatus}`);

      if (terminalStatuses.includes(currentStatus)) {
        return { id: stackId, status: currentStatus, chainName };
      }

      return null;
    },
    `stack ${stackId} to reach terminal status`,
    timeoutMs,
    DEPLOY_POLL_INTERVAL_MS
  );

  if (status.status !== 'Deployed') {
    throw new Error(
      `Stack ${stackId} reached status "${status.status}" instead of "Deployed"`
    );
  }

  console.log(`[deploy] Stack ${stackId} is Deployed`);
  return status;
}

/**
 * Terminate (destroy) a stack and wait for it to be fully terminated.
 *
 * @param stackId - Stack ID to terminate
 * @param timeoutMs - Maximum wait time (default 5 min)
 */
export async function teardownStack(
  stackId: string,
  timeoutMs = TEARDOWN_TIMEOUT_MS
): Promise<void> {
  const backendUrl = getBackendUrl();
  const token = await loginBackend(backendUrl);

  console.log(`[teardown] Terminating stack ${stackId}...`);

  const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos/${stackId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.warn(`[teardown] DELETE returned ${resp.status}: ${text}`);
    // Don't throw — stack may already be terminated
  }

  await pollUntil<true>(
    async () => {
      const statusResp = await fetch(`${backendUrl}/api/v1/stacks/thanos/${stackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!statusResp.ok) return true; // 404 = already gone

      const body = await statusResp.json() as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const stack = (data.stack ?? data) as Record<string, unknown>;
      const status = (stack.status as string) ?? '';

      console.log(`[teardown] Stack ${stackId}: ${status}`);

      if (status === 'Terminated' || status === '') return true;
      return null;
    },
    `stack ${stackId} teardown`,
    timeoutMs,
    TEARDOWN_POLL_INTERVAL_MS
  );

  console.log(`[teardown] Stack ${stackId} terminated`);
}
