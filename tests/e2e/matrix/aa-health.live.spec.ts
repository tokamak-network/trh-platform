// Tier 2: Verifies AA infrastructure contracts + bundler. UserOp execution is Tier 3 (paymaster-smoke.live.spec.ts).

/**
 * Matrix Health Check — AA Paymaster (Tier 2)
 *
 * SKIPS when feeToken is TON (native token — no paymaster needed).
 * Verifies Paymaster and EntryPoint bytecodes exist on L2 and the bundler
 * is responsive.
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/aa-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, needsAASetup } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import { pollUntil } from '../helpers/poll';
import { ethers } from 'ethers';

const PAYMASTER = '0x4200000000000000000000000000000000000067';
const ENTRYPOINT_V08 = '0x4200000000000000000000000000000000000063';

const config = getStackConfig();
let urls: StackUrls;

test.describe(`AA Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.skip(!needsAASetup(config.feeToken), 'AA not active for TON fee token');
    urls = await resolveStackUrls(config.chainName);
  });

  test('Paymaster contract bytecode exists', async () => {
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const code = await provider.getCode(PAYMASTER);
    expect(code.length).toBeGreaterThan(2);
  });

  test('EntryPoint v0.8 bytecode exists', async () => {
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const code = await provider.getCode(ENTRYPOINT_V08);
    expect(code.length).toBeGreaterThan(2);
  });

  test('Bundler alive (eth_supportedEntryPoints)', async () => {
    // Bundler (alto) starts after bridge funding + AA setup. May take 1-2 min.
    // Poll instead of single-shot check.
    test.setTimeout(120_000);
    const result = await pollUntil(
      async () => {
        try {
          const r = await fetch(urls.bundlerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_supportedEntryPoints', params: [], id: 1 }) });
          if (!r.ok) return null;
          const b = await r.json() as { result?: string[] };
          return b.result && b.result.length > 0 ? b.result : null;
        } catch { return null; }
      },
      'bundler eth_supportedEntryPoints',
      90_000,
      10_000
    );

    expect(result).toBeDefined();
    expect(result!.map((a: string) => a.toLowerCase())).toContain(ENTRYPOINT_V08.toLowerCase());
  });
});
