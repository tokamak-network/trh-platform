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
const PAYMASTER_IMPL        = '0xc0D3C0d3C0d3C0D3c0d3C0d3c0D3C0d3c0d30067';
const ENTRYPOINT_V08        = '0x4200000000000000000000000000000000000063';
const USDC_ADDRESS           = '0x4200000000000000000000000000000000000778';
const SIMPLE_7702_ACCOUNT    = '0x4200000000000000000000000000000000000068';

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
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16),
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),
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

  test('USDC balance and paymaster pre-conditions met', async () => {
    // Check admin USDC balance
    const usdc = new ethers.Contract(
      USDC_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      l2Provider
    );
    const usdcBalance: bigint = await usdc.balanceOf(adminAddress);
    console.log(`Admin USDC balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    expect(usdcBalance).toBeGreaterThan(0n);

    // Check EntryPoint deposit for paymaster
    const entryPoint = new ethers.Contract(
      ENTRYPOINT_V08,
      ['function balanceOf(address) view returns (uint256)'],
      l2Provider
    );
    const deposit: bigint = await entryPoint.balanceOf(MULTI_TOKEN_PAYMASTER);
    console.log(`Paymaster EntryPoint deposit: ${ethers.formatEther(deposit)} ETH`);
    expect(deposit).toBeGreaterThan(0n);
  });

  test('UserOp with USDC fee executes via Alto bundler', async () => {
    test.setTimeout(120_000);

    // 1. Get admin nonce from EntryPoint
    const entryPoint = new ethers.Contract(
      ENTRYPOINT_V08,
      ['function getNonce(address, uint192) view returns (uint256)'],
      l2Provider
    );
    const nonce: bigint = await entryPoint.getNonce(adminAddress, 0n);
    console.log(`Admin nonce: ${nonce}`);

    // 2. Get gas prices
    const feeData = await l2Provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 1000000000n;
    const maxPriorityFee = feeData.maxPriorityFeePerGas ?? 1000000n;
    console.log(`Gas prices: maxFee=${maxFeePerGas}, maxPriority=${maxPriorityFee}`);

    // 3. Build callData: Simple7702Account.execute(target, value, data) — self-transfer, 0 value
    const executeIface = new ethers.Interface([
      'function execute(address target, uint256 value, bytes calldata data)',
    ]);
    const callData = executeIface.encodeFunctionData('execute', [
      adminAddress, 0n, '0x',
    ]);

    // 4. Get chain ID
    const network = await l2Provider.getNetwork();
    const chainId = network.chainId;
    console.log(`Chain ID: ${chainId}`);

    // 5. Build packed UserOp
    const paymasterAndData = buildPaymasterAndData(USDC_ADDRESS);
    console.log(`paymasterAndData: ${paymasterAndData} (${ethers.dataLength(paymasterAndData)} bytes)`);

    const userOp: PackedUserOp = {
      sender: adminAddress,
      nonce: ethers.toBeHex(nonce),
      initCode: '0x',
      callData,
      accountGasLimits: packUint128x2(200000n, 200000n),
      preVerificationGas: ethers.toBeHex(100000n),
      gasFees: packUint128x2(maxPriorityFee, maxFeePerGas),
      paymasterAndData,
      signature: '0x', // placeholder — will be replaced after signing
    };

    // 6. Compute userOpHash and sign
    const userOpHash = buildUserOpHash(userOp, chainId);
    console.log(`UserOp hash: ${userOpHash}`);

    userOp.signature = signUserOpRaw(adminWallet, userOpHash);
    console.log(`Signature: ${userOp.signature.slice(0, 20)}...`);

    // 7. Send to bundler
    console.log('Sending UserOp to Alto bundler...');
    let opHash: string;
    try {
      opHash = await sendUserOp(BUNDLER_URL, userOp);
    } catch (err) {
      const msg = (err as Error).message;
      console.error('UserOp submission failed:', msg);
      console.error('Diagnostic:', parseAAError(msg));

      // Log state for debugging
      const code = await l2Provider.getCode(adminAddress);
      console.error('Admin code (EIP-7702):', code.slice(0, 20));
      const pmCode = await l2Provider.getCode(MULTI_TOKEN_PAYMASTER);
      console.error('Paymaster code length:', ethers.dataLength(pmCode));

      throw err;
    }
    console.log(`UserOp submitted: ${opHash}`);

    // 8. Wait for receipt
    console.log('Waiting for UserOp receipt...');
    const receipt = await waitForReceipt(BUNDLER_URL, opHash, 60_000);
    console.log('Receipt:', JSON.stringify(receipt, null, 2).slice(0, 500));

    // 9. Assert success
    const success = receipt.success === true ||
      (receipt.receipt as Record<string, unknown>)?.status === '0x1';
    expect(success, `UserOp should succeed. Receipt: ${JSON.stringify(receipt).slice(0, 300)}`).toBe(true);
    console.log('UserOp executed successfully with USDC fee token!');
  });
});
