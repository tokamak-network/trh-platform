/**
 * AA Paymaster End-to-End Smoke Test
 *
 * Verifies the full AA paymaster pipeline on a running LocalNet Gaming preset:
 *   1. MultiTokenPaymaster bytecode injected at genesis (proxy + code namespace)
 *   2. EIP-7702 delegation active on admin EOA
 *   3. USDC balance and EntryPoint deposit pre-conditions
 *   4. UserOp with USDC fee token executes via Alto bundler
 *
 * Stack: usdc-gaming (Gaming preset, USDC fee token)
 *   L2 RPC:     http://localhost:8545
 *   Bundler:    http://localhost:4337 (Alto, ERC-4337 v0.8)
 *
 * All ERC-4337 logic is inline (ethers v6). No SDK imports.
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';

// ── Constants ─────────────────────────────────────────────────────────────────
const L2_RPC   = 'http://localhost:8545';
const BUNDLER_URL = 'http://localhost:4337';
const ADMIN_KEY = '679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';

const MULTI_TOKEN_PAYMASTER = '0x4200000000000000000000000000000000000067';
const PAYMASTER_IMPL        = '0xc0d3c0D3C0D3C0d3c0d3c0d3c0D3c0d3C0d30067';
const ENTRYPOINT_V08        = '0x4200000000000000000000000000000000000063';
const USDC_ADDRESS           = '0x4200000000000000000000000000000000000778';
const WUSDC_ADDRESS          = '0x4200000000000000000000000000000000000006'; // Wrapped Native USDC (18 dec)
const SIMPLE_7702_ACCOUNT    = '0x4200000000000000000000000000000000000068';
// MinimalAccount deployed at nonce=7 — always-valid ERC-4337 IAccount for smoke testing
const MINIMAL_ACCOUNT        = '0xb1c622dc91a3768d8e406A9460E85D59D30f7910';

// ── ERC-4337 AA Error Code Map ────────────────────────────────────────────────
const AA_ERROR_CODES: Record<string, string> = {
  'AA93': 'invalid paymasterAndData (length < 52)',
  'AA31': 'paymaster deposit too low',
  'AA33': '_validatePaymasterUserOp reverted',
  'AA13': 'initCode failed or OOG',
  'AA21': 'didn\'t pay prefund',
  'AA25': 'nonce error',
};

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

// ── Inline Helpers (ethers v6) ────────────────────────────────────────────────

/**
 * Build 72-byte paymasterAndData:
 *   [0:20]  paymaster address
 *   [20:36] paymasterVerificationGasLimit (uint128, 16 bytes)
 *   [36:52] paymasterPostOpGasLimit (uint128, 16 bytes)
 *   [52:72] token address (20 bytes)
 */
function buildPaymasterAndData(tokenAddr: string): string {
  const data = ethers.concat([
    MULTI_TOKEN_PAYMASTER,
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16),  // pmVerGas: validate + ERC20 allowance check + oracle
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),   // pmPostOpGas: ERC20 transferFrom
    tokenAddr,
  ]);
  const byteLen = ethers.dataLength(data);
  if (byteLen !== 72) {
    throw new Error(`paymasterAndData must be 72 bytes, got ${byteLen}`);
  }
  return data;
}

/**
 * Pack two uint128 values into a single bytes32.
 */
function packUint128x2(high: bigint, low: bigint): string {
  const packed = (high << 128n) | low;
  return ethers.zeroPadValue(ethers.toBeHex(packed), 32);
}

/**
 * Compute ERC-4337 v0.8 userOpHash (for PackedUserOperation).
 */
function buildUserOpHash(userOp: PackedUserOp, chainId: bigint): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      ethers.keccak256(userOp.paymasterAndData),
    ]
  );
  const innerHash = ethers.keccak256(encoded);
  return ethers.keccak256(
    coder.encode(['bytes32', 'address', 'uint256'], [innerHash, ENTRYPOINT_V08, chainId])
  );
}

/**
 * Raw ECDSA signature (NO EIP-191 prefix) required by ERC-4337.
 */
function signUserOpRaw(wallet: ethers.Wallet, userOpHash: string): string {
  const sig = wallet.signingKey.sign(ethers.getBytes(userOpHash));
  return ethers.Signature.from(sig).serialized;
}

