/**
 * Fault Proof helpers — DisputeGameFactory, AnchorStateRegistry, op-challenger K8s checks.
 *
 * Used by fault-proof.live.spec.ts and electron-full-aws.live.spec.ts to verify
 * that the Full Suite preset correctly deploys and runs OP Stack fault proof infrastructure.
 *
 * Challenge period for Full preset testnet is 12s — games resolve very quickly.
 * outputRootFrequency is 600s — first game creation takes ~10 min after deployment.
 */

import { ethers } from 'ethers';
import { execSync } from 'child_process';
import { pollUntil } from './poll';

// ---------------------------------------------------------------------------
// ABIs (minimal — only functions needed for E2E verification)
// ---------------------------------------------------------------------------

const DISPUTE_GAME_FACTORY_ABI = [
  'function gameCount() external view returns (uint256)',
  'function gameAtIndex(uint256 _index) external view returns (uint8 gameType, uint64 timestamp, address gameProxy)',
  'function gameImpls(uint32 _gameType) external view returns (address)',
];

const ANCHOR_STATE_REGISTRY_ABI = [
  'function anchors(uint32 gameType) external view returns (bytes32 root, uint256 l2BlockNumber)',
];

const FAULT_DISPUTE_GAME_ABI = [
  'function status() external view returns (uint8)',
  'function resolve() external',
  'function createdAt() external view returns (uint64)',
];

const DELAYED_WETH_ABI = [
  'function version() external view returns (string)',
];

// GameStatus enum (OP Stack)
export const GameStatus = {
  IN_PROGRESS: 0,
  CHALLENGER_WINS: 1,
  DEFENDER_WINS: 2,
} as const;

// ---------------------------------------------------------------------------
// Contract checks
// ---------------------------------------------------------------------------

/**
 * Verify DisputeGameFactory is deployed (has bytecode) and has at least one
 * game implementation registered (type 0 = CANNON).
 */
