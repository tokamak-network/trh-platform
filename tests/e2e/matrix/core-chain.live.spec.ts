/**
 * Matrix Health Check — Core Chain (Tier 1)
 *
 * Runs for ALL presets. Verifies L2 RPC liveness, chain ID, block production,
 * op-node sync status, and a simple ETH transfer on the L2.
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/core-chain.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import {
  checkL2Rpc,
  checkL2ChainId,
  checkBlockProduction,
  checkOpNodeSync,
} from '../helpers/health-checks';
import { ethers } from 'ethers';

const config = getStackConfig();
let urls: StackUrls;

const ADMIN_KEY =
  process.env.ADMIN_KEY ??
  '679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';

test.describe(`Core Chain Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    urls = await resolveStackUrls(config.chainName);
  });

  test('L2 RPC alive', async () => {
    const blockNumber = await checkL2Rpc(urls.l2Rpc);
    expect(blockNumber).toBeGreaterThan(0);
  });

  test('L2 chain ID matches', async () => {
    const chainId = await checkL2ChainId(urls.l2Rpc);
    expect(chainId).toBe(urls.l2ChainId);
  });

  test('blocks advancing', async () => {
    const result = await checkBlockProduction(urls.l2Rpc, 30_000);
    expect(result.newBlocks).toBeGreaterThan(0);
  });

  test('op-node sync status', async () => {
    const sync = await checkOpNodeSync();
    expect(sync.headL2).toBeGreaterThan(0);
    expect(sync.safeL2).toBeGreaterThan(0);
  });

  test('simple native token transfer on L2', async () => {
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const wallet = new ethers.Wallet(ADMIN_KEY, provider);

    // Check balance first — on TON stacks the admin may have 0 native balance
    // until funds are bridged from L1
    const balance = await provider.getBalance(wallet.address);
    if (balance === 0n) {
      console.log(`[core-chain] Admin L2 balance is 0 (native token: ${config.feeToken}) — skipping transfer test`);
      test.skip();
      return;
    }

    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther('0.0001'),
    });
    const receipt = await tx.wait();

    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe(1);
  });
});
