/**
 * Matrix Health Check — DRB (Tier 2)
 *
 * SKIPS for General and DeFi presets (drb not in their module list).
 * Verifies DRB leader process responds and DRB contract bytecode exists on L2.
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/drb-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import { ethers } from 'ethers';

const DRB_CONTRACT = '0x4200000000000000000000000000000000000060';

const config = getStackConfig();
let urls: StackUrls;

test.describe(`DRB Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.skip(!isModuleEnabled(config.preset, 'drb'), 'DRB not in preset');
    urls = await resolveStackUrls(config.chainName);
  });

  test('DRB leader process responds', async () => {
    try {
      const resp = await fetch(urls.drbUrl);
      expect(resp).toBeTruthy();
    } catch {
      expect(false, `DRB leader not reachable at ${urls.drbUrl}`).toBeTruthy();
    }
  });

  test('DRB contract bytecode exists', async () => {
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const code = await provider.getCode(DRB_CONTRACT);
    expect(code).not.toBe('0x');
  });
});
