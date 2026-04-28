/**
 * Fault Proof Verification — Standalone matrix spec (no Electron, API-deployed stack)
 *
 * Verifies that the Full Suite preset correctly deploys and operates OP Stack fault proof
 * infrastructure. Designed to run against an already-deployed stack (set LIVE_STACK_ID).
 *
 * Prerequisites:
 *   - Full Suite preset deployed (fault proof enabled)
 *   - LIVE_STACK_ID set to the stack's UUID
 *   - LIVE_L1_RPC_URL set (Sepolia L1 RPC)
 *   - For AWS: LIVE_CLUSTER_NAME set (EKS cluster name), E2E_AWS_REGION set
 *
 * Test IDs:
 *   FP-01 — DisputeGameFactory deployed + CANNON impl registered
 *   FP-02 — AnchorStateRegistry initialized (anchors(0).l2BlockNumber > 0)
 *   FP-03 — DelayedWETH deployed (version() callable)
 *   FP-04 — op-challenger K8s pod Running (AWS only; skipped for local)
 *   FP-05 — First dispute game created (polls gameCount > 0, up to 25 min)
 *   FP-06 — Game reaches DEFENDER_WINS (12s challenge period, up to 5 min after FP-05)
 *   FP-07 — AnchorStateRegistry anchors(0) updated after game resolution
 *
 * Usage:
 *   LIVE_STACK_ID=<uuid> LIVE_L1_RPC_URL=<sepolia-rpc> \
 *     npx playwright test --config playwright.live.config.ts \
 *     tests/e2e/matrix/fault-proof.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { resolveContractAddresses } from '../helpers/stack-resolver';
import {
  checkDisputeGameFactoryDeployed,
  checkAnchorStateRegistryInit,
  checkDelayedWethDeployed,
  checkOpChallengerK8s,
  waitForFirstGame,
  waitForGameResolution,
  checkAnchorStateUpdated,
  GameStatus,
} from '../helpers/fault-proof';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LIVE_STACK_ID = process.env.LIVE_STACK_ID ?? '';
const LIVE_L1_RPC_URL = process.env.LIVE_L1_RPC_URL ?? 'http://localhost:8545';
const LIVE_CLUSTER_NAME = process.env.LIVE_CLUSTER_NAME ?? '';
const LIVE_INFRA_PROVIDER = (process.env.LIVE_INFRA_PROVIDER ?? 'local') as 'local' | 'aws';
const E2E_AWS_REGION = process.env.E2E_AWS_REGION ?? 'ap-northeast-2';

// Timeouts
const FIRST_GAME_TIMEOUT_MS = 25 * 60 * 1000; // 25 min (outputRootFrequency 600s + buffer)
const GAME_RESOLVE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min (challengePeriod 12s + op-challenger latency)

// ---------------------------------------------------------------------------
// State (shared across serial tests)
// ---------------------------------------------------------------------------

let l1Provider: ethers.JsonRpcProvider;
let dgfAddress: string;
let asrAddress: string;
let delayedWethAddress: string;
let initialAnchorBlock: number;
let firstGameIndex: number;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Fault Proof [Full/AWS]', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (!LIVE_STACK_ID) {
      throw new Error('LIVE_STACK_ID env var is required for fault-proof spec');
    }

    l1Provider = new ethers.JsonRpcProvider(LIVE_L1_RPC_URL);

    const addresses = await resolveContractAddresses(LIVE_STACK_ID);
    dgfAddress = addresses.disputeGameFactoryProxy;
    asrAddress = addresses.anchorStateRegistryProxy ?? '';
    delayedWethAddress = addresses.delayedWethProxy ?? '';

    console.log('[fp] Contract addresses:');
    console.log(`[fp]   DisputeGameFactory:    ${dgfAddress}`);
    console.log(`[fp]   AnchorStateRegistry:   ${asrAddress}`);
    console.log(`[fp]   DelayedWETH:           ${delayedWethAddress}`);
  });

  // -------------------------------------------------------------------------
  // FP-01: DisputeGameFactory deployed + CANNON impl registered
  // -------------------------------------------------------------------------

  test('FP-01: DisputeGameFactory deployed with CANNON implementation', async () => {
    test.setTimeout(60_000);

    expect(dgfAddress, 'DisputeGameFactory address must be resolved from deployment JSON').toBeTruthy();

    const { cannonImpl, gameCount } = await checkDisputeGameFactoryDeployed(l1Provider, dgfAddress);

    expect(cannonImpl).not.toBe(ethers.ZeroAddress);
    expect(cannonImpl).toMatch(/^0x[0-9a-fA-F]{40}$/);
    console.log(`[FP-01] DisputeGameFactory: gameCount=${gameCount}, CANNON impl=${cannonImpl} ✓`);
  });

  // -------------------------------------------------------------------------
  // FP-02: AnchorStateRegistry initialized
  // -------------------------------------------------------------------------

  test('FP-02: AnchorStateRegistry initialized with non-zero L2 block number', async () => {
    test.setTimeout(60_000);

    expect(asrAddress, 'AnchorStateRegistry address must be resolved').toBeTruthy();

    const { root, l2BlockNumber } = await checkAnchorStateRegistryInit(l1Provider, asrAddress);
    initialAnchorBlock = l2BlockNumber;

    expect(l2BlockNumber).toBeGreaterThan(0);
    console.log(`[FP-02] AnchorStateRegistry: root=${root}, l2BlockNumber=${l2BlockNumber} ✓`);
  });

  // -------------------------------------------------------------------------
  // FP-03: DelayedWETH deployed
  // -------------------------------------------------------------------------

  test('FP-03: DelayedWETH deployed and version() callable', async () => {
    test.setTimeout(60_000);

    expect(delayedWethAddress, 'DelayedWETH address must be resolved').toBeTruthy();

    const version = await checkDelayedWethDeployed(l1Provider, delayedWethAddress);
    console.log(`[FP-03] DelayedWETH: version=${version} ✓`);
  });

  // -------------------------------------------------------------------------
  // FP-04: op-challenger K8s pod Running (AWS only)
  // -------------------------------------------------------------------------

  test('FP-04: op-challenger pod Running in EKS', async () => {
    test.setTimeout(60_000);

    if (LIVE_INFRA_PROVIDER !== 'aws') {
      console.log('[FP-04] Skipping — not an AWS deployment (LIVE_INFRA_PROVIDER != aws)');
      test.skip();
      return;
    }

    expect(LIVE_CLUSTER_NAME, 'LIVE_CLUSTER_NAME must be set for AWS K8s check').toBeTruthy();

    const result = checkOpChallengerK8s(LIVE_CLUSTER_NAME, 'default', E2E_AWS_REGION);

    expect(result.running, `op-challenger pod must be Running, got "${result.status}"`).toBe(true);
    console.log(`[FP-04] op-challenger: pod=${result.podName}, status=${result.status} ✓`);
  });

  // -------------------------------------------------------------------------
  // FP-05: First dispute game created
  // -------------------------------------------------------------------------

  test('FP-05: first dispute game created (polls up to 25 min)', async () => {
    test.setTimeout(FIRST_GAME_TIMEOUT_MS + 60_000);

    expect(dgfAddress).toBeTruthy();

    firstGameIndex = await waitForFirstGame(l1Provider, dgfAddress, FIRST_GAME_TIMEOUT_MS);
    console.log(`[FP-05] First dispute game at index ${firstGameIndex} ✓`);
  });

  // -------------------------------------------------------------------------
  // FP-06: Game resolves DEFENDER_WINS
  // -------------------------------------------------------------------------

  test('FP-06: game at index 0 resolves DEFENDER_WINS', async () => {
    test.setTimeout(GAME_RESOLVE_TIMEOUT_MS + 60_000);

    expect(dgfAddress).toBeTruthy();

    const { gameAddress, status } = await waitForGameResolution(
      l1Provider,
      dgfAddress,
      firstGameIndex,
      GAME_RESOLVE_TIMEOUT_MS,
    );

    expect(status).toBe(GameStatus.DEFENDER_WINS);
    console.log(`[FP-06] Game ${gameAddress} resolved: DEFENDER_WINS (status=${status}) ✓`);
  });

  // -------------------------------------------------------------------------
  // FP-07: AnchorStateRegistry updated after resolution
  // -------------------------------------------------------------------------

  test('FP-07: AnchorStateRegistry anchors(0) updated after game resolution', async () => {
    test.setTimeout(2 * 60_000);

    expect(asrAddress).toBeTruthy();

    const { root, l2BlockNumber } = await checkAnchorStateUpdated(
      l1Provider,
      asrAddress,
      initialAnchorBlock,
    );

    expect(l2BlockNumber).toBeGreaterThan(initialAnchorBlock);
    console.log(
      `[FP-07] AnchorStateRegistry updated: l2BlockNumber=${l2BlockNumber} > initial=${initialAnchorBlock}, root=${root} ✓`
    );
  });
});
