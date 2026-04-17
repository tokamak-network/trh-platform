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

import { test, expect, Page } from '@playwright/test';
import { ethers } from 'ethers';
import { resolveStackUrls, loginBackend, StackUrls } from './helpers/stack-resolver';
import { pollUntil } from './helpers/poll';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LIVE_CHAIN_NAME = process.env.LIVE_CHAIN_NAME ?? null;
const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
const L2L2_DEST_RPC = process.env.LIVE_L2L2_DESTINATION_RPC ?? null;

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
const TX_TIMEOUT_MS    = 3 * 60 * 1000;           // 3 min for individual TXs
const CLAIM_TIMEOUT_MS = 20 * 60 * 1000;          // 20 min for L1→L2 cross-domain message
const CLAIM_POLL_MS    = 5_000;                    // 5s poll interval

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

// USDC token addresses
const USDC_L1_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
const USDC_L2_ADDRESS = '0x4200000000000000000000000000000000000778'; // L2 USDC predeploy

// ERC20 ABI (approve + balanceOf only)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

// USDC amounts (USDC has 6 decimals; 1 USDC = 1_000_000)
const USDC_TRADE_AMOUNT = BigInt(1_000_000); // 1 USDC on L2 (locked by requester)
const USDC_CT_AMOUNT    = BigInt(1_000_000); // 1 USDC on L1 (provided)

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

// L2-L2 destination chain (separate chain or same as source)
let l2DestProvider: ethers.JsonRpcProvider;
let l2DestChainId: bigint;

// L1-L2 request state
let l1l2SaleCount: bigint;
let l1l2HashValue: string;

// L2-L2 request state
let l2l2SaleCount: bigint;
let l2l2HashValue: string;

// L2 log query start blocks (set after provide TX to avoid scanning from genesis)
let l1l2ClaimFromBlock: number;
let l2l2ClaimFromBlock: number;

// USDC request state (CRT-08/09/10)
let usdcSaleCount: bigint;
let usdcHashValue: string;
let usdcClaimFromBlock: number;

// ---------------------------------------------------------------------------
// dApp screenshot helpers
// ---------------------------------------------------------------------------

/**
 * Injects a mock EIP-1193 + EIP-6963 wallet provider into the page and connects
 * via the AppKit modal. Must be called before any page.goto().
 */
async function connectDAppWallet(page: Page): Promise<void> {
  const dappUrl = stackUrls.crossTradeUrl ?? 'http://localhost:3004';
  const chainIdHex = '0x' + l2ChainId.toString(16);
  const chainIdDecimal = Number(l2ChainId);
  const l2RpcUrl = stackUrls.l2Rpc ?? 'http://localhost:8545';

  await page.addInitScript(
    ({ address, chainId, chainIdNum, rpcUrl }: { address: string; chainId: string; chainIdNum: number; rpcUrl: string }) => {
      const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const mockProvider = {
        isMetaMask: true,
        selectedAddress: address,
        chainId,
        networkVersion: String(chainIdNum),
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address];
            case 'eth_chainId':
              return chainId;
            case 'net_version':
              return String(chainIdNum);
            case 'wallet_switchEthereumChain':
            case 'wallet_addEthereumChain':
              return null;
            case 'eth_getBalance':
              return '0x8AC7230489E80000'; // 10 ETH in wei (mock balance)
            default: {
              // Proxy all other RPC calls (eth_getLogs, eth_call, eth_blockNumber, etc.)
              // to the actual L2 node so dApp data loads correctly
              const resp = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: params ?? [] }),
              });
              const json = (await resp.json()) as { result?: unknown; error?: { code: number; message: string } };
              if (json.error) {
                const err = new Error(json.error.message) as Error & { code?: number };
                err.code = json.error.code;
                throw err;
              }
              return json.result;
            }
          }
        },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
          return mockProvider;
        },
        removeListener: (event: string, handler: (...args: unknown[]) => void) => {
          if (handlers[event]) handlers[event] = handlers[event].filter(h => h !== handler);
          return mockProvider;
        },
        emit: (event: string, ...args: unknown[]) => {
          (handlers[event] ?? []).forEach(h => h(...args));
          return mockProvider;
        },
      };

      // EIP-1193: legacy window.ethereum
      Object.defineProperty(window, 'ethereum', {
        value: mockProvider,
        writable: false,
        configurable: true,
      });

      // EIP-6963: announce provider info so AppKit v3 detects the wallet
      const providerDetail = {
        info: {
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48L3N2Zz4=',
          rdns: 'io.metamask',
        },
        provider: mockProvider,
      };

      const announceEvent = new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze(providerDetail),
      });
      window.dispatchEvent(announceEvent);

      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze(providerDetail),
          })
        );
      });
    },
    { address: adminAddress, chainId: chainIdHex, chainIdNum: chainIdDecimal, rpcUrl: l2RpcUrl }
  );

  await page.goto(dappUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Attempt wallet connection via AppKit modal
  const connectBtn = page.locator('appkit-button').first();
  const isConnectVisible = await connectBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (isConnectVisible) {
    await connectBtn.click();
    await page.waitForTimeout(1_500);

    const metaMaskOption = page.getByText('MetaMask', { exact: true }).first();
    const hasMetaMask = await metaMaskOption.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasMetaMask) {
      await metaMaskOption.click();
      await page.waitForTimeout(1_000);

      const browserTab = page.getByText('Browser', { exact: true }).first();
      const hasBrowserTab = await browserTab.isVisible({ timeout: 2_000 }).catch(() => false);
      if (hasBrowserTab) {
        await browserTab.click();
        await page.waitForTimeout(2_000);
      }
    } else {
      const browserWallet = page.getByText('Browser Wallet', { exact: false }).first();
      const hasBrowserWallet = await browserWallet.isVisible({ timeout: 2_000 }).catch(() => false);
      if (hasBrowserWallet) {
        await browserWallet.click();
        await page.waitForTimeout(2_000);
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Wait for wallet connection to be recognized (address displayed in UI or localStorage updated)
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        // Check if address is visible in UI (show "0x..." or "Connected")
        return /0x[a-fA-F0-9]{40}|Connected/.test(text);
      },
      { timeout: 5_000 }
    );
  } catch {
    console.log('[connectDAppWallet] Wallet address not detected in UI after 5s — proceeding anyway');
  }
}