export async function checkDisputeGameFactoryDeployed(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<{ gameCount: number; cannonImpl: string }> {
  const code = await provider.getCode(address);
  if (code === '0x' || code.length <= 4) {
    throw new Error(`DisputeGameFactory at ${address} has no bytecode`);
  }

  const dgf = new ethers.Contract(address, DISPUTE_GAME_FACTORY_ABI, provider);
  const gameCount = Number(await dgf.gameCount());
  const cannonImpl = (await dgf.gameImpls(0)) as string;

  if (cannonImpl === ethers.ZeroAddress) {
    throw new Error(`DisputeGameFactory: CANNON implementation not registered (gameImpls(0) == address(0))`);
  }

  return { gameCount, cannonImpl };
}

/**
 * Verify AnchorStateRegistry is initialized — its anchors(0) must return a
 * non-zero L2 block number (set by tokamak-deployer during initialization).
 */
export async function checkAnchorStateRegistryInit(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<{ root: string; l2BlockNumber: number }> {
  const code = await provider.getCode(address);
  if (code === '0x' || code.length <= 4) {
    throw new Error(`AnchorStateRegistry at ${address} has no bytecode`);
  }

  const asr = new ethers.Contract(address, ANCHOR_STATE_REGISTRY_ABI, provider);
  const [root, l2BlockNumber] = await asr.anchors(0);
  const blockNum = Number(l2BlockNumber);

  if (blockNum === 0) {
    throw new Error(`AnchorStateRegistry anchors(0).l2BlockNumber is 0 — initialize() was not called`);
  }

  return { root: root as string, l2BlockNumber: blockNum };
}

/**
 * Verify DelayedWETH is deployed by calling version().
 * Absence of this contract causes initDisputeGameFactory to fail.
 */
export async function checkDelayedWethDeployed(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<string> {
  const code = await provider.getCode(address);
  if (code === '0x' || code.length <= 4) {
    throw new Error(`DelayedWETH at ${address} has no bytecode`);
  }

  const weth = new ethers.Contract(address, DELAYED_WETH_ABI, provider);
  const version = (await weth.version()) as string;
  return version;
}

// ---------------------------------------------------------------------------
// Game polling
// ---------------------------------------------------------------------------

/**
 * Poll DisputeGameFactory.gameCount() until the first game appears.
 * Returns the index (0) of the first game.
 *
 * @param provider   - L1 JSON-RPC provider
 * @param dgfAddress - DisputeGameFactory proxy address
 * @param timeoutMs  - Max wait (default 25 min — outputRootFrequency 600s + buffer)
 */
export async function waitForFirstGame(
  provider: ethers.JsonRpcProvider,
  dgfAddress: string,
  timeoutMs = 25 * 60 * 1000,
): Promise<number> {
  console.log(`[fault-proof] Waiting for first dispute game at ${dgfAddress}...`);

  const dgf = new ethers.Contract(dgfAddress, DISPUTE_GAME_FACTORY_ABI, provider);

  return pollUntil<number>(
    async () => {
      const count = Number(await dgf.gameCount());
      console.log(`[fault-proof] DisputeGameFactory.gameCount() = ${count}`);
      return count > 0 ? 0 : null;
    },
    'first dispute game to be created',
    timeoutMs,
    30_000,
  );
}

/**
 * Poll a FaultDisputeGame until it reaches DEFENDER_WINS (status = 2).
 *
 * The Full preset testnet challengePeriod is 12s — games resolve quickly after
 * the challenge window closes. Poll every 10s with a 5-minute timeout.
 *
 * @param provider   - L1 JSON-RPC provider
 * @param dgfAddress - DisputeGameFactory proxy address
 * @param gameIndex  - Index of the game to monitor
 * @param timeoutMs  - Max wait (default 5 min)
 */
export async function waitForGameResolution(
  provider: ethers.JsonRpcProvider,
  dgfAddress: string,
  gameIndex: number,
  timeoutMs = 5 * 60 * 1000,
): Promise<{ gameAddress: string; status: number }> {
  console.log(`[fault-proof] Resolving game at index ${gameIndex}...`);

  const dgf = new ethers.Contract(dgfAddress, DISPUTE_GAME_FACTORY_ABI, provider);
  const [, , gameAddress] = await dgf.gameAtIndex(gameIndex);
  const game = new ethers.Contract(gameAddress as string, FAULT_DISPUTE_GAME_ABI, provider);

  console.log(`[fault-proof] Game proxy address: ${gameAddress as string}`);

  return pollUntil<{ gameAddress: string; status: number }>(
    async () => {
      const status = Number(await game.status());
      console.log(`[fault-proof] Game status: ${status} (0=IN_PROGRESS, 1=CHALLENGER_WINS, 2=DEFENDER_WINS)`);
      if (status === GameStatus.DEFENDER_WINS || status === GameStatus.CHALLENGER_WINS) {
        return { gameAddress: gameAddress as string, status };
      }
      return null;
    },
    `game ${gameAddress as string} to resolve`,
    timeoutMs,
    10_000,
  );
}

/**
 * Check AnchorStateRegistry.anchors(0) has been updated after game resolution.
 * Compares against the initial anchor state — expects the L2 block number to increase.
 *
 * @param provider   - L1 JSON-RPC provider
 * @param asrAddress - AnchorStateRegistry proxy address
 * @param initialL2BlockNumber - Block number from checkAnchorStateRegistryInit()
 */
export async function checkAnchorStateUpdated(
  provider: ethers.JsonRpcProvider,
  asrAddress: string,
  initialL2BlockNumber: number,
): Promise<{ root: string; l2BlockNumber: number }> {
  const asr = new ethers.Contract(asrAddress, ANCHOR_STATE_REGISTRY_ABI, provider);
  const [root, l2BlockNumber] = await asr.anchors(0);
  const blockNum = Number(l2BlockNumber);

  if (blockNum <= initialL2BlockNumber) {
    throw new Error(
      `AnchorStateRegistry not updated: block ${blockNum} <= initial ${initialL2BlockNumber}. ` +
      `Game may not have resolved yet or anchors() was not updated by op-challenger.`
    );
  }

  return { root: root as string, l2BlockNumber: blockNum };
}

// ---------------------------------------------------------------------------
// K8s / op-challenger checks (AWS deployment only)
// ---------------------------------------------------------------------------

/**
 * Verify op-challenger pod is Running in EKS.
 * Runs aws eks update-kubeconfig then kubectl get pods.
 *
 * @param clusterName - EKS cluster name (e.g. "trh-full-usdc")
 * @param namespace   - K8s namespace (default "default")
 * @param region      - AWS region (default E2E_AWS_REGION or ap-northeast-2)
 */
export function checkOpChallengerK8s(
  clusterName: string,
  namespace = 'default',
  region = process.env.E2E_AWS_REGION ?? 'ap-northeast-2',
): { running: boolean; podName: string; status: string } {
  console.log(`[fault-proof] Checking op-challenger in cluster ${clusterName}...`);

  try {
    execSync(
      `aws eks update-kubeconfig --name "${clusterName}" --region "${region}" 2>&1`,
      { encoding: 'utf-8', timeout: 30_000 },
    );
  } catch (err) {
    throw new Error(
      `Failed to update kubeconfig for cluster "${clusterName}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let output: string;
  try {
    output = execSync(
      `kubectl get pods -n "${namespace}" -l app=op-challenger --no-headers 2>&1`,
      { encoding: 'utf-8', timeout: 15_000 },
    );
  } catch (err) {
    throw new Error(
      `kubectl get pods failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const lines = output.trim().split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    throw new Error(`No op-challenger pods found in cluster "${clusterName}" namespace "${namespace}"`);
  }

  // First line: NAME  READY  STATUS  RESTARTS  AGE
  const parts = lines[0].split(/\s+/);
  const podName = parts[0] ?? '';
  const podStatus = parts[2] ?? '';

  console.log(`[fault-proof] op-challenger pod: ${podName} (${podStatus})`);

  return {
    running: podStatus === 'Running',
    podName,
    status: podStatus,
  };
}
