/**
 * CrossTrade Live Transaction Tests
 *
 * Executes REAL CrossTrade transactions on a live deployed DeFi preset stack
 * and verifies each step of the L1-L2 and L2-L2 swap flows.
 *
 * Flow overview:
 *   L1-L2: L2 request → L1 provide → L2 claimCT (cross-domain message)
 *   L2-L2: L2 request → L1 relay provide → L2 claimCT (cross-domain message)
 *
 * Usage:
 *   LIVE_CHAIN_NAME=ect-defi-crosstrade \
 *   LIVE_L1_RPC_URL=https://eth-sepolia... \
 *   npx playwright test --config playwright.live.config.ts tests/e2e/crosstrade-tx.live.spec.ts
 *
 * Prerequisites:
 *   - DeFi preset stack deployed with CrossTrade integration
 *   - L2 RPC accessible (default: http://localhost:8545)
 *   - Sepolia L1 RPC accessible (set LIVE_L1_RPC_URL)
 *   - Admin wallet has ETH on both L1 (Sepolia) and L2
 *
 * Test IDs:
 *   CRT-01 — L1-L2: Request (L2CrossTradeProxy.requestNonRegisteredToken)
 *   CRT-02 — L1-L2: Provide (L1CrossTradeProxy.provideCT)
 *   CRT-03 — L1-L2: Claim verified (ProviderClaimCT event on L2)
 *   CRT-04 — L2-L2: Request (L2ToL2CrossTradeProxy.requestNonRegisteredToken)
 *   CRT-05 — L2-L2: Provide (L2toL2CrossTradeL1Proxy.provideCT)
 *   CRT-06 — L2-L2: Claim verified (ProviderClaimCT event on L2)
 *   CRT-07 — dApp UI pages accessible and screenshotted
 */

import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { resolveStackUrls, loginBackend, StackUrls } from './helpers/stack-resolver';
import { pollUntil } from './helpers/poll';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LIVE_CHAIN_NAME = process.env.LIVE_CHAIN_NAME ?? null;
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';

const L1_RPC =
  process.env.LIVE_L1_RPC_URL ??
  'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';

function resolveAdminKey(): string {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  const mnemonic = process.env.LIVE_SEED_PHRASE;
  if (mnemonic) {
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
    return wallet.privateKey;
  }
  // Deployment admin key for local DeFi preset stack
  return '6544462e611a9040a74d0fdfe3f00ed4b3c3e924a6f29165059c76e6e587e4ff';
}

const ADMIN_KEY = resolveAdminKey();

// Token addresses (ETH = native = address(0) on both chains)
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

// Trade amounts (tiny — just enough to verify the flow)
const TRADE_AMOUNT = ethers.parseEther('0.001');  // L2 amount locked by requester
const CT_AMOUNT    = ethers.parseEther('0.001');  // L1 amount sent by provider

// Timeouts
const TX_TIMEOUT_MS    = 2 * 60 * 1000;           // 2 min for individual TXs
const CLAIM_TIMEOUT_MS = 20 * 60 * 1000;          // 20 min for L1→L2 cross-domain message
const CLAIM_POLL_MS    = 15_000;                   // 15s poll interval

// Cross-domain message gas limit (passed to CDM.sendMessage)
const MIN_GAS_LIMIT = 200_000;

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