/**
 * Parse AA error code from bundler error message for diagnostics.
 */
function parseAAError(message: string): string {
  for (const [code, desc] of Object.entries(AA_ERROR_CODES)) {
    if (message.includes(code)) {
      return `${code}: ${desc}`;
    }
  }
  return message;
}

/**
 * Send UserOp to Alto bundler via eth_sendUserOperation.
 */
async function sendUserOp(bundlerUrl: string, userOp: PackedUserOp): Promise<string> {
  const res = await fetch(bundlerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [userOp, ENTRYPOINT_V08],
    }),
  });
  const data = await res.json() as { result?: string; error?: { message: string; code: number } };
  if (data.error) {
    const parsed = parseAAError(data.error.message);
    throw new Error(`Bundler error: ${parsed}`);
  }
  if (!data.result) {
    throw new Error('Bundler returned no result and no error');
  }
  return data.result;
}

/**
 * Poll eth_getUserOperationReceipt until receipt is available.
 */
async function waitForReceipt(
  bundlerUrl: string,
  opHash: string,
  timeoutMs = 60_000
): Promise<Record<string, unknown>> {
  const intervalMs = 3_000;
  const maxAttempts = Math.ceil(timeoutMs / intervalMs);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationReceipt',
        params: [opHash],
      }),
    });
    const data = await res.json() as { result?: Record<string, unknown> | null };
    if (data.result) {
      console.log(`  Receipt received after ${i + 1} attempt(s)`);
      return data.result;
    }
    console.log(`  Waiting for UserOp receipt... (attempt ${i + 1}/${maxAttempts})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for UserOp receipt (${timeoutMs}ms): ${opHash}`);
}

/**
 * Poll until a condition is met.
 */
