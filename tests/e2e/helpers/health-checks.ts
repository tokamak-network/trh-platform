/**
 * L2 Health Check Functions — Verify core chain liveness via RPC.
 *
 * Used by matrix verification tests to confirm L2 is responsive before
 * running module-specific assertions.
 */

import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Check L2 RPC is reachable and return the current block number.
 *
 * @param rpcUrl - L2 JSON-RPC endpoint
 * @returns Current block number
 */
export async function checkL2Rpc(rpcUrl: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  try {
    const blockNumber = await provider.getBlockNumber();
    return blockNumber;
  } catch (err) {
    throw new Error(
      `L2 RPC unreachable at ${rpcUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Get the chain ID from the L2 RPC endpoint.
 *
 * @param rpcUrl - L2 JSON-RPC endpoint
 * @returns Chain ID as a number
 */
export async function checkL2ChainId(rpcUrl: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  try {
    const network = await provider.getNetwork();
    return Number(network.chainId);
  } catch (err) {
    throw new Error(
      `Failed to get chain ID from ${rpcUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Query the op-node's optimism_syncStatus JSON-RPC method.
 *
 * @param opNodeUrl - op-node JSON-RPC endpoint (default: http://localhost:9545)
 * @returns Sync status with L1 head and L2 head/safe block numbers
 */
export async function checkOpNodeSync(
  opNodeUrl = 'http://localhost:9545'
): Promise<{ currentL1: number; headL2: number; safeL2: number }> {
  const resp = await fetch(opNodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'optimism_syncStatus',
      params: [],
      id: 1,
    }),
  });

  if (!resp.ok) {
    throw new Error(`op-node unreachable at ${opNodeUrl}: ${resp.status} ${resp.statusText}`);
  }

  const body = await resp.json() as Record<string, unknown>;
  const result = body.result as Record<string, unknown> | undefined;

  if (!result) {
    throw new Error(`op-node returned no result: ${JSON.stringify(body)}`);
  }

  const currentL1 = (result.current_l1 as Record<string, unknown> | undefined);
  const headL2 = (result.unsafe_l2 as Record<string, unknown> | undefined);
  const safeL2 = (result.safe_l2 as Record<string, unknown> | undefined);

  return {
    currentL1: (currentL1?.number as number) ?? 0,
    headL2: (headL2?.number as number) ?? 0,
    safeL2: (safeL2?.number as number) ?? 0,
  };
}

/**
 * Verify that the L2 chain is producing new blocks.
 *
 * Gets the block number, waits `waitMs`, and checks that the block number
 * increased. Returns start, end, and the delta.
 *
 * @param rpcUrl - L2 JSON-RPC endpoint
 * @param waitMs - How long to wait between checks (default: 5000ms)
 */
export async function checkBlockProduction(
  rpcUrl: string,
  waitMs = 5000
): Promise<{ startBlock: number; endBlock: number; newBlocks: number }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const startBlock = await provider.getBlockNumber();
  await new Promise(r => setTimeout(r, waitMs));
  const endBlock = await provider.getBlockNumber();

  return {
    startBlock,
    endBlock,
    newBlocks: endBlock - startBlock,
  };
}
