/**
 * Full Cycle — Deploy → Verify → Teardown (Single Preset/FeeToken)
 *
 * End-to-end test that programmatically deploys an L2 stack via the
 * preset-deploy API, runs all applicable health checks, then tears
 * the stack down. This proves that a fresh deployment produces a
 * fully functional L2 with working integrations.
 *
 * Environment:
 *   LIVE_PRESET     — preset to deploy (default: gaming)
 *   LIVE_FEE_TOKEN  — fee token (default: USDC)
 *   LIVE_CHAIN_NAME — chain name (default: auto-generated)
 *   LIVE_L1_RPC_URL — L1 RPC for devnet (default: http://localhost:8545)
 *   LIVE_SEED_PHRASE — 12-word mnemonic (default: test mnemonic)
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/full-cycle.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled, needsAASetup } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import { deployPreset, waitForDeployed, teardownStack } from '../helpers/deploy-helper';
import { checkL2Rpc, checkL2ChainId, checkBlockProduction, checkOpNodeSync } from '../helpers/health-checks';
import { pollUntil } from '../helpers/poll';

const config = getStackConfig();

// Chain name: use env var or deterministic default (no random/timestamp — Playwright
// serializes test titles across main and worker processes, so they must be stable).
const chainName = config.chainName;

let stackId = '';
let urls: StackUrls;

test.describe(`Full Cycle [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial', timeout: 900_000 }); // 15 min total

  // =========================================================================
  // Phase 1: Deploy
  // =========================================================================

  test('deploy L2 via preset-deploy API', async () => {
    test.setTimeout(300_000); // 5 min (includes ensureNoActiveStacks + API call + stack resolve)
    const result = await deployPreset({
      preset: config.preset,
      feeToken: config.feeToken,
      chainName,
    });
    stackId = result.stackId;
    expect(stackId).toBeTruthy();
    console.log(`[full-cycle] Deployment started: stackId=${stackId}`);
  });

  test('wait for deployment to complete', async () => {
    test.setTimeout(1200_000); // 20 min
    expect(stackId).toBeTruthy();
    const status = await waitForDeployed(stackId);
    expect(status.status).toBe('Deployed');
    console.log(`[full-cycle] Stack deployed: ${status.chainName}`);
  });

  test('resolve service URLs', async () => {
    test.setTimeout(30_000);
    // Wait a few seconds for services to be fully reachable after deploy
    await new Promise(r => setTimeout(r, 5000));
    urls = await resolveStackUrls(chainName);
    expect(urls.stackId).toBeTruthy();
    console.log(`[full-cycle] URLs resolved — L2 RPC: ${urls.l2Rpc}`);
  });

  // =========================================================================
  // Phase 2: Core Chain Health (all presets)
  // =========================================================================

  test('L2 RPC alive', async () => {
    test.setTimeout(60_000);
    const blockNumber = await pollUntil(
      async () => {
        try {
          const bn = await checkL2Rpc(urls.l2Rpc);
          return bn > 0 ? bn : null;
        } catch {
          return null;
        }
      },
      'L2 RPC to respond',
      60_000,
      5_000
    );
    expect(blockNumber).toBeGreaterThan(0);
  });

  test('L2 chain ID valid', async () => {
    const chainId = await checkL2ChainId(urls.l2Rpc);
    expect(chainId).toBeGreaterThan(0);
  });

  test('L2 blocks advancing', async () => {
    test.setTimeout(60_000);
    const result = await checkBlockProduction(urls.l2Rpc, 10_000);
    expect(result.newBlocks).toBeGreaterThan(0);
  });

  test('op-node sync status', async () => {
    test.setTimeout(120_000);
    const sync = await pollUntil(
      async () => {
        try {
          const s = await checkOpNodeSync();
          return s.headL2 > 0 ? s : null;
        } catch {
          return null;
        }
      },
      'op-node headL2 > 0',
      120_000,
      10_000
    );
    expect(sync.headL2).toBeGreaterThan(0);
  });

  // =========================================================================
  // Phase 3: Bridge (all presets)
  // =========================================================================

  test('bridge UI reachable', async () => {
    test.setTimeout(60_000);
    const ok = await pollUntil(
      async () => {
        try {
          const resp = await fetch(urls.bridgeUrl, { redirect: 'follow' });
          return resp.ok ? true : null;
        } catch {
          return null;
        }
      },
      'bridge UI to respond',
      60_000,
      5_000
    );
    expect(ok).toBe(true);
  });

  // =========================================================================
  // Phase 4: Block Explorer (all presets)
  // =========================================================================

  test('explorer API reachable', async () => {
    test.setTimeout(120_000);
    const blocks = await pollUntil(
      async () => {
        try {
          const resp = await fetch(`${urls.explorerApiUrl}/blocks?limit=1`);
          if (!resp.ok) return null;
          const body = await resp.json() as Record<string, unknown>;
          const items = (body.items as unknown[]) ?? [];
          return items.length > 0 ? items : null;
        } catch {
          return null;
        }
      },
      'Blockscout API to return blocks',
      120_000,
      10_000
    );
    expect(blocks).toBeTruthy();
  });

  // =========================================================================
  // Phase 5: Monitoring (DeFi, Gaming, Full)
  // =========================================================================

  test('Grafana health', async () => {
    if (!isModuleEnabled(config.preset, 'monitoring')) {
      test.skip();
      return;
    }
    test.setTimeout(60_000);
    const ok = await pollUntil(
      async () => {
        try {
          const resp = await fetch(`${urls.grafanaUrl}/api/health`);
          if (!resp.ok) return null;
          const body = await resp.json() as Record<string, unknown>;
          return body.database === 'ok' ? true : null;
        } catch {
          return null;
        }
      },
      'Grafana health',
      60_000,
      5_000
    );
    expect(ok).toBe(true);
  });

  // =========================================================================
  // Phase 6: Uptime Service (DeFi, Gaming, Full)
  // =========================================================================

  test('Uptime Kuma reachable', async () => {
    if (!isModuleEnabled(config.preset, 'uptimeService')) {
      test.skip();
      return;
    }
    test.setTimeout(60_000);
    const ok = await pollUntil(
      async () => {
        try {
          const resp = await fetch(urls.uptimeUrl);
          return resp.ok ? true : null;
        } catch {
          return null;
        }
      },
      'Uptime Kuma',
      60_000,
      5_000
    );
    expect(ok).toBe(true);
  });

  // =========================================================================
  // Phase 7: DRB (Gaming, Full)
  // =========================================================================

  test('DRB leader reachable', async () => {
    if (!isModuleEnabled(config.preset, 'drb')) {
      test.skip();
      return;
    }
    test.setTimeout(30_000);
    const ok = await pollUntil(
      async () => {
        try {
          const resp = await fetch(urls.drbUrl);
          return resp.ok || resp.status === 405 ? true : null;
        } catch {
          return null;
        }
      },
      'DRB leader',
      30_000,
      5_000
    );
    expect(ok).toBe(true);
  });

  // =========================================================================
  // Phase 8: AA Paymaster (non-TON fee token only)
  // =========================================================================

  test('AA paymaster contract deployed', async () => {
    if (!needsAASetup(config.feeToken)) {
      test.skip();
      return;
    }
    test.setTimeout(30_000);
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const paymasterAddr = '0x4200000000000000000000000000000000000067';
    const code = await provider.getCode(paymasterAddr);
    expect(code.length).toBeGreaterThan(10);
  });

  test('AA bundler alive', async () => {
    if (!needsAASetup(config.feeToken)) {
      test.skip();
      return;
    }
    test.setTimeout(60_000);
    const ok = await pollUntil(
      async () => {
        try {
          const resp = await fetch(urls.bundlerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_supportedEntryPoints',
              params: [],
              id: 1,
            }),
          });
          if (!resp.ok) return null;
          const body = await resp.json() as Record<string, unknown>;
          const result = body.result as string[] | undefined;
          return result && result.length > 0 ? true : null;
        } catch {
          return null;
        }
      },
      'AA bundler',
      60_000,
      5_000
    );
    expect(ok).toBe(true);
  });

  // =========================================================================
  // Teardown
  // =========================================================================

  test.afterAll(async () => {
    if (!stackId) {
      console.log('[full-cycle] No stackId — skipping teardown');
      return;
    }
    try {
      await teardownStack(stackId);
      console.log(`[full-cycle] Stack ${stackId} torn down`);
    } catch (err) {
      console.warn(`[full-cycle] Teardown failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
});