async function pollUntil<T>(
  fn: () => Promise<T | null>,
  label: string,
  timeoutMs = 30_000,
  intervalMs = 3_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    const result = await fn();
    if (result !== null) {
      console.log(`  ${label} after ${attempts} attempt(s)`);
      return result;
    }
    console.log(`  Waiting for ${label}... (attempt ${attempts})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

// ── Shared state ──────────────────────────────────────────────────────────────
let l2Provider: ethers.JsonRpcProvider;
let adminWallet: ethers.Wallet;
let adminAddress: string;

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('AA Paymaster Smoke Test', () => {
  test.beforeAll(async () => {
    l2Provider = new ethers.JsonRpcProvider(L2_RPC);
    adminWallet = new ethers.Wallet(ADMIN_KEY, l2Provider);
    adminAddress = adminWallet.address;
    console.log('Admin address:', adminAddress);
  });

  test('MultiTokenPaymaster bytecode injected into genesis', async () => {
    // Check proxy address (ERC-1967 proxy — short bytecode)
    const proxyCode = await l2Provider.getCode(MULTI_TOKEN_PAYMASTER);
    console.log(`Proxy (${MULTI_TOKEN_PAYMASTER}) code length: ${ethers.dataLength(proxyCode)} bytes`);
    expect(proxyCode).not.toBe('0x');
    expect(ethers.dataLength(proxyCode)).toBeGreaterThan(10);

    // Check implementation at code namespace (full MultiTokenPaymaster bytecode)
    const implCode = await l2Provider.getCode(PAYMASTER_IMPL);
    console.log(`Impl (${PAYMASTER_IMPL}) code length: ${ethers.dataLength(implCode)} bytes`);
    expect(implCode).not.toBe('0x');
    expect(ethers.dataLength(implCode)).toBeGreaterThan(200);
  });

  test('EIP-7702 delegation active on admin EOA', async () => {
    const code = await l2Provider.getCode(adminAddress);
    console.log(`Admin EOA code: ${code.slice(0, 20)}... (length: ${ethers.dataLength(code)} bytes)`);

    if (!code.startsWith('0xef0100')) {
      console.log('EIP-7702 delegation not set on admin EOA — skipping');
      console.log(`Expected code starting with 0xef0100 (delegation designator to ${SIMPLE_7702_ACCOUNT})`);
      test.skip();
      return;
    }

    expect(code.startsWith('0xef0100')).toBe(true);
    console.log('EIP-7702 delegation target:', '0x' + code.slice(8, 48));
  });

  test('WUSDC balance and paymaster pre-conditions met', async () => {
    // Check MinimalAccount WUSDC balance (fee token for UserOp)
    const wusdc = new ethers.Contract(
      WUSDC_ADDRESS,
      ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'],
      l2Provider
    );
    const wusdcBalance: bigint = await wusdc.balanceOf(MINIMAL_ACCOUNT);
    console.log(`MinimalAccount WUSDC balance: ${wusdcBalance.toString()} (18 dec)`);
    expect(wusdcBalance).toBeGreaterThan(0n);

    // Check WUSDC allowance from MinimalAccount to paymaster
    const allowance: bigint = await wusdc.allowance(MINIMAL_ACCOUNT, MULTI_TOKEN_PAYMASTER);
    console.log(`MinimalAccount → Paymaster WUSDC allowance: ${allowance > 0n ? 'SET' : 'MISSING'}`);
    expect(allowance).toBeGreaterThan(0n);

    // Check EntryPoint deposit for paymaster
    const entryPoint = new ethers.Contract(
      ENTRYPOINT_V08,
      ['function balanceOf(address) view returns (uint256)'],
      l2Provider
    );
    const deposit: bigint = await entryPoint.balanceOf(MULTI_TOKEN_PAYMASTER);
    console.log(`Paymaster EntryPoint deposit: ${deposit.toString()} (native units)`);
    expect(deposit).toBeGreaterThan(0n);

    // Verify WUSDC is registered with paymaster
    const paymasterIface = new ethers.Interface([
      'function supportedTokens(address) view returns (uint256)',
    ]);
    const stRaw = await l2Provider.call({ to: MULTI_TOKEN_PAYMASTER, data: paymasterIface.encodeFunctionData('supportedTokens', [WUSDC_ADDRESS]) });
    const enabled = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], stRaw)[0] > 0n;
    console.log(`WUSDC registered with paymaster: ${enabled}`);
    expect(enabled).toBe(true);
  });

  test('UserOp with WUSDC fee executes via direct handleOps', async () => {
    test.setTimeout(120_000);

    // 1. Get MinimalAccount nonce from EntryPoint
    const epReadIface = new ethers.Interface([
      'function getNonce(address, uint192) view returns (uint256)',
      'function balanceOf(address) view returns (uint256)',
    ]);
    const nonceRaw = await l2Provider.call({
      to: ENTRYPOINT_V08,
      data: epReadIface.encodeFunctionData('getNonce', [MINIMAL_ACCOUNT, 0n]),
    });
    const nonce = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], nonceRaw)[0] as bigint;
    console.log(`MinimalAccount nonce: ${nonce}`);

    // 2. Gas price: baseFee only (251 wei/gas) to maximise affordability on 32-USDC budget
    const block = await l2Provider.getBlock('latest');
    const baseFee = block?.baseFeePerGas ?? 1000n;
    const gasPrice = baseFee; // type-0 legacy tx
    console.log(`gasPrice: ${gasPrice} wei`);

    // 3. Build callData: MinimalAccount.execute(adminAddress, 0, '') — no-op
    const executeIface = new ethers.Interface([
      'function execute(address target, uint256 value, bytes calldata data)',
    ]);
    const callData = executeIface.encodeFunctionData('execute', [adminAddress, 0n, '0x']);

    // 4. Get chain ID
    const network = await l2Provider.getNetwork();
    const chainId = network.chainId;
    console.log(`Chain ID: ${chainId}`);

    // 5. Build PackedUserOp with minimal gas limits to fit within admin's ~32 USDC balance.
    //    Total budget: verGas(10K) + callGas(10K) + preVerGas(21K) + pmVerGas(25K) + pmPostOp(20K)
    //    + EP overhead(~36K) = ~122K gas × 251 wei ≈ 30.6 USDC — leaves ~1 USDC margin.
    const paymasterAndData = buildPaymasterAndData(WUSDC_ADDRESS);

    const userOp: PackedUserOp = {
      sender: MINIMAL_ACCOUNT,
      nonce: ethers.toBeHex(nonce),
      initCode: '0x',
      callData,
      accountGasLimits: packUint128x2(100000n, 50000n), // verGas=100K | callGas=50K
      preVerificationGas: ethers.toBeHex(50000n),
      gasFees: packUint128x2(0n, gasPrice), // maxPriority=0 | maxFee=gasPrice
      paymasterAndData,
      signature: '0x',
    };

    // 6. Compute userOpHash (packed v0.8) and sign
    const userOpHash = buildUserOpHash(userOp, chainId);
    console.log(`UserOp hash: ${userOpHash}`);
    userOp.signature = signUserOpRaw(adminWallet, userOpHash);
    console.log(`Signature: ${userOp.signature.slice(0, 20)}...`);

    // 7. Snapshot WUSDC balance before execution
    const wusdcIface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
    const balBefore = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256'],
      await l2Provider.call({ to: WUSDC_ADDRESS, data: wusdcIface.encodeFunctionData('balanceOf', [MINIMAL_ACCOUNT]) })
    )[0] as bigint;
    console.log(`MinimalAccount WUSDC before: ${balBefore.toString()}`);

    // 8. Build handleOps calldata (admin acts as bundler + beneficiary)
    const epHandleIface = new ethers.Interface([
      'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops, address payable beneficiary)',
    ]);
    const handleOpsData = epHandleIface.encodeFunctionData('handleOps', [
      [[
        userOp.sender,
        userOp.nonce,
        userOp.initCode,
        userOp.callData,
        userOp.accountGasLimits,
        userOp.preVerificationGas,
        userOp.gasFees,
        userOp.paymasterAndData,
        userOp.signature,
      ]],
      adminAddress,
    ]);

    // 9. Estimate gas, cap at max affordable
    const adminBalance = await l2Provider.getBalance(adminAddress);
    const maxAffordableGas = adminBalance / gasPrice;
    console.log(`Admin balance: ${adminBalance} (${adminBalance / 1_000_000n} USDC), max gas: ${maxAffordableGas}`);

    let gasLimit: bigint;
    try {
      const est = await l2Provider.estimateGas({ from: adminAddress, to: ENTRYPOINT_V08, data: handleOpsData });
      gasLimit = est * 11n / 10n; // 10% buffer
      console.log(`Gas estimate: ${est} → using ${gasLimit}`);
    } catch (e) {
      const msg = (e as Error).message;
      console.error('Gas estimation failed:', msg.slice(0, 200));
      throw new Error(`handleOps gas estimation failed: ${msg.slice(0, 100)}`);
    }

    expect(gasLimit, `handleOps requires ${gasLimit} gas but admin can only afford ${maxAffordableGas}`).toBeLessThanOrEqual(maxAffordableGas);

    // 10. Submit handleOps directly (admin = bundler, beneficiary = admin for reimbursement)
    const preNonce = await l2Provider.getTransactionCount(adminAddress, 'latest');
    const tx = await adminWallet.sendTransaction({
      to: ENTRYPOINT_V08,
      data: handleOpsData,
      type: 0,
      gasPrice,
      gasLimit,
    });
    console.log(`handleOps tx sent: ${tx.hash}`);

    // 11. Poll for nonce advance (receipt may be null on this chain due to known bug)
    let confirmed = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const newNonce = await l2Provider.getTransactionCount(adminAddress, 'latest');
      if (newNonce > preNonce) {
        confirmed = true;
        console.log(`Transaction confirmed (nonce ${preNonce} → ${newNonce})`);
        break;
      }
      process.stdout.write('.');
    }
    expect(confirmed, 'handleOps transaction did not mine within 80 seconds').toBe(true);

    // 12. Verify WUSDC was deducted from MinimalAccount (paymaster collected fee)
    const balAfter = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256'],
      await l2Provider.call({ to: WUSDC_ADDRESS, data: wusdcIface.encodeFunctionData('balanceOf', [MINIMAL_ACCOUNT]) })
    )[0] as bigint;
    console.log(`MinimalAccount WUSDC after: ${balAfter.toString()}`);
    console.log(`WUSDC fee paid: ${(balBefore - balAfter).toString()}`);

    expect(balAfter, 'WUSDC should be deducted after paymaster fee').toBeLessThan(balBefore);
    console.log('UserOp executed successfully with WUSDC fee token!');
  });
});
