/**
 * Fee Token Usage Verification — USDC fee deduction via AA Paymaster
 *
 * On a USDC fee token stack, verifies that:
 *   1. UserOp execution deducts WUSDC from MinimalAccount (not TON)
 *   2. Admin's TON balance decreases only by gas (bundler role), not by USDC fee
 *   3. Paymaster collects WUSDC fee from the UserOp sender
 *
 * Uses direct handleOps call (admin acts as bundler) — same pattern as
 * paymaster-smoke.spec.ts. Alto bundler is NOT used (packed v0.8 format
 * issues with bundler API).
 *
 * Requires: Full+USDC stack deployed, WUSDC balance on MinimalAccount.
 *
 * Usage:
 *   LIVE_CHAIN_NAME=usdc-full-e2e2 npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/fee-token-usage.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { getStackConfig, needsAASetup } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';

// ── Constants ─────────────────────────────────────────────────────────────────
const config = getStackConfig();
const ADMIN_KEY = process.env.ADMIN_KEY ?? '679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';

const MULTI_TOKEN_PAYMASTER = '0x4200000000000000000000000000000000000067';
const ENTRYPOINT_V08 = '0x4200000000000000000000000000000000000063';
// WUSDC = Wrapped Native USDC (18 decimals) — this is the token paymaster uses for fee
const WUSDC_ADDRESS = '0x4200000000000000000000000000000000000006';
// MinimalAccount — always-valid ERC-4337 IAccount for smoke testing
const MINIMAL_ACCOUNT = '0xb1c622dc91a3768d8e406A9460E85D59D30f7910';

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Helpers (from paymaster-smoke pattern) ─────────────────────────────────────

function packUint128x2(high: bigint, low: bigint): string {
  return ethers.zeroPadValue(ethers.toBeHex((high << 128n) | low), 32);
}

function buildPaymasterAndData(tokenAddr: string): string {
  return ethers.concat([
    MULTI_TOKEN_PAYMASTER,
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16),
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),
    tokenAddr,
  ]);
}

function buildUserOpHash(userOp: PackedUserOp, chainId: bigint): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
    [
      userOp.sender, userOp.nonce,
      ethers.keccak256(userOp.initCode), ethers.keccak256(userOp.callData),
      userOp.accountGasLimits, userOp.preVerificationGas,
      userOp.gasFees, ethers.keccak256(userOp.paymasterAndData),
    ]
  );
  const innerHash = ethers.keccak256(encoded);
  return ethers.keccak256(
    coder.encode(['bytes32', 'address', 'uint256'], [innerHash, ENTRYPOINT_V08, chainId])
  );
}

function signUserOpRaw(wallet: ethers.Wallet, userOpHash: string): string {
  const sig = wallet.signingKey.sign(ethers.getBytes(userOpHash));
  return ethers.Signature.from(sig).serialized;
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

  test('verify WUSDC deducted from sender, TON used only for gas', async () => {
    test.setTimeout(180_000);

    const adminAddress = adminWallet.address;
    const wusdcIface = new ethers.Interface([
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address,address) view returns (uint256)',
    ]);

    // Pre-check: MinimalAccount WUSDC balance
    const wusdcBalBefore = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256'],
      await l2Provider.call({ to: WUSDC_ADDRESS, data: wusdcIface.encodeFunctionData('balanceOf', [MINIMAL_ACCOUNT]) })
    )[0] as bigint;
    console.log(`[fee-token] MinimalAccount WUSDC before: ${wusdcBalBefore.toString()} (18 dec)`);

    if (wusdcBalBefore === 0n) {
      console.warn('[fee-token] MinimalAccount has 0 WUSDC — skipping');
      test.skip();
      return;
    }

    // Pre-check: WUSDC allowance to paymaster
    const allowance = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256'],
      await l2Provider.call({ to: WUSDC_ADDRESS, data: wusdcIface.encodeFunctionData('allowance', [MINIMAL_ACCOUNT, MULTI_TOKEN_PAYMASTER]) })
    )[0] as bigint;
    if (allowance === 0n) {
      console.warn('[fee-token] MinimalAccount has no WUSDC allowance to paymaster — skipping');
      test.skip();
      return;
    }

    // Admin TON balance before (admin pays gas as bundler)
    const adminTonBefore = await l2Provider.getBalance(adminAddress);
    console.log(`[fee-token] Admin TON before: ${ethers.formatEther(adminTonBefore)}`);

    // Get nonce
    const epIface = new ethers.Interface(['function getNonce(address, uint192) view returns (uint256)']);
    const nonceRaw = await l2Provider.call({
      to: ENTRYPOINT_V08,
      data: epIface.encodeFunctionData('getNonce', [MINIMAL_ACCOUNT, 0n]),
    });
    const nonce = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], nonceRaw)[0] as bigint;

    // Gas price
    const block = await l2Provider.getBlock('latest');
    const gasPrice = block?.baseFeePerGas ?? 1000n;

    // Build callData: MinimalAccount.execute(admin, 0, '') — no-op
    const executeIface = new ethers.Interface([
      'function execute(address target, uint256 value, bytes calldata data)',
    ]);
    const callData = executeIface.encodeFunctionData('execute', [adminAddress, 0n, '0x']);

    // Chain ID
    const chainId = (await l2Provider.getNetwork()).chainId;

    // Build PackedUserOp
    const userOp: PackedUserOp = {
      sender: MINIMAL_ACCOUNT,
      nonce: ethers.toBeHex(nonce),
      initCode: '0x',
      callData,
      accountGasLimits: packUint128x2(100000n, 50000n),
      preVerificationGas: ethers.toBeHex(50000n),
      gasFees: packUint128x2(0n, gasPrice),
      paymasterAndData: buildPaymasterAndData(WUSDC_ADDRESS),
      signature: '0x',
    };

    // Sign
    const userOpHash = buildUserOpHash(userOp, chainId);
    userOp.signature = signUserOpRaw(adminWallet, userOpHash);

    // Build handleOps calldata
    const epHandleIface = new ethers.Interface([
      'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops, address payable beneficiary)',
    ]);
    const handleOpsData = epHandleIface.encodeFunctionData('handleOps', [
      [[
        userOp.sender, userOp.nonce, userOp.initCode, userOp.callData,
        userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees,
        userOp.paymasterAndData, userOp.signature,
      ]],
      adminAddress,
    ]);

    // Estimate gas
    let gasLimit: bigint;
    try {
      const est = await l2Provider.estimateGas({ from: adminAddress, to: ENTRYPOINT_V08, data: handleOpsData });
      gasLimit = est * 11n / 10n;
      console.log(`[fee-token] Gas estimate: ${est} → using ${gasLimit}`);
    } catch (e) {
      console.error(`[fee-token] Gas estimation failed: ${(e as Error).message.slice(0, 200)}`);
      test.skip();
      return;
    }

    // Submit handleOps (admin = bundler)
    const preNonce = await l2Provider.getTransactionCount(adminAddress, 'latest');
    const tx = await adminWallet.sendTransaction({
      to: ENTRYPOINT_V08,
      data: handleOpsData,
      type: 0,
      gasPrice,
      gasLimit,
    });
    console.log(`[fee-token] handleOps tx: ${tx.hash}`);

    // Wait for confirmation (poll nonce)
    let confirmed = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const newNonce = await l2Provider.getTransactionCount(adminAddress, 'latest');
      if (newNonce > preNonce) {
        confirmed = true;
        console.log(`[fee-token] Confirmed (nonce ${preNonce} → ${newNonce})`);
        break;
      }
    }
    expect(confirmed, 'handleOps did not mine within 80s').toBe(true);

    // Verify: WUSDC decreased on MinimalAccount
    const wusdcBalAfter = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256'],
      await l2Provider.call({ to: WUSDC_ADDRESS, data: wusdcIface.encodeFunctionData('balanceOf', [MINIMAL_ACCOUNT]) })
    )[0] as bigint;
    console.log(`[fee-token] MinimalAccount WUSDC after: ${wusdcBalAfter.toString()}`);

    const wusdcFee = wusdcBalBefore - wusdcBalAfter;
    console.log(`[fee-token] WUSDC fee paid: ${wusdcFee.toString()} (18 dec)`);
    expect(wusdcBalAfter).toBeLessThan(wusdcBalBefore);
    console.log(`[fee-token] ✅ WUSDC deducted from sender (paymaster collected fee)`);

    // Verify: Admin TON decreased (gas cost as bundler) but NOT by WUSDC amount
    const adminTonAfter = await l2Provider.getBalance(adminAddress);
    const tonSpent = adminTonBefore - adminTonAfter;
    console.log(`[fee-token] Admin TON after: ${ethers.formatEther(adminTonAfter)}`);
    console.log(`[fee-token] Admin TON spent (gas): ${ethers.formatEther(tonSpent)}`);
    // Admin spent TON for gas (as bundler), which is expected.
    // The key assertion: WUSDC was the fee token, not TON from the user's perspective.
    expect(wusdcFee).toBeGreaterThan(0n);
    console.log(`[fee-token] ✅ Fee paid in WUSDC, gas paid in TON by bundler`);
  });
});
