/**
 * Matrix Health Check — DRB (Tier 2)
 *
 * SKIPS for General and DeFi presets (drb not in their module list).
 * Verifies DRB contract bytecode exists on L2 and DRB leader process
 * is listening (port 9600 uses libp2p, not HTTP — probe via TCP).
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/drb-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import { ethers } from 'ethers';
import * as net from 'net';

const DRB_CONTRACT = '0x4200000000000000000000000000000000000060';

const config = getStackConfig();
let urls: StackUrls;

test.describe(`DRB Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.skip(!isModuleEnabled(config.preset, 'drb'), 'DRB not in preset');
    urls = await resolveStackUrls(config.chainName);
  });

  test('DRB contract bytecode exists', async () => {
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);
    const code = await provider.getCode(DRB_CONTRACT);
    expect(code).not.toBe('0x');
    expect(code.length).toBeGreaterThan(10);
  });

  test('DRB leader port listening', async () => {
    // DRB leader uses libp2p (not HTTP) on port 9600.
    // Verify TCP connectivity, not HTTP response.
    const drbPort = parseInt(new URL(urls.drbUrl).port || '9600');
    const drbHost = new URL(urls.drbUrl).hostname;

    const isListening = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: drbHost, port: drbPort, timeout: 5000 });
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => { resolve(false); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });

    expect(isListening, `DRB leader not listening on ${drbHost}:${drbPort}`).toBe(true);
  });
});