/**
 * Navigates to a dApp route and captures a screenshot.
 * Waits for loading indicators to disappear, then injects a TX info overlay
 * so transaction IDs are always visible in the screenshot.
 */
async function screenshotDAppPage(
  page: Page,
  route: string,
  filename: string,
  label: string,
  txInfo?: { label: string; txHash?: string; hashValue?: string; saleCount?: string }
): Promise<void> {
  const dappUrl = stackUrls.crossTradeUrl ?? 'http://localhost:3004';

  // Use client-side navigation when already on the same dApp origin so that
  // AppKit's wallet client (useWalletClient) stays initialised across route
  // changes.  Full page.goto() causes a fresh page load which races against
  // AppKit re-initialisation: the history useEffect fires before the wallet
  // client is ready, B() skips the fetch (if(a&&e)), and the deps array never
  // includes `a` so it never retries.
  const currentUrl = page.url();
  const onDapp = currentUrl.startsWith(dappUrl);

  if (onDapp) {
    // Trigger Next.js App Router client-side navigation without a full reload.
    await page.evaluate((targetPath: string) => {
      window.history.pushState({}, '', targetPath);
      // Next.js App Router listens to popstate to detect navigation.
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, route);
    // Wait until the pathname actually changed (Next.js may be async).
    await page.waitForFunction(
      (path: string) => window.location.pathname === path,
      route,
      { timeout: 10_000 }
    ).catch(() => {
      console.log(`[${label}] Client-side nav to ${route} timed out — falling back to goto`);
    });
    // If pathname didn't update (fallback case) do a proper goto.
    const updatedUrl = page.url();
    if (!updatedUrl.includes(route)) {
      await page.goto(`${dappUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
  } else {
    await page.goto(`${dappUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }

  if (route.includes('/history')) {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading history'),
      { timeout: 30_000 }
    ).catch(() => {
      console.log(`[${label}] History load timed out — capturing partial state`);
    });
    // If history is still empty after the initial wait, the wallet client may
    // not have been ready when the useEffect fired.  Re-announce the EIP-6963
    // provider so AppKit sets up the wallet client and the component re-renders.
    const isEmpty = await page.locator('text=No transaction history found').isVisible({ timeout: 2_000 }).catch(() => false);
    if (isEmpty) {
      console.log(`[${label}] History empty — re-announcing EIP-6963 provider to re-trigger wallet client`);
      await page.evaluate(() => {
        // Re-dispatch the eip6963:requestProvider event; our mock listener will
        // re-announce the provider which causes AppKit to re-init the wallet client.
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      });
      await page.waitForTimeout(2_000);
      // Wait for loading indicator to clear again after re-trigger.
      await page.waitForFunction(
        () => !document.body.innerText.includes('Loading history'),
        { timeout: 15_000 }
      ).catch(() => {});
    }
  } else if (route.includes('/request-pool')) {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading requests'),
      { timeout: 30_000 }
    ).catch(() => {
      console.log(`[${label}] Request pool load timed out — capturing partial state`);
    });
  }

  // Inject a fixed overlay so TX IDs are always visible in the screenshot
  if (txInfo) {
    await page.evaluate((info: { label: string; txHash?: string; hashValue?: string; saleCount?: string }) => {
      const existing = document.getElementById('__crt-tx-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = '__crt-tx-overlay';
      overlay.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'right:16px',
        'background:rgba(0,0,0,0.88)',
        'color:#00ff88',
        'font-family:monospace',
        'font-size:11px',
        'padding:10px 14px',
        'border-radius:6px',
        'z-index:2147483647',
        'max-width:600px',
        'word-break:break-all',
        'border:1px solid #00ff88',
        'line-height:1.7',
        'box-shadow:0 4px 12px rgba(0,0,0,0.5)',
      ].join(';');
      const lines: string[] = [`<span style="color:#fff;font-weight:bold">${info.label}</span>`];
      if (info.txHash) lines.push(`TX:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${info.txHash}`);
      if (info.hashValue) lines.push(`hash:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${info.hashValue}`);
      if (info.saleCount !== undefined) lines.push(`saleCount: ${info.saleCount}`);
      overlay.innerHTML = lines.join('<br>');
      document.body.appendChild(overlay);
    }, txInfo);
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/${filename}`, fullPage: true });
  console.log(`[${label}] Screenshot: ${filename}`);
}

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

    // L2-L2 destination provider (external chain or fallback to same chain)
    if (L2L2_DEST_RPC) {
      l2DestProvider = new ethers.JsonRpcProvider(L2L2_DEST_RPC);
      const destNetwork = await l2DestProvider.getNetwork();
      l2DestChainId = destNetwork.chainId;
      console.log('[crt] L2-L2 destination chain:', L2L2_DEST_RPC, 'chainId:', l2DestChainId.toString());
    } else {
      l2DestProvider = l2Provider;
      l2DestChainId = l2ChainId;
      console.log('[crt] L2-L2 destination: same as source (single-L2 mode)');
    }

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
  test('CRT-01: L1-L2 request — lock L2 ETH in L2CrossTradeProxy', async ({ page }) => {
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

    // dApp screenshot: show new L1-L2 request in request pool
    await connectDAppWallet(page);
    await screenshotDAppPage(page, '/request-pool', 'crt-01-dapp-request-pool.png', 'CRT-01', {
      label: 'L1-L2 Request (CRT-01)',
      txHash: tx.hash,
      hashValue: l1l2HashValue,
      saleCount: l1l2SaleCount.toString(),
    });
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
      { value: CT_AMOUNT }  // no explicit gasLimit: let ethers estimate (ResourceMetering burn needs ~490k, exceeds any fixed limit)
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

    // Record current L2 block to avoid full log scan in CRT-03
    l1l2ClaimFromBlock = await l2Provider.getBlockNumber();
    console.log('[CRT-02] L2 claim search start block:', l1l2ClaimFromBlock);
  });

  // ── CRT-03: L1-L2 Claim verified ──────────────────────────────────────
  test('CRT-03: L1-L2 claim — ProviderClaimCT event on L2 via cross-domain message', async ({ page }) => {
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
          fromBlock: l1l2ClaimFromBlock,
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

    // dApp screenshot: show completed L1-L2 trade in history
    await connectDAppWallet(page);
    await screenshotDAppPage(page, '/history', 'crt-03-dapp-history.png', 'CRT-03', {
      label: 'L1-L2 Claim (CRT-03)',
      txHash: claimEvent.transactionHash,
      hashValue: l1l2HashValue,
      saleCount: parsedClaim.args._saleCount?.toString(),
    });
  });

  // ── CRT-04: L2-L2 Request ─────────────────────────────────────────────
  test('CRT-04: L2-L2 request — lock L2 ETH in L2ToL2CrossTradeProxy', async ({ page }) => {
    test.setTimeout(TX_TIMEOUT_MS);

    const l2l2Contract = new ethers.Contract(l2ToL2CrossTradeProxy, L2L2_L2_ABI, l2Wallet);
    const l1ChainId = (await l1Provider.getNetwork()).chainId;

    // Use configured destination chain (Thanos Sepolia or same chain as fallback)
    const l2DestinationChainId = l2DestChainId;

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

    // dApp screenshot: show new L2-L2 request in request pool
    await connectDAppWallet(page);
    await screenshotDAppPage(page, '/request-pool', 'crt-04-dapp-request-pool.png', 'CRT-04', {
      label: 'L2-L2 Request (CRT-04)',
      txHash: tx.hash,
      hashValue: l2l2HashValue,
      saleCount: l2l2SaleCount.toString(),
    });
  });

  // ── CRT-05: L2-L2 Provide ─────────────────────────────────────────────
  test('CRT-05: L2-L2 provide — relay ETH from L1 via L2toL2CrossTradeL1Proxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);
    expect(l2l2HashValue, 'CRT-04 must succeed first').toBeTruthy();

    const l1L2l2Contract = new ethers.Contract(l2ToL2CrossTradeL1Proxy, L2L2_L1_ABI, l1Wallet);
    const l2DestinationChainId = l2DestChainId; // use configured destination chain

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
      { value: CT_AMOUNT }  // no explicit gasLimit: let ethers estimate (ResourceMetering burn needs more than any fixed cap)
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

    // Record current SOURCE L2 block to avoid full log scan in CRT-06
    // ProviderClaimCT is emitted on the SOURCE L2 (local), not the destination chain
    l2l2ClaimFromBlock = await l2Provider.getBlockNumber();
    console.log('[CRT-05] L2 claim search start block (source L2):', l2l2ClaimFromBlock);
  });

  // ── CRT-06: L2-L2 Claim verified ──────────────────────────────────────
  test('CRT-06: L2-L2 claim — ProviderClaimCT event on L2ToL2CrossTradeProxy', async ({ page }) => {
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
        // ProviderClaimCT is emitted on the SOURCE L2 when the L1→L2 CDM is relayed
        // and claimCT() is called on L2ToL2CrossTradeProxy. Poll source L2, not destination.
        const logs = await l2Provider.getLogs({
          ...claimFilter,
          fromBlock: l2l2ClaimFromBlock,
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

    // dApp screenshot: show both completed trades in history
    await connectDAppWallet(page);
    await screenshotDAppPage(page, '/history', 'crt-06-dapp-history.png', 'CRT-06', {
      label: 'L2-L2 Claim (CRT-06)',
      txHash: claimEvent.transactionHash,
      hashValue: l2l2HashValue,
      saleCount: parsedClaim.args._saleCount?.toString(),
    });
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

    // Connect wallet and navigate to dApp home
    await connectDAppWallet(page);
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: 'test-results/crt-07-dapp-home.png', fullPage: true });
    console.log('[CRT-07] Screenshot: crt-07-dapp-home.png');

    let body = await page.textContent('body') ?? '';
    expect(body.length, 'dApp home page is empty').toBeGreaterThan(100);

    // Capture request pool page
    await screenshotDAppPage(page, '/request-pool', 'crt-07-dapp-request-pool.png', 'CRT-07', {
      label: 'Request Pool (CRT-07)',
      hashValue: l2l2HashValue || l1l2HashValue || undefined,
      saleCount: (l2l2SaleCount || l1l2SaleCount)?.toString(),
    });
    body = await page.textContent('body') ?? '';
    expect(body.length, 'Request pool page is empty').toBeGreaterThan(100);

    // Capture history page
    await screenshotDAppPage(page, '/history', 'crt-07-dapp-history.png', 'CRT-07', {
      label: 'History (CRT-07)',
      hashValue: l1l2HashValue || l2l2HashValue || undefined,
    });
    body = await page.textContent('body') ?? '';
    expect(body.length, 'History page is empty').toBeGreaterThan(100);

    console.log('[CRT-07] All 3 dApp pages captured successfully');
  });

  // ── CRT-08: USDC L2→L1 Request ───────────────────────────────────────
  test('CRT-08: USDC L2→L1 request — approve + lock L2 USDC in L2CrossTradeProxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);

    const l1ChainId = (await l1Provider.getNetwork()).chainId;

    // Check L2 USDC balance
    const usdcL2Contract = new ethers.Contract(USDC_L2_ADDRESS, ERC20_ABI, l2Wallet);
    const l2UsdcBalance = await usdcL2Contract.balanceOf(adminAddress);
    console.log(`[CRT-08] L2 USDC balance: ${l2UsdcBalance} (need >= ${USDC_TRADE_AMOUNT})`);
    if (l2UsdcBalance < USDC_TRADE_AMOUNT) {
      test.skip(true, `L2 USDC balance too low (${l2UsdcBalance} < ${USDC_TRADE_AMOUNT}). Bridge USDC to L2 first.`);
    }

    // Approve L2CrossTradeProxy to spend USDC
    console.log(`[CRT-08] Approving L2CrossTradeProxy to spend ${USDC_TRADE_AMOUNT} USDC...`);
    const approveTx = await usdcL2Contract.approve(l2CrossTradeProxy, USDC_TRADE_AMOUNT);
    const approveReceipt = await approveTx.wait(1);
    expect(approveReceipt!.status, 'USDC approve tx failed').toBe(1);
    console.log('[CRT-08] USDC approve confirmed:', approveTx.hash);

    // Request USDC L2→L1
    const l2CtContract = new ethers.Contract(l2CrossTradeProxy, L2_CT_ABI, l2Wallet);

    console.log(`[CRT-08] Calling requestNonRegisteredToken (USDC) on L2CrossTradeProxy`);
    console.log(`[CRT-08]   l1token:     ${USDC_L1_ADDRESS}`);
    console.log(`[CRT-08]   l2token:     ${USDC_L2_ADDRESS}`);
    console.log(`[CRT-08]   receiver:    ${adminAddress}`);
    console.log(`[CRT-08]   totalAmount: ${USDC_TRADE_AMOUNT} (1 USDC)`);
    console.log(`[CRT-08]   ctAmount:    ${USDC_CT_AMOUNT} (1 USDC)`);
    console.log(`[CRT-08]   l1ChainId:   ${l1ChainId}`);

    // ERC20: no msg.value (USDC is pulled via transferFrom, not sent as ETH)
    const tx = await l2CtContract.requestNonRegisteredToken(
      USDC_L1_ADDRESS,   // _l1token: Sepolia USDC
      USDC_L2_ADDRESS,   // _l2token: L2 USDC predeploy
      adminAddress,      // _receiver
      USDC_TRADE_AMOUNT, // _totalAmount
      USDC_CT_AMOUNT,    // _ctAmount
      l1ChainId,         // _l1chainId
      // No { value: ... } — USDC is ERC20, not native ETH
    );
    console.log('[CRT-08] TX sent:', tx.hash);
    const receipt = await tx.wait(1);
    expect(receipt).not.toBeNull();
    expect(receipt!.status, 'L2 USDC requestNonRegisteredToken tx failed').toBe(1);
    console.log('[CRT-08] TX confirmed. Block:', receipt!.blockNumber);

    // Parse NonRequestCT or RequestCT event
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

    expect(parsedEvent, 'NonRequestCT/RequestCT event not found in USDC request receipt').not.toBeNull();
    usdcSaleCount = parsedEvent!.args._saleCount as bigint;
    usdcHashValue = parsedEvent!.args._hashValue as string;

    console.log(`[CRT-08] Event: ${parsedEvent!.name}`);
    console.log(`[CRT-08] saleCount: ${usdcSaleCount}`);
    console.log(`[CRT-08] hashValue: ${usdcHashValue}`);

    expect(usdcHashValue).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(usdcSaleCount).toBeGreaterThan(0n);
    // Verify the token address in the event matches USDC
    expect((parsedEvent!.args._l2token as string).toLowerCase()).toBe(USDC_L2_ADDRESS.toLowerCase());
    console.log('[CRT-08] USDC token address in event verified ✓');
  });

  // ── CRT-09: USDC L2→L1 Provide ────────────────────────────────────────
  test('CRT-09: USDC L2→L1 provide — approve + send L1 USDC via L1CrossTradeProxy', async () => {
    test.setTimeout(TX_TIMEOUT_MS);
    expect(usdcHashValue, 'CRT-08 must succeed first').toBeTruthy();

    // Check L1 USDC balance
    const usdcL1Contract = new ethers.Contract(USDC_L1_ADDRESS, ERC20_ABI, l1Wallet);
    const l1UsdcBalance = await usdcL1Contract.balanceOf(adminAddress);
    console.log(`[CRT-09] L1 USDC balance: ${l1UsdcBalance} (need >= ${USDC_CT_AMOUNT})`);
    if (l1UsdcBalance < USDC_CT_AMOUNT) {
      test.skip(true, `L1 USDC balance too low (${l1UsdcBalance} < ${USDC_CT_AMOUNT}). Get Sepolia USDC from faucet.`);
    }

    // Approve L1CrossTradeProxy to spend USDC
    console.log(`[CRT-09] Approving L1CrossTradeProxy to spend ${USDC_CT_AMOUNT} USDC on L1...`);
    const approveTx = await usdcL1Contract.approve(l1CrossTradeProxy, USDC_CT_AMOUNT);
    const approveReceipt = await approveTx.wait(1);
    expect(approveReceipt!.status, 'L1 USDC approve tx failed').toBe(1);
    console.log('[CRT-09] L1 USDC approve confirmed:', approveTx.hash);

    const l1CtContract = new ethers.Contract(l1CrossTradeProxy, L1_CT_ABI, l1Wallet);

    console.log(`[CRT-09] Calling provideCT (USDC) on L1CrossTradeProxy (Sepolia)`);

    // ERC20 provide: no msg.value — USDC is pulled via transferFrom
    const tx = await l1CtContract.provideCT(
      USDC_L1_ADDRESS,   // _l1token
      USDC_L2_ADDRESS,   // _l2token
      adminAddress,      // _requestor
      adminAddress,      // _receiver
      USDC_TRADE_AMOUNT, // _totalAmount
      USDC_CT_AMOUNT,    // _initialctAmount
      0n,                // _editedctAmount (no edit)
      usdcSaleCount,     // _salecount
      l2ChainId,         // _l2chainId
      MIN_GAS_LIMIT,     // _minGasLimit
      usdcHashValue,     // _hash
      // No { value: ... } — USDC provider sends ERC20, not ETH
    );
    console.log('[CRT-09] TX sent:', tx.hash);
    const receipt = await tx.wait(1);
    expect(receipt).not.toBeNull();
    expect(receipt!.status, 'L1 USDC provideCT tx failed').toBe(1);
    console.log('[CRT-09] TX confirmed. Block:', receipt!.blockNumber);

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

    expect(provideCTLog, 'ProvideCT event not found in USDC L1 provide receipt').not.toBeNull();
    console.log('[CRT-09] ProvideCT event confirmed');
    console.log(`[CRT-09]   provider: ${provideCTLog!.args._provider}`);
    console.log(`[CRT-09]   ctAmount: ${provideCTLog!.args._ctAmount} (USDC units)`);

    usdcClaimFromBlock = await l2Provider.getBlockNumber();
    console.log('[CRT-09] L2 USDC claim search start block:', usdcClaimFromBlock);
  });

  // ── CRT-10: USDC L2→L1 Claim verified ────────────────────────────────
  test('CRT-10: USDC L2→L1 claim — ProviderClaimCT event on L2 for USDC', async () => {
    test.setTimeout(CLAIM_TIMEOUT_MS + 60_000);
    expect(usdcHashValue, 'CRT-09 must succeed first').toBeTruthy();

    console.log('[CRT-10] Polling for ProviderClaimCT (USDC) on L2CrossTradeProxy...');
    console.log(`[CRT-10] Contract: ${l2CrossTradeProxy}`);
    console.log(`[CRT-10] Hash: ${usdcHashValue}`);

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
          fromBlock: usdcClaimFromBlock,
          toBlock: 'latest',
        });
        const matched = logs.find((log) => {
          try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            return parsed?.args._hash === usdcHashValue;
          } catch {
            return false;
          }
        });
        return matched ?? null;
      },
      'ProviderClaimCT on L2 (USDC L2→L1 flow)',
      CLAIM_TIMEOUT_MS,
      CLAIM_POLL_MS
    );

    const parsedClaim = iface.parseLog({ topics: [...claimEvent.topics], data: claimEvent.data })!;
    console.log('[CRT-10] USDC ProviderClaimCT confirmed');
    console.log(`[CRT-10]   provider:    ${parsedClaim.args._provider}`);
    console.log(`[CRT-10]   ctAmount:    ${parsedClaim.args._ctAmount} (USDC units)`);
    console.log(`[CRT-10]   saleCount:   ${parsedClaim.args._saleCount}`);
    console.log(`[CRT-10]   l2token:     ${parsedClaim.args._l2token}`);

    expect(parsedClaim.args._hash).toBe(usdcHashValue);
    expect(parsedClaim.args._provider).not.toBe(ETH_ADDRESS);
    expect((parsedClaim.args._l2token as string).toLowerCase()).toBe(USDC_L2_ADDRESS.toLowerCase());
    console.log('[CRT-10] USDC token confirmed in ProviderClaimCT event ✓');
  });
});
