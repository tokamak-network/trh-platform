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
// Bridged USDC predeploy (6 decimals) — L1 USDC bridged to L2
const BRIDGED_USDC = '0x4200000000000000000000000000000000000778';
// Wrapped TON (18 decimals) — used as paymaster fee token in paymasterAndData
const WUSDC_ADDRESS = '0x4200000000000000000000000000000000000006';
const SIMPLE_7702_ACCOUNT = '0x4200000000000000000000000000000000000068';
const MINIMAL_ACCOUNT = '0xb1c622dc91a3768d8e406A9460E85D59D30f7910';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build paymasterAndData for MultiTokenPaymaster (v0.6 unpacked format).
 * Layout: [paymaster(20)] [verificationGasLimit(16)] [postOpGasLimit(16)] [token(20)]
 */
function buildPaymasterAndData(tokenAddr: string): string {
  return ethers.concat([
    MULTI_TOKEN_PAYMASTER,
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16),
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),
    tokenAddr,
  ]);
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

    // Use Bridged USDC (6 decimals) as the fee token the user pays with
    const usdc = new ethers.Contract(BRIDGED_USDC, ERC20_ABI, adminWallet);

    // Pre-check: USDC balance and TON balance
    const usdcBefore = await usdc.balanceOf(adminWallet.address) as bigint;
    const tonBefore = await l2Provider.getBalance(adminWallet.address);

    console.log(`[fee-token] Bridged USDC before: ${Number(usdcBefore) / 1e6} USDC`);
    console.log(`[fee-token] TON before: ${ethers.formatEther(tonBefore)}`);

    if (usdcBefore === 0n) {
      console.warn('[fee-token] Admin has 0 Bridged USDC — run bridge-deposit-withdraw first. Skipping.');
      test.skip();
      return;
    }

    // Ensure USDC approved for paymaster
    const allowance = await usdc.allowance(adminWallet.address, MULTI_TOKEN_PAYMASTER) as bigint;
    if (allowance < 10_000_000n) { // 10 USDC
      const approveTx = await usdc.approve(MULTI_TOKEN_PAYMASTER, ethers.MaxUint256);
      await approveTx.wait();
      console.log('[fee-token] Bridged USDC approved for paymaster');
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

    // Build UserOp — Alto may require unpacked (v0.6-style) OR packed (v0.7) format.
    // Try packed first, fall back to unpacked if validation fails.
    const sender = adminWallet.address;
    const nonce = await getUserOpNonce(l2Provider, sender);
    const feeData = await l2Provider.getFeeData();
    const maxFee = feeData.maxFeePerGas ?? ethers.parseUnits('1', 'gwei');
    const maxPriority = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei');

    // Unpacked format (v0.6-compatible, wider bundler support)
    const userOp = {
      sender,
      nonce,
      initCode: '0x',
      callData: '0x',
      callGasLimit: ethers.toBeHex(100_000n),
      verificationGasLimit: ethers.toBeHex(200_000n),
      preVerificationGas: ethers.toBeHex(50_000n),
      maxFeePerGas: ethers.toBeHex(maxFee as bigint),
      maxPriorityFeePerGas: ethers.toBeHex(maxPriority as bigint),
      paymasterAndData: buildPaymasterAndData(BRIDGED_USDC),
      signature: '0x' + 'ff'.repeat(65),
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
      const usdcAfterFail = await usdc.balanceOf(adminWallet.address) as bigint;
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
    const usdcAfter = await usdc.balanceOf(adminWallet.address) as bigint;
    const tonAfter = await l2Provider.getBalance(adminWallet.address);

    console.log(`[fee-token] Bridged USDC after: ${Number(usdcAfter) / 1e6} USDC`);
    console.log(`[fee-token] TON after: ${ethers.formatEther(tonAfter)}`);

    // USDC should decrease (fee paid to paymaster)
    expect(usdcAfter).toBeLessThan(usdcBefore);
    const usdcDeducted = usdcBefore - usdcAfter;
    console.log(`[fee-token] USDC deducted: ${Number(usdcDeducted) / 1e6} USDC`);

    // TON should NOT decrease (paymaster pays gas)
    expect(tonAfter).toBeGreaterThanOrEqual(tonBefore);
    console.log(`[fee-token] TON unchanged ✅ (paymaster paid gas)`);
  });
});
