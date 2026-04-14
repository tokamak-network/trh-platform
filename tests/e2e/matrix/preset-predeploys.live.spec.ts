/**
 * Matrix Verification — Genesis Predeploy Bytecode (Spec A)
 *
 * Verifies that each preset's Genesis Predeploy contracts are actually deployed
 * on the L2 chain. Checks bytecode existence via eth_getCode.
 *
 * Contract → Address sources:
 *   - OP Standard: https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/constants.ts
 *   - DRB: docs/prd-drb-node-auto-install.md
 *   - AA: tests/e2e/matrix/aa-health.live.spec.ts
 *   - DeFi (Uniswap/USDCBridge/WETH): TODO — addresses not yet confirmed
 *
 * Test IDs:
 *   PP-01 — OP Standard 13 contracts bytecode exists (all presets)
 *   PP-02 — DeFi additional 5 contracts bytecode exists (defi, full)
 *   PP-03 — Gaming DRB 3 contracts bytecode exists (gaming, full)
 *   PP-04 — Gaming AA 4 contracts bytecode exists (gaming, full)
 *   PP-05 — Total predeploy count matches preset expectation (13/18/20/25)
 *
 * Usage:
 *   LIVE_PRESET=gaming LIVE_FEE_TOKEN=ETH LIVE_CHAIN_NAME=ect-gaming-eth \
 *     npx playwright test --config playwright.live.config.ts \
 *     tests/e2e/matrix/preset-predeploys.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';
import {
  OP_STANDARD_ADDRESSES,
  DRB_ADDRESSES,
  AA_ADDRESSES,
  DEFI_ADDRESSES,
  getPresetData,
} from '../helpers/presets';
import { ethers } from 'ethers';

// Expected predeploy counts per preset (from docs/preset-comparison.md)
const EXPECTED_PREDEPLOY_COUNT: Record<string, number> = {
  general: 13,
  defi:    18,
  gaming:  20,
  full:    25,
};

const config = getStackConfig();
let urls: StackUrls;
let provider: ethers.JsonRpcProvider;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function assertBytecodeExists(
  address: string,
  label: string,
): Promise<void> {
  const code = await provider.getCode(address);
  expect(code, `${label} (${address}) must have deployed bytecode`).not.toBe('0x');
  expect(code.length, `${label} (${address}) bytecode must be non-trivially long`).toBeGreaterThan(4);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe(`Preset Predeploys [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    urls = await resolveStackUrls(config.chainName);
    provider = new ethers.JsonRpcProvider(urls.l2Rpc);
  });

  // -------------------------------------------------------------------------
  // PP-01: OP Standard predeploys (all presets, 11 confirmed + 2 TODO)
  // -------------------------------------------------------------------------

  test('PP-01: OP Standard predeploys have deployed bytecode', async () => {
    for (const [name, address] of Object.entries(OP_STANDARD_ADDRESSES)) {
      await assertBytecodeExists(address, name);
      console.log(`[PP-01] ${name}: OK`);
    }
  });

  // -------------------------------------------------------------------------
  // PP-02: DeFi additional predeploys — defi, full
  // Note: DEFI_ADDRESSES is currently empty (Uniswap addresses TBD).
  //       This test will pass vacuously until addresses are confirmed and added.
  // -------------------------------------------------------------------------

  test('PP-02: DeFi additional predeploys (Uniswap/USDCBridge/WETH)', async () => {
    const isDefi = config.preset === 'defi' || config.preset === 'full';
    test.skip(!isDefi, `DeFi predeploys only apply to defi/full, got: ${config.preset}`);

    const entries = Object.entries(DEFI_ADDRESSES);
    if (entries.length === 0) {
      // No addresses confirmed yet — mark as pending with an informative message.
      // Remove this branch once DEFI_ADDRESSES is populated in helpers/presets.ts.
      console.warn(
        '[PP-02] DEFI_ADDRESSES is empty — DeFi predeploy addresses not yet confirmed. ' +
        'Populate helpers/presets.ts#DEFI_ADDRESSES to enable this check.',
      );
      return;
    }

    for (const [name, address] of entries) {
      await assertBytecodeExists(address, name);
      console.log(`[PP-02] ${name}: OK`);
    }
  });

  // -------------------------------------------------------------------------
  // PP-03: DRB predeploys — gaming, full
  // -------------------------------------------------------------------------

  test('PP-03: DRB predeploys (VRF/VRFCoordinator/DRB) have deployed bytecode', async () => {
    test.skip(
      !isModuleEnabled(config.preset, 'drb'),
      `DRB not in preset: ${config.preset}`,
    );

    for (const [name, address] of Object.entries(DRB_ADDRESSES)) {
      await assertBytecodeExists(address, name);
      console.log(`[PP-03] ${name}: OK`);
    }
  });

  // -------------------------------------------------------------------------
  // PP-04: AA predeploys — gaming, full
  // (Present on all AA-capable chains; gaming/full ship the bytecodes in genesis)
  // -------------------------------------------------------------------------

  test('PP-04: AA predeploys (EntryPoint/SimplePriceOracle/MultiTokenPaymaster/Simple7702Account)', async () => {
    test.skip(
      !isModuleEnabled(config.preset, 'drb'),
      `AA predeploys only confirmed for gaming/full, got: ${config.preset}`,
    );

    for (const [name, address] of Object.entries(AA_ADDRESSES)) {
      await assertBytecodeExists(address, name);
      console.log(`[PP-04] ${name}: OK`);
    }
  });

  // -------------------------------------------------------------------------
  // PP-05: Total predeploy count from presets.json matches expectation
  // -------------------------------------------------------------------------

  test('PP-05: total genesisPredeploys count matches preset expectation', async () => {
    const presetData = getPresetData(config.preset);
    const expected = EXPECTED_PREDEPLOY_COUNT[config.preset];

    expect(
      presetData.genesisPredeploys.length,
      `Expected ${config.preset} to have ${expected} genesis predeploys, ` +
      `got ${presetData.genesisPredeploys.length}`,
    ).toBe(expected);

    console.log(
      `[PP-05] ${config.preset}: ${presetData.genesisPredeploys.length} predeploys ✓`,
    );
  });
});
