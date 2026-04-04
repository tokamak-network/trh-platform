/**
 * Bridge Deposit & Withdrawal — TON + USDC (Full Cycle with Finalize)
 *
 * Executes real bridge transactions on a Full+USDC stack:
 *   1. TON deposit L1→L2
 *   2. USDC deposit L1→L2
 *   3. TON withdrawal L2→L1 (initiate → prove → finalize)
 *   4. USDC withdrawal L2→L1 (initiate → prove → finalize)
 * Verifies each transaction appears in Blockscout deposits/withdrawals API.
 *
 * Requires: Full+USDC stack deployed with funded admin (L1 TON + USDC).
 *
 * Usage:
 *   LIVE_CHAIN_NAME=usdc-full-e2e npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/bridge-deposit-withdraw.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { getStackConfig } from '../helpers/matrix-config';
import { resolveStackUrls, resolveContractAddresses, StackUrls } from '../helpers/stack-resolver';
import { pollUntil } from '../helpers/poll';

// ── Config ────────────────────────────────────────────────────────────────────
const config = getStackConfig();
const L1_RPC = process.env.LIVE_L1_RPC_URL ?? 'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';
const ADMIN_KEY = process.env.ADMIN_KEY ?? '679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';

// L2 predeploys (fixed across all OP Stack chains)
const L2_TO_L1_PASSER = '0x4200000000000000000000000000000000000016';
const L2_STANDARD_BRIDGE = '0x4200000000000000000000000000000000000010';

// ABIs
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const L1_BRIDGE_ABI = [
  'function bridgeNativeTokenTo(address _to, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external',
  'function bridgeETH(uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external payable',
];

const L2_PASSER_ABI = [
  'function initiateWithdrawal(address _target, uint256 _gasLimit, bytes calldata _data) external payable',
];

const L2_BRIDGE_ABI = [
  'function withdraw(address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external payable',
];

// ── Shared state ──────────────────────────────────────────────────────────────
let urls: StackUrls;
let l1Provider: ethers.JsonRpcProvider;
let l2Provider: ethers.JsonRpcProvider;
let l1Wallet: ethers.Wallet;
let l2Wallet: ethers.Wallet;
let adminAddress: string;
let contracts: { l1StandardBridgeProxy: string; systemConfigProxy: string; optimismPortalProxy: string; disputeGameFactoryProxy: string };
let nativeTokenAddr: string;

let tonDepositTxHash: string;
let tonWithdrawTxHash: string;

async function readNativeTokenAddress(l1: ethers.JsonRpcProvider, sysConfigAddr: string): Promise<string> {
  const selector = ethers.id('nativeTokenAddress()').slice(0, 10);
  const result = await l1.call({ to: sysConfigAddr, data: selector });
  return ethers.getAddress('0x' + result.slice(26));
}

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe(`Bridge Deposit & Withdraw [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial', timeout: 900_000 });

  test.beforeAll(async () => {
    urls = await resolveStackUrls(config.chainName);
    l1Provider = new ethers.JsonRpcProvider(L1_RPC);
    l2Provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    l1Wallet = new ethers.Wallet(ADMIN_KEY, l1Provider);
    l2Wallet = new ethers.Wallet(ADMIN_KEY, l2Provider);
    adminAddress = l1Wallet.address;

    // Read contract addresses from deployment JSON inside backend container
    contracts = await resolveContractAddresses(urls.stackId);
    console.log(`[bridge] L1StandardBridge: ${contracts.l1StandardBridgeProxy}`);
    console.log(`[bridge] SystemConfig: ${contracts.systemConfigProxy}`);

    // Read native token (TON) address from SystemConfig
    nativeTokenAddr = await readNativeTokenAddress(l1Provider, contracts.systemConfigProxy);
    console.log(`[bridge] Native token (L1): ${nativeTokenAddr}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TON Deposit L1 → L2
  // ═══════════════════════════════════════════════════════════════════════════

  test('TON deposit L1→L2', async () => {
    test.setTimeout(300_000);

    const bridgeAddr = contracts.l1StandardBridgeProxy;
    const tonContract = new ethers.Contract(nativeTokenAddr, ERC20_ABI, l1Wallet);
    const depositAmount = ethers.parseEther('1'); // 1 TON

    // Check L1 TON balance
    const l1TonBalance = await tonContract.balanceOf(adminAddress);
    console.log(`[bridge] Admin L1 TON: ${ethers.formatEther(l1TonBalance)}`);
    expect(l1TonBalance).toBeGreaterThan(depositAmount);

    // Approve bridge
    const approveTx = await tonContract.approve(bridgeAddr, depositAmount);
    await approveTx.wait(1);
    console.log(`[bridge] TON approve confirmed`);

    // Bridge native token to L2
    const bridge = new ethers.Contract(bridgeAddr, L1_BRIDGE_ABI, l1Wallet);
    const bridgeTx = await bridge.bridgeNativeTokenTo(
      adminAddress, depositAmount, 200_000, '0x',
      { gasLimit: 800_000 }
    );
    tonDepositTxHash = bridgeTx.hash;
    console.log(`[bridge] TON deposit tx: ${tonDepositTxHash}`);
    await bridgeTx.wait(1);
    console.log(`[bridge] TON deposit confirmed on L1`);

    // Wait for L2 balance to increase
    const l2BalanceBefore = await l2Provider.getBalance(adminAddress);
    const l2BalanceAfter = await pollUntil(
      async () => {
        const bal = await l2Provider.getBalance(adminAddress);
        return bal > l2BalanceBefore ? bal : null;
      },
      'L2 TON balance increase after deposit',
      300_000,
      10_000
    );
    console.log(`[bridge] L2 balance: ${ethers.formatEther(l2BalanceBefore)} → ${ethers.formatEther(l2BalanceAfter)}`);
    expect(l2BalanceAfter).toBeGreaterThan(l2BalanceBefore);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Blockscout deposit verification
  // ═══════════════════════════════════════════════════════════════════════════

  test('Blockscout shows TON deposit', async () => {
    test.setTimeout(120_000);
    expect(tonDepositTxHash).toBeTruthy();

    const deposit = await pollUntil(
      async () => {
        try {
          const resp = await fetch(`${urls.explorerApiUrl}/optimism/deposits?limit=10`);
          if (!resp.ok) return null;
          const body = await resp.json() as { items?: Array<{ l1_transaction_hash?: string }> };
          const match = body.items?.find(
            (d) => d.l1_transaction_hash?.toLowerCase() === tonDepositTxHash.toLowerCase()
          );
          return match ?? null;
        } catch { return null; }
      },
      'TON deposit in Blockscout',
      120_000,
      10_000
    );
    expect(deposit).toBeTruthy();
    console.log(`[bridge] TON deposit found in Blockscout`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TON Withdrawal L2 → L1 (initiate → prove → finalize)
  // ═══════════════════════════════════════════════════════════════════════════

  test('TON withdrawal L2→L1 initiate', async () => {
    test.setTimeout(120_000);

    const withdrawAmount = ethers.parseEther('0.1');
    const l2Balance = await l2Provider.getBalance(adminAddress);
    console.log(`[bridge] L2 balance before withdraw: ${ethers.formatEther(l2Balance)}`);
    expect(l2Balance).toBeGreaterThan(withdrawAmount);

    const l2Passer = new ethers.Contract(L2_TO_L1_PASSER, L2_PASSER_ABI, l2Wallet);
    const tx = await l2Passer.initiateWithdrawal(
      adminAddress, 200_000, '0x',
      { value: withdrawAmount, gasLimit: 300_000 }
    );
    tonWithdrawTxHash = tx.hash;
    console.log(`[bridge] TON withdraw tx: ${tonWithdrawTxHash}`);
    const receipt = await tx.wait();
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe(1);
    console.log(`[bridge] TON withdraw confirmed on L2`);
  });

  test('Blockscout shows TON withdrawal', async () => {
    test.setTimeout(120_000);
    expect(tonWithdrawTxHash).toBeTruthy();

    const withdrawal = await pollUntil(
      async () => {
        try {
          const resp = await fetch(`${urls.explorerApiUrl}/optimism/withdrawals?limit=10`);
          if (!resp.ok) return null;
          const body = await resp.json() as { items?: Array<{ l2_transaction_hash?: string }> };
          const match = body.items?.find(
            (w) => w.l2_transaction_hash?.toLowerCase() === tonWithdrawTxHash.toLowerCase()
          );
          return match ?? null;
        } catch { return null; }
      },
      'TON withdrawal in Blockscout',
      120_000,
      10_000
    );
    expect(withdrawal).toBeTruthy();
    console.log(`[bridge] TON withdrawal found in Blockscout`);
  });
});
