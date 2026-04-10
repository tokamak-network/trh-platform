/**
 * Matrix Health Check -- CrossTrade (Tier 2)
 *
 * SKIPS for General preset (crossTrade not in module list).
 * Verifies CrossTrade L2 contract deployment, L1 setChainInfo registration,
 * and dApp accessibility.
 *
 * Usage:
 *   LIVE_PRESET=defi LIVE_FEE_TOKEN=USDT LIVE_CHAIN_NAME=<chain> npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/crosstrade-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled } from '../helpers/matrix-config';
import { resolveStackUrls, loginBackend, StackUrls } from '../helpers/stack-resolver';
import { pollUntil } from '../helpers/poll';
import { ethers } from 'ethers';

const config = getStackConfig();
let urls: StackUrls;
let jwt: string;
let crossTradeIntegration: Record<string, unknown>;

test.describe(`CrossTrade Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.skip(!isModuleEnabled(config.preset, 'crossTrade'), 'CrossTrade not in preset');
    urls = await resolveStackUrls(config.chainName);
    jwt = await loginBackend();

    // Fetch CrossTrade integration from backend API
    const backendUrl = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
    const resp = await fetch(
      `${backendUrl}/api/v1/stacks/thanos/${urls.stackId}/integrations`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    expect(resp.ok, `Failed to fetch integrations: ${resp.status}`).toBe(true);

    const body = await resp.json() as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;
    const integrations = (data.integrations ?? []) as Record<string, unknown>[];
    const found = integrations.find((i) => i.type === 'cross-trade');
    expect(found, 'CrossTrade integration not found in backend').toBeDefined();
    crossTradeIntegration = found!;
    expect(['installed', 'Completed'], 'CrossTrade integration must be installed or Completed').toContain(crossTradeIntegration.status);
  });

  // E2E-01: 4 L2 CrossTrade contracts deployed
  test('L2 CrossTrade contracts deployed (4 addresses)', async () => {
    // API returns integration info in the 'info' field (not 'metadata'), with snake_case keys
    const info = (crossTradeIntegration.info ?? crossTradeIntegration.metadata) as Record<string, unknown>;
    const contracts = (info?.contracts ?? {}) as Record<string, string>;
    expect(Object.keys(contracts).length > 0, 'No contracts in integration info').toBe(true);

    const requiredContracts = [
      'l2_cross_trade',
      'l2_cross_trade_proxy',
      'l2_to_l2_cross_trade_l2',
      'l2_to_l2_cross_trade_proxy',
    ];

    for (const name of requiredContracts) {
      expect(contracts[name], `Missing contract address for ${name}`).toBeTruthy();
    }

    // Verify each address has deployed bytecode on L2
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    for (const name of requiredContracts) {
      const addr = contracts[name];
      const code = await provider.getCode(addr);
      expect(code, `No bytecode at ${name} (${addr})`).not.toBe('0x');
      expect(code.length, `Bytecode too short at ${name}`).toBeGreaterThan(10);
    }
  });

  // E2E-02: L1 setChainInfo registered
  test('L1 setChainInfo registered (tx hashes exist)', async () => {
    // API returns tx hashes at the top level of the 'info' field
    const info = (crossTradeIntegration.info ?? crossTradeIntegration.metadata) as Record<string, unknown>;

    expect(
      info.l1_registration_tx_hash,
      'L1CrossTradeProxy setChainInfo tx hash required'
    ).toBeTruthy();

    expect(
      info.l1_l2l2_tx_hash,
      'L2toL2CrossTradeL1 setChainInfo tx hash required'
    ).toBeTruthy();

    // Optional: verify tx receipts on Sepolia L1
    const sepoliaRpc = process.env.SEPOLIA_RPC_URL;
    if (sepoliaRpc) {
      const l1Provider = new ethers.JsonRpcProvider(sepoliaRpc);
      const receipt1 = await l1Provider.getTransactionReceipt(
        info.l1_registration_tx_hash as string
      );
      expect(receipt1, 'L1 registration tx not found on Sepolia').not.toBeNull();
      expect(receipt1!.status, 'L1 registration tx failed').toBe(1);

      const receipt2 = await l1Provider.getTransactionReceipt(
        info.l1_l2l2_tx_hash as string
      );
      expect(receipt2, 'L1 L2toL2 tx not found on Sepolia').not.toBeNull();
      expect(receipt2!.status, 'L1 L2toL2 tx failed').toBe(1);
    }
  });

  // E2E-03: CrossTrade dApp accessible
  test('CrossTrade dApp accessible at expected URL', async () => {
    const dappUrl = urls.crossTradeUrl ?? 'http://localhost:3004';

    const reachable = await pollUntil(
      async () => {
        try {
          const r = await fetch(dappUrl, { signal: AbortSignal.timeout(5000) });
          return r.status < 500 ? true : null;
        } catch {
          return null;
        }
      },
      `CrossTrade dApp at ${dappUrl}`,
      60_000,
      5_000
    );
    expect(reachable, `CrossTrade dApp not reachable at ${dappUrl}`).toBe(true);
  });
});
