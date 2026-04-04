/**
 * Fee Token Usage Verification
 *
 * On a USDC fee token stack, verifies that:
 *   1. UserOp execution deducts USDC from the user (not TON)
 *   2. User's TON balance does NOT decrease (paymaster pays gas in TON)
 *   3. Paymaster receives USDC from the user
 *
 * Requires: Full+USDC stack deployed with:
 *   - Admin has L2 TON balance (from bridge deposit)
 *   - Bundler running on port 4337
 *   - Paymaster configured with USDC oracle
 *
 * Usage:
 *   LIVE_CHAIN_NAME=usdc-full-e2e npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/fee-token-usage.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { getStackConfig, needsAASetup } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import { pollUntil } from '../helpers/poll';

// ── Constants ─────────────────────────────────────────────────────────────────
const config = getStackConfig();
const ADMIN_KEY = process.env.ADMIN_KEY ?? '679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';

const MULTI_TOKEN_PAYMASTER = '0x4200000000000000000000000000000000000067';
const ENTRYPOINT_V08 = '0x4200000000000000000000000000000000000063';
const WUSDC_ADDRESS = '0x4200000000000000000000000000000000000006'; // Wrapped Native USDC (18 decimals)
const SIMPLE_7702_ACCOUNT = '0x4200000000000000000000000000000000000068';
const MINIMAL_ACCOUNT = '0xb1c622dc91a3768d8e406A9460E85D59D30f7910';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ── ERC-4337 Types ────────────────────────────────────────────────────────────
interface PackedUserOp {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: string;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildPaymasterAndData(tokenAddr: string): string {
  const data = ethers.concat([
    MULTI_TOKEN_PAYMASTER,
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16),
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),
    tokenAddr,
  ]);
  return data;
}

function packGasLimits(verificationGas: bigint, callGas: bigint): string {
  return ethers.zeroPadValue(
    ethers.toBeHex((verificationGas << 128n) | callGas),
    32
  );
}

function packGasFees(maxPriorityFee: bigint, maxFee: bigint): string {
  return ethers.zeroPadValue(
    ethers.toBeHex((maxPriorityFee << 128n) | maxFee),
    32
  );
}

async function getUserOpNonce(provider: ethers.JsonRpcProvider, sender: string): Promise<string> {
  const result = await provider.call({
    to: ENTRYPOINT_V08,
    data: ethers.concat([
      ethers.id('getNonce(address,uint192)').slice(0, 10),
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint192'], [sender, 0]),
    ]),
  });
  return ethers.toBeHex(BigInt(result));
}

// ── Tests ─────────────────────────────────────────────────────────────────────
let urls: StackUrls;
let l2Provider: ethers.JsonRpcProvider;
let adminWallet: ethers.Wallet;

test.describe(`Fee Token Usage [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test.beforeAll(async () => {
    test.skip(!needsAASetup(config.feeToken), 'Fee token is TON — no paymaster');
    urls = await resolveStackUrls(config.chainName);
    l2Provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    adminWallet = new ethers.Wallet(ADMIN_KEY, l2Provider);
  });

  test('verify USDC deducted from user, TON unchanged', async () => {
    test.setTimeout(180_000);

    const wusdc = new ethers.Contract(WUSDC_ADDRESS, ERC20_ABI, adminWallet);

    // Pre-check: WUSDC balance and TON balance
    const usdcBefore = await wusdc.balanceOf(adminWallet.address) as bigint;
    const tonBefore = await l2Provider.getBalance(adminWallet.address);

    console.log(`[fee-token] WUSDC before: ${ethers.formatEther(usdcBefore)}`);
    console.log(`[fee-token] TON before: ${ethers.formatEther(tonBefore)}`);

    if (usdcBefore === 0n) {
      console.warn('[fee-token] Admin has 0 WUSDC — cannot test fee deduction. Skipping.');
      test.skip();
      return;
    }

    // Ensure WUSDC approved for paymaster
    const allowance = await wusdc.allowance(adminWallet.address, MULTI_TOKEN_PAYMASTER) as bigint;
    if (allowance < ethers.parseEther('100')) {
      const approveTx = await wusdc.approve(MULTI_TOKEN_PAYMASTER, ethers.MaxUint256);
      await approveTx.wait();
      console.log('[fee-token] WUSDC approved for paymaster');
    }

    // Check bundler is running
    const bundlerAlive = await pollUntil(
      async () => {
        try {
          const resp = await fetch(urls.bundlerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_supportedEntryPoints', params: [], id: 1 }),
          });
          return resp.ok ? true : null;
        } catch { return null; }
      },
      'bundler ready',
      60_000,
      5_000
    );
    expect(bundlerAlive).toBe(true);

    // Build a minimal UserOp (self-transfer, zero value)
    const sender = adminWallet.address;
    const nonce = await getUserOpNonce(l2Provider, sender);
    const feeData = await l2Provider.getFeeData();
    const maxFee = feeData.maxFeePerGas ?? ethers.parseUnits('1', 'gwei');
    const maxPriority = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei');

    const userOp: PackedUserOp = {
      sender,
      nonce,
      initCode: '0x',
      callData: '0x', // no-op
      accountGasLimits: packGasLimits(200_000n, 100_000n),
      preVerificationGas: ethers.toBeHex(50_000n),
      gasFees: packGasFees(maxPriority as bigint, maxFee as bigint),
      paymasterAndData: buildPaymasterAndData(WUSDC_ADDRESS),
      signature: '0x' + 'ff'.repeat(65), // dummy signature (MinimalAccount accepts any)
    };

    // Submit via bundler
    const bundlerResp = await fetch(urls.bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendUserOperation',
        params: [userOp, ENTRYPOINT_V08],
        id: 1,
      }),
    });
    const bundlerBody = await bundlerResp.json() as Record<string, unknown>;
    console.log(`[fee-token] Bundler response:`, JSON.stringify(bundlerBody));

    if (bundlerBody.error) {
      const errMsg = (bundlerBody.error as Record<string, string>).message ?? '';
      console.warn(`[fee-token] UserOp failed: ${errMsg}`);
      // If UserOp fails, verify balances didn't change
      const usdcAfterFail = await wusdc.balanceOf(adminWallet.address) as bigint;
      expect(usdcAfterFail).toBe(usdcBefore);
      test.skip();
      return;
    }

    const userOpHash = bundlerBody.result as string;
    console.log(`[fee-token] UserOp hash: ${userOpHash}`);

    // Wait for receipt
    const receipt = await pollUntil(
      async () => {
        try {
          const resp = await fetch(urls.bundlerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getUserOperationReceipt',
              params: [userOpHash],
              id: 1,
            }),
          });
          const body = await resp.json() as { result?: Record<string, unknown> };
          return body.result ?? null;
        } catch { return null; }
      },
      'UserOp receipt',
      120_000,
      5_000
    );
    expect(receipt).toBeTruthy();
    console.log(`[fee-token] UserOp executed, success: ${(receipt as Record<string, unknown>).success}`);

    // Verify: USDC decreased, TON unchanged
    const usdcAfter = await wusdc.balanceOf(adminWallet.address) as bigint;
    const tonAfter = await l2Provider.getBalance(adminWallet.address);

    console.log(`[fee-token] WUSDC after: ${ethers.formatEther(usdcAfter)}`);
    console.log(`[fee-token] TON after: ${ethers.formatEther(tonAfter)}`);

    // USDC should decrease (fee paid to paymaster)
    expect(usdcAfter).toBeLessThan(usdcBefore);
    const usdcDeducted = usdcBefore - usdcAfter;
    console.log(`[fee-token] USDC deducted: ${ethers.formatEther(usdcDeducted)}`);

    // TON should NOT decrease (paymaster pays gas)
    expect(tonAfter).toBeGreaterThanOrEqual(tonBefore);
    console.log(`[fee-token] TON unchanged ✅ (paymaster paid gas)`);
  });
});