// L2CrossTradeProxy — request side
const L2_CT_ABI = [
  'function requestNonRegisteredToken(address _l1token, address _l2token, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 _l1chainId) external payable',
  'event NonRequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event RequestCT(address _l1token, address _l2token, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hashValue)',
  'event ProviderClaimCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

// L1CrossTradeProxy — provide side
const L1_CT_ABI = [
  'function provideCT(address _l1token, address _l2token, address _requestor, address _receiver, uint256 _totalAmount, uint256 _initialctAmount, uint256 _editedctAmount, uint256 _salecount, uint256 _l2chainId, uint32 _minGasLimit, bytes32 _hash) external payable',
  'event ProvideCT(address _l1token, address _l2token, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l2chainId, bytes32 _hash)',
];

// L2ToL2CrossTradeProxy — L2-L2 request side
const L2L2_L2_ABI = [
  'function requestNonRegisteredToken(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 _l1ChainId, uint256 _l2DestinationChainId) external payable',
  'event NonRequestCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l1ChainId, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hashValue)',
  'event RequestCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l1ChainId, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hashValue)',
  'event ProviderClaimCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 _l1ChainId, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hash)',
];

// L2toL2CrossTradeL1Proxy — L2-L2 provide side (on L1)
const L2L2_L1_ABI = [
  'function provideCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requestor, address _receiver, uint256 _totalAmount, uint256 _initialctAmount, uint256 _editedctAmount, uint256 _saleCount, uint256 _l2SourceChainId, uint256 _l2DestinationChainId, uint32 _minGasLimit, bytes32 _hash) external payable',
  'event ProvideCT(address _l1token, address _l2SourceToken, address _l2DestinationToken, address _requester, address _receiver, address _provider, uint256 _totalAmount, uint256 _ctAmount, uint256 indexed _saleCount, uint256 indexed _l2SourceChainId, uint256 indexed _l2DestinationChainId, bytes32 _hash)',
];

// ---------------------------------------------------------------------------
// Shared state (set in beforeAll)
// ---------------------------------------------------------------------------

let jwt: string;
let stackUrls: StackUrls;

// L2 contract addresses (from integration info)
let l2CrossTradeProxy: string;
let l2ToL2CrossTradeProxy: string;

// L1 contract addresses (derived from tx receipts)
let l1CrossTradeProxy: string;
let l2ToL2CrossTradeL1Proxy: string;

// Wallets
let l1Wallet: ethers.Wallet;
let l2Wallet: ethers.Wallet;
let l1Provider: ethers.JsonRpcProvider;
let l2Provider: ethers.JsonRpcProvider;
let adminAddress: string;

// L2 chain ID (resolved via eth_chainId)
let l2ChainId: bigint;

// L1-L2 request state
let l1l2SaleCount: bigint;
let l1l2HashValue: string;

// L2-L2 request state
let l2l2SaleCount: bigint;
let l2l2HashValue: string;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.describe('CrossTrade Transactions', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // Resolve stack config
    if (LIVE_CHAIN_NAME) {
      jwt = await loginBackend(BACKEND_URL);
      stackUrls = await resolveStackUrls(LIVE_CHAIN_NAME, jwt);
      console.log('[crt] Stack resolved:', stackUrls.stackId);
    } else {
      // Use local defaults — still need JWT for integration info
      jwt = await loginBackend(BACKEND_URL);
      // Fetch any deployed stack to get integration info
      const resp = await fetch(`${BACKEND_URL}/api/v1/stacks/thanos`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const body = await resp.json() as Record<string, unknown>;
      const data = body.data as Record<string, unknown>;
      const stacks = (data?.stacks as Record<string, unknown>[]) ?? [];
      const stack = stacks.find((s) => {
        const cfg = s.config as Record<string, unknown> | undefined;
        return cfg?.preset === 'defi' || cfg?.presetId === 'defi';
      });
      if (!stack) throw new Error('No DeFi preset stack found — deploy one first');

      stackUrls = {
        stackId: stack.id as string,
        l2ChainId: 0,
        l2Rpc: 'http://localhost:8545',
        bridgeUrl: 'http://localhost:3001',
        explorerUrl: 'http://localhost:4001',
        explorerApiUrl: 'http://localhost:4000/api/v2',
        grafanaUrl: 'http://localhost:3002',
        prometheusUrl: 'http://localhost:9090',
        uptimeUrl: 'http://localhost:3003',
        drbUrl: 'http://localhost:9600',
        bundlerUrl: 'http://localhost:4337',
        crossTradeUrl: 'http://localhost:3004',
      };
      console.log('[crt] Using local stack:', stackUrls.stackId);
    }

    // Fetch CrossTrade integration
    const intResp = await fetch(
      `${BACKEND_URL}/api/v1/stacks/thanos/${stackUrls.stackId}/integrations`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    expect(intResp.ok, `Failed to fetch integrations: ${intResp.status}`).toBe(true);

    const intBody = await intResp.json() as Record<string, unknown>;
    const intData = (intBody.data ?? intBody) as Record<string, unknown>;
    const integrations = (intData.integrations as Record<string, unknown>[]) ?? [];
    const crossTradeInt = integrations.find((i) => i.type === 'cross-trade');
    expect(crossTradeInt, 'CrossTrade integration not found').toBeDefined();
    expect(['installed', 'Completed']).toContain(crossTradeInt!.status);

    const info = (crossTradeInt!.info ?? {}) as Record<string, unknown>;
    const contracts = (info.contracts ?? {}) as Record<string, string>;

    // L2 contract addresses
    l2CrossTradeProxy    = contracts.l2_cross_trade_proxy;
    l2ToL2CrossTradeProxy = contracts.l2_to_l2_cross_trade_proxy;
    expect(l2CrossTradeProxy, 'l2_cross_trade_proxy missing').toBeTruthy();
    expect(l2ToL2CrossTradeProxy, 'l2_to_l2_cross_trade_proxy missing').toBeTruthy();
    console.log('[crt] L2CrossTradeProxy:', l2CrossTradeProxy);
    console.log('[crt] L2ToL2CrossTradeProxy:', l2ToL2CrossTradeProxy);

    l1Provider = new ethers.JsonRpcProvider(L1_RPC);
    l2Provider = new ethers.JsonRpcProvider(stackUrls.l2Rpc);

    // L1 contract addresses — env var overrides take priority over tx receipt derivation.
    // Use LIVE_L1_CROSS_TRADE_PROXY / LIVE_L2L2_L1_PROXY when the integration info
    // tx hashes point to outdated contracts (e.g. after manual redeployment).
    if (process.env.LIVE_L1_CROSS_TRADE_PROXY && process.env.LIVE_L2L2_L1_PROXY) {
      l1CrossTradeProxy     = process.env.LIVE_L1_CROSS_TRADE_PROXY;
      l2ToL2CrossTradeL1Proxy = process.env.LIVE_L2L2_L1_PROXY;
      console.log('[crt] L1 contracts from env vars (override)');
    } else {
      // Derive from setChainInfo tx receipts stored in integration info
      const l1RegTxHash  = info.l1_registration_tx_hash as string;
      const l1L2l2TxHash = info.l1_l2l2_tx_hash as string;
      expect(l1RegTxHash,  'l1_registration_tx_hash missing — set LIVE_L1_CROSS_TRADE_PROXY').toBeTruthy();
      expect(l1L2l2TxHash, 'l1_l2l2_tx_hash missing — set LIVE_L2L2_L1_PROXY').toBeTruthy();

      const receipt1 = await l1Provider.getTransactionReceipt(l1RegTxHash);
      expect(receipt1, `L1 registration tx not found: ${l1RegTxHash}`).not.toBeNull();
      l1CrossTradeProxy = receipt1!.to!;
      expect(l1CrossTradeProxy, 'L1CrossTradeProxy address (receipt.to) is null').toBeTruthy();

      const receipt2 = await l1Provider.getTransactionReceipt(l1L2l2TxHash);
      expect(receipt2, `L1 L2toL2 tx not found: ${l1L2l2TxHash}`).not.toBeNull();
      l2ToL2CrossTradeL1Proxy = receipt2!.to!;
      expect(l2ToL2CrossTradeL1Proxy, 'L2toL2CrossTradeL1Proxy address (receipt.to) is null').toBeTruthy();
    }

    console.log('[crt] L1CrossTradeProxy:', l1CrossTradeProxy);
    console.log('[crt] L2toL2CrossTradeL1Proxy:', l2ToL2CrossTradeL1Proxy);

    // Wallets
    l1Wallet = new ethers.Wallet(ADMIN_KEY, l1Provider);
    l2Wallet = new ethers.Wallet(ADMIN_KEY, l2Provider);
    adminAddress = l1Wallet.address;
    console.log('[crt] Admin address:', adminAddress);

    // L2 chain ID
    const network = await l2Provider.getNetwork();
    l2ChainId = network.chainId;
    console.log('[crt] L2 chainId:', l2ChainId.toString());

    // Balance check
    const l1Balance = await l1Provider.getBalance(adminAddress);
    const l2Balance = await l2Provider.getBalance(adminAddress);
    console.log('[crt] L1 balance:', ethers.formatEther(l1Balance), 'ETH (Sepolia)');
    console.log('[crt] L2 balance:', ethers.formatEther(l2Balance), 'ETH (L2)');

    if (l1Balance < ethers.parseEther('0.005')) {
      console.warn('[crt] ⚠ L1 balance low — provide steps may fail');
    }
    if (l2Balance < ethers.parseEther('0.005')) {
      console.warn('[crt] ⚠ L2 balance low — request steps may fail');
    }
  });

  // ── CRT-01: L1-L2 Request ──────────────────────────────────────────────
  test('CRT-01: L1-L2 request — lock L2 ETH in L2CrossTradeProxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);

    const l2CtContract = new ethers.Contract(l2CrossTradeProxy, L2_CT_ABI, l2Wallet);
    const l1ChainId = (await l1Provider.getNetwork()).chainId;

    console.log(`[CRT-01] Calling requestNonRegisteredToken on L2 (${stackUrls.l2Rpc})`);
    console.log(`[CRT-01]   l1token:     ${ETH_ADDRESS}`);
    console.log(`[CRT-01]   l2token:     ${ETH_ADDRESS} (native ETH)`);
    console.log(`[CRT-01]   receiver:    ${adminAddress}`);
    console.log(`[CRT-01]   totalAmount: ${ethers.formatEther(TRADE_AMOUNT)} ETH`);
    console.log(`[CRT-01]   ctAmount:    ${ethers.formatEther(CT_AMOUNT)} ETH`);
    console.log(`[CRT-01]   l1ChainId:   ${l1ChainId}`);

    const tx = await l2CtContract.requestNonRegisteredToken(
      ETH_ADDRESS,     // _l1token
      ETH_ADDRESS,     // _l2token (native ETH = address(0))
      adminAddress,    // _receiver
      TRADE_AMOUNT,    // _totalAmount
      CT_AMOUNT,       // _ctAmount
      l1ChainId,       // _l1chainId
      { value: TRADE_AMOUNT }  // msg.value = totalAmount for native ETH
    );
    console.log('[CRT-01] TX sent:', tx.hash);
    const receipt = await tx.wait(1);
    expect(receipt).not.toBeNull();
    expect(receipt!.status, 'L2 requestNonRegisteredToken tx failed').toBe(1);
    console.log('[CRT-01] TX confirmed. Block:', receipt!.blockNumber);

    // Parse NonRequestCT event (non-registered tokens emit NonRequestCT not RequestCT)
    const iface = new ethers.Interface(L2_CT_ABI);
    let parsedEvent: ethers.LogDescription | null = null;

    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed && (parsed.name === 'NonRequestCT' || parsed.name === 'RequestCT')) {
          parsedEvent = parsed;
          break;
        }
      } catch {
        // Different event — skip
      }
    }

    expect(parsedEvent, 'NonRequestCT/RequestCT event not found in receipt').not.toBeNull();
    l1l2SaleCount = parsedEvent!.args._saleCount as bigint;
    l1l2HashValue  = parsedEvent!.args._hashValue as string;

    console.log(`[CRT-01] Event: ${parsedEvent!.name}`);
    console.log(`[CRT-01] saleCount: ${l1l2SaleCount}`);
    console.log(`[CRT-01] hashValue: ${l1l2HashValue}`);

    expect(l1l2HashValue).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(l1l2SaleCount).toBeGreaterThan(0n);
  });

  // ── CRT-02: L1-L2 Provide ─────────────────────────────────────────────
  test('CRT-02: L1-L2 provide — send ETH from L1 via L1CrossTradeProxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);
    expect(l1l2HashValue, 'CRT-01 must succeed first').toBeTruthy();

    const l1CtContract = new ethers.Contract(l1CrossTradeProxy, L1_CT_ABI, l1Wallet);

    console.log(`[CRT-02] Calling provideCT on L1 (Sepolia)`);
    console.log(`[CRT-02]   l1token:           ${ETH_ADDRESS}`);
    console.log(`[CRT-02]   l2token:            ${ETH_ADDRESS}`);
    console.log(`[CRT-02]   requestor:          ${adminAddress}`);
    console.log(`[CRT-02]   receiver:           ${adminAddress}`);
    console.log(`[CRT-02]   totalAmount:        ${ethers.formatEther(TRADE_AMOUNT)} ETH`);
    console.log(`[CRT-02]   initialctAmount:    ${ethers.formatEther(CT_AMOUNT)} ETH`);
    console.log(`[CRT-02]   editedctAmount:     0 (no price edit)`);
    console.log(`[CRT-02]   saleCount:          ${l1l2SaleCount}`);
    console.log(`[CRT-02]   l2ChainId:          ${l2ChainId}`);
    console.log(`[CRT-02]   hash:               ${l1l2HashValue}`);

    // For native ETH: msg.value = ctAmount (= initialctAmount since no edit)
    const tx = await l1CtContract.provideCT(
      ETH_ADDRESS,      // _l1token
      ETH_ADDRESS,      // _l2token
      adminAddress,     // _requestor
      adminAddress,     // _receiver
      TRADE_AMOUNT,     // _totalAmount
      CT_AMOUNT,        // _initialctAmount
      0n,               // _editedctAmount (0 = no edit, matches editCtAmount mapping default)
      l1l2SaleCount,    // _salecount
      l2ChainId,        // _l2chainId
      MIN_GAS_LIMIT,    // _minGasLimit
      l1l2HashValue,    // _hash
      { value: CT_AMOUNT }  // msg.value = ctAmount for native ETH
    );
    console.log('[CRT-02] TX sent:', tx.hash);
    const receipt = await tx.wait(1);
    expect(receipt).not.toBeNull();
    expect(receipt!.status, 'L1 provideCT tx failed').toBe(1);
    console.log('[CRT-02] TX confirmed. Block:', receipt!.blockNumber);

    // Verify ProvideCT event
    const iface = new ethers.Interface(L1_CT_ABI);
    let provideCTLog: ethers.LogDescription | null = null;

    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'ProvideCT') {
          provideCTLog = parsed;
          break;
        }
      } catch {
        // Different event — skip
      }
    }

    expect(provideCTLog, 'ProvideCT event not found in L1 receipt').not.toBeNull();
    console.log('[CRT-02] ProvideCT event confirmed');
    console.log(`[CRT-02]   provider: ${provideCTLog!.args._provider}`);
    console.log(`[CRT-02]   ctAmount: ${ethers.formatEther(provideCTLog!.args._ctAmount)} ETH`);
  });

  // ── CRT-03: L1-L2 Claim verified ──────────────────────────────────────
  test('CRT-03: L1-L2 claim — ProviderClaimCT event on L2 via cross-domain message', async () => {
    test.setTimeout(CLAIM_TIMEOUT_MS + 60_000);
    expect(l1l2HashValue, 'CRT-02 must succeed first').toBeTruthy();

    console.log('[CRT-03] Polling for ProviderClaimCT on L2CrossTradeProxy...');
    console.log(`[CRT-03] Contract: ${l2CrossTradeProxy}`);
    console.log(`[CRT-03] Hash: ${l1l2HashValue}`);

    const iface = new ethers.Interface(L2_CT_ABI);
    const claimFilter = {
      address: l2CrossTradeProxy,
      topics: [
        ethers.id('ProviderClaimCT(address,address,address,address,address,uint256,uint256,uint256,uint256,bytes32)'),
      ],
    };

    const claimEvent = await pollUntil<ethers.Log>(
      async () => {
        const logs = await l2Provider.getLogs({
          ...claimFilter,
          fromBlock: 'earliest',
          toBlock: 'latest',
        });
        const matched = logs.find((log) => {
          try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            return parsed?.args._hash === l1l2HashValue;
          } catch {
            return false;
          }
        });
        return matched ?? null;
      },
      'ProviderClaimCT on L2 (L1-L2 flow)',
      CLAIM_TIMEOUT_MS,
      CLAIM_POLL_MS
    );

    const parsedClaim = iface.parseLog({ topics: [...claimEvent.topics], data: claimEvent.data })!;
    console.log('[CRT-03] ProviderClaimCT confirmed');
    console.log(`[CRT-03]   provider:    ${parsedClaim.args._provider}`);
    console.log(`[CRT-03]   ctAmount:    ${ethers.formatEther(parsedClaim.args._ctAmount)} ETH`);
    console.log(`[CRT-03]   saleCount:   ${parsedClaim.args._saleCount}`);

    expect(parsedClaim.args._hash).toBe(l1l2HashValue);
    expect(parsedClaim.args._provider).not.toBe(ETH_ADDRESS);
  });

  // ── CRT-04: L2-L2 Request ─────────────────────────────────────────────
  test('CRT-04: L2-L2 request — lock L2 ETH in L2ToL2CrossTradeProxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);

    const l2l2Contract = new ethers.Contract(l2ToL2CrossTradeProxy, L2L2_L2_ABI, l2Wallet);
    const l1ChainId = (await l1Provider.getNetwork()).chainId;

    // Source and destination are the same L2 chain (single-L2 deployment)
    const l2DestinationChainId = l2ChainId;

    console.log(`[CRT-04] Calling requestNonRegisteredToken on L2ToL2CrossTradeProxy`);
    console.log(`[CRT-04]   l1token:               ${ETH_ADDRESS}`);
    console.log(`[CRT-04]   l2SourceToken:          ${ETH_ADDRESS} (native ETH)`);
    console.log(`[CRT-04]   l2DestinationToken:     ${ETH_ADDRESS} (native ETH)`);
    console.log(`[CRT-04]   receiver:               ${adminAddress}`);
    console.log(`[CRT-04]   totalAmount:            ${ethers.formatEther(TRADE_AMOUNT)} ETH`);
    console.log(`[CRT-04]   ctAmount:               ${ethers.formatEther(CT_AMOUNT)} ETH`);
    console.log(`[CRT-04]   l1ChainId:              ${l1ChainId}`);
    console.log(`[CRT-04]   l2DestinationChainId:   ${l2DestinationChainId}`);

    const tx = await l2l2Contract.requestNonRegisteredToken(
      ETH_ADDRESS,             // _l1token
      ETH_ADDRESS,             // _l2SourceToken (native ETH on source L2)
      ETH_ADDRESS,             // _l2DestinationToken (native ETH on destination L2)
      adminAddress,            // _receiver
      TRADE_AMOUNT,            // _totalAmount
      CT_AMOUNT,               // _ctAmount
      l1ChainId,               // _l1ChainId
      l2DestinationChainId,    // _l2DestinationChainId
      { value: TRADE_AMOUNT }  // msg.value = totalAmount for native ETH
    );
    console.log('[CRT-04] TX sent:', tx.hash);
    const receipt = await tx.wait(1);
    expect(receipt).not.toBeNull();
    expect(receipt!.status, 'L2 L2toL2 requestNonRegisteredToken tx failed').toBe(1);
    console.log('[CRT-04] TX confirmed. Block:', receipt!.blockNumber);

    // Parse NonRequestCT event
    const iface = new ethers.Interface(L2L2_L2_ABI);
    let parsedEvent: ethers.LogDescription | null = null;

    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed && (parsed.name === 'NonRequestCT' || parsed.name === 'RequestCT')) {
          parsedEvent = parsed;
          break;
        }
      } catch {
        // Different event — skip
      }
    }

    expect(parsedEvent, 'NonRequestCT/RequestCT event not found in L2-L2 request receipt').not.toBeNull();
    l2l2SaleCount = parsedEvent!.args._saleCount as bigint;
    l2l2HashValue  = parsedEvent!.args._hashValue as string;

    console.log(`[CRT-04] Event: ${parsedEvent!.name}`);
    console.log(`[CRT-04] saleCount: ${l2l2SaleCount}`);
    console.log(`[CRT-04] hashValue: ${l2l2HashValue}`);

    expect(l2l2HashValue).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(l2l2SaleCount).toBeGreaterThan(0n);
  });

  // ── CRT-05: L2-L2 Provide ─────────────────────────────────────────────
  test('CRT-05: L2-L2 provide — relay ETH from L1 via L2toL2CrossTradeL1Proxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);
    expect(l2l2HashValue, 'CRT-04 must succeed first').toBeTruthy();

    const l1L2l2Contract = new ethers.Contract(l2ToL2CrossTradeL1Proxy, L2L2_L1_ABI, l1Wallet);
    const l2DestinationChainId = l2ChainId; // same chain for single-L2 deployment

    console.log(`[CRT-05] Calling provideCT on L2toL2CrossTradeL1Proxy (Sepolia)`);
    console.log(`[CRT-05]   l1token:               ${ETH_ADDRESS}`);
    console.log(`[CRT-05]   l2SourceToken:          ${ETH_ADDRESS}`);
    console.log(`[CRT-05]   l2DestinationToken:     ${ETH_ADDRESS}`);
    console.log(`[CRT-05]   requestor:              ${adminAddress}`);
    console.log(`[CRT-05]   receiver:               ${adminAddress}`);
    console.log(`[CRT-05]   totalAmount:            ${ethers.formatEther(TRADE_AMOUNT)} ETH`);
    console.log(`[CRT-05]   initialctAmount:        ${ethers.formatEther(CT_AMOUNT)} ETH`);
    console.log(`[CRT-05]   saleCount:              ${l2l2SaleCount}`);
    console.log(`[CRT-05]   l2SourceChainId:        ${l2ChainId}`);
    console.log(`[CRT-05]   l2DestinationChainId:   ${l2DestinationChainId}`);
    console.log(`[CRT-05]   hash:                   ${l2l2HashValue}`);

    const tx = await l1L2l2Contract.provideCT(
      ETH_ADDRESS,            // _l1token
      ETH_ADDRESS,            // _l2SourceToken
      ETH_ADDRESS,            // _l2DestinationToken
      adminAddress,           // _requestor
      adminAddress,           // _receiver
      TRADE_AMOUNT,           // _totalAmount
      CT_AMOUNT,              // _initialctAmount
      0n,                     // _editedctAmount (no edit)
      l2l2SaleCount,          // _saleCount
      l2ChainId,              // _l2SourceChainId
      l2DestinationChainId,   // _l2DestinationChainId
      MIN_GAS_LIMIT,          // _minGasLimit
      l2l2HashValue,          // _hash
      { value: CT_AMOUNT }    // msg.value = ctAmount for native ETH
    );
    console.log('[CRT-05] TX sent:', tx.hash);
    const receipt = await tx.wait(1);
    expect(receipt).not.toBeNull();
    expect(receipt!.status, 'L1 L2toL2 provideCT tx failed').toBe(1);
    console.log('[CRT-05] TX confirmed. Block:', receipt!.blockNumber);

    // Verify ProvideCT event
    const iface = new ethers.Interface(L2L2_L1_ABI);
    let provideCTLog: ethers.LogDescription | null = null;

    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'ProvideCT') {
          provideCTLog = parsed;
          break;
        }
      } catch {
        // Different event — skip
      }
    }

    expect(provideCTLog, 'ProvideCT event not found in L2toL2 L1 receipt').not.toBeNull();
    console.log('[CRT-05] ProvideCT event confirmed');
    console.log(`[CRT-05]   provider: ${provideCTLog!.args._provider}`);
    console.log(`[CRT-05]   ctAmount: ${ethers.formatEther(provideCTLog!.args._ctAmount)} ETH`);
  });

  // ── CRT-06: L2-L2 Claim verified ──────────────────────────────────────
  test('CRT-06: L2-L2 claim — ProviderClaimCT event on L2ToL2CrossTradeProxy', async () => {
    test.setTimeout(CLAIM_TIMEOUT_MS + 60_000);
    expect(l2l2HashValue, 'CRT-05 must succeed first').toBeTruthy();

    console.log('[CRT-06] Polling for ProviderClaimCT on L2ToL2CrossTradeProxy...');
    console.log(`[CRT-06] Contract: ${l2ToL2CrossTradeProxy}`);
    console.log(`[CRT-06] Hash: ${l2l2HashValue}`);

    const iface = new ethers.Interface(L2L2_L2_ABI);
    const claimFilter = {
      address: l2ToL2CrossTradeProxy,
      topics: [
        ethers.id('ProviderClaimCT(address,address,address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,bytes32)'),
      ],
    };

    const claimEvent = await pollUntil<ethers.Log>(
      async () => {
        const logs = await l2Provider.getLogs({
          ...claimFilter,
          fromBlock: 'earliest',
          toBlock: 'latest',
        });
        const matched = logs.find((log) => {
          try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            return parsed?.args._hash === l2l2HashValue;
          } catch {
            return false;
          }
        });
        return matched ?? null;
      },
      'ProviderClaimCT on L2 (L2-L2 flow)',
      CLAIM_TIMEOUT_MS,
      CLAIM_POLL_MS
    );

    const parsedClaim = iface.parseLog({ topics: [...claimEvent.topics], data: claimEvent.data })!;
    console.log('[CRT-06] ProviderClaimCT confirmed');
    console.log(`[CRT-06]   provider:    ${parsedClaim.args._provider}`);
    console.log(`[CRT-06]   ctAmount:    ${ethers.formatEther(parsedClaim.args._ctAmount)} ETH`);
    console.log(`[CRT-06]   saleCount:   ${parsedClaim.args._saleCount}`);

    expect(parsedClaim.args._hash).toBe(l2l2HashValue);
    expect(parsedClaim.args._provider).not.toBe(ETH_ADDRESS);
  });

  // ── CRT-07: dApp UI screenshots ───────────────────────────────────────
  test('CRT-07: CrossTrade dApp UI pages accessible and captured', async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);

    const dappUrl = stackUrls.crossTradeUrl ?? 'http://localhost:3004';

    // Ensure dApp is reachable
    await pollUntil(
      async () => {
        try {
          const resp = await fetch(dappUrl, { signal: AbortSignal.timeout(5_000) });
          return resp.status < 500 ? true : null;
        } catch {
          return null;
        }
      },
      `CrossTrade dApp at ${dappUrl}`,
      60_000,
      5_000
    );

    // Capture home page (CreateRequest)
    await page.goto(dappUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.screenshot({
      path: 'test-results/crt-07-dapp-home.png',
      fullPage: true,
    });
    console.log('[CRT-07] Screenshot: crt-07-dapp-home.png');

    let body = await page.textContent('body') ?? '';
    expect(body.length, 'dApp home page is empty').toBeGreaterThan(100);

    // Capture request pool page
    await page.goto(`${dappUrl}/request-pool`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.screenshot({
      path: 'test-results/crt-07-dapp-request-pool.png',
      fullPage: true,
    });
    console.log('[CRT-07] Screenshot: crt-07-dapp-request-pool.png');

    body = await page.textContent('body') ?? '';
    expect(body.length, 'Request pool page is empty').toBeGreaterThan(100);

    // Capture history page
    await page.goto(`${dappUrl}/history`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.screenshot({
      path: 'test-results/crt-07-dapp-history.png',
      fullPage: true,
    });
    console.log('[CRT-07] Screenshot: crt-07-dapp-history.png');

    body = await page.textContent('body') ?? '';
    expect(body.length, 'History page is empty').toBeGreaterThan(100);

    console.log('[CRT-07] All 3 dApp pages captured successfully');
  });
});
