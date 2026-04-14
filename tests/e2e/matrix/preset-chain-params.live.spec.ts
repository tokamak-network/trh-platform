/**
 * Matrix Verification — Chain Parameters (Spec B)
 *
 * Verifies that the deployed L2 chain's parameters match the chainDefaults
 * defined in tests/fixtures/presets.json (single source of truth).
 *
 * Verification methods:
 *   CP-01 — l2BlockTime ≈ 2s (from consecutive block timestamps)
 *   CP-02 — batchSubmissionFrequency matches presets.json.chainDefaults (API)
 *   CP-03 — outputRootFrequency matches presets.json.chainDefaults (API)
 *   CP-04 — backupEnabled matches presets.json.chainDefaults (API)
 *
 * Usage:
 *   LIVE_PRESET=general LIVE_FEE_TOKEN=TON LIVE_CHAIN_NAME=ton-general \
 *     npx playwright test --config playwright.live.config.ts \
 *     tests/e2e/matrix/preset-chain-params.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls, loginBackend } from '../helpers/stack-resolver';
import { getPresetData } from '../helpers/presets';
import { ethers } from 'ethers';

const BACKEND_URL = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';

const config = getStackConfig();
const presetData = getPresetData(config.preset);
let urls: StackUrls;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe(`Chain Params [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    urls = await resolveStackUrls(config.chainName);
  });

  // -------------------------------------------------------------------------
  // CP-01: l2BlockTime ≈ 2s
  // Compare timestamps of two consecutive L2 blocks.
  // -------------------------------------------------------------------------

  test('CP-01: l2BlockTime is ~2 seconds', async () => {
    const provider = new ethers.JsonRpcProvider(urls.l2Rpc);

    // Get latest block number and fetch two consecutive blocks
    const latest = await provider.getBlockNumber();
    expect(latest, 'L2 chain must have at least 2 blocks').toBeGreaterThanOrEqual(2);

    const [blockA, blockB] = await Promise.all([
      provider.getBlock(latest - 1),
      provider.getBlock(latest),
    ]);

    expect(blockA, 'Block N-1 must exist').not.toBeNull();
    expect(blockB, 'Block N must exist').not.toBeNull();

    const diff = blockB!.timestamp - blockA!.timestamp;
    const expectedBlockTime = presetData.chainDefaults.l2BlockTime;

    console.log(
      `[CP-01] Block ${latest - 1}→${latest}: timestamp diff = ${diff}s (expected ~${expectedBlockTime}s)`,
    );

    // Allow ±1s tolerance (mining is asynchronous)
    expect(
      diff,
      `l2BlockTime diff should be ~${expectedBlockTime}s, got ${diff}s`,
    ).toBeGreaterThanOrEqual(expectedBlockTime - 1);
    expect(
      diff,
      `l2BlockTime diff should be ~${expectedBlockTime}s, got ${diff}s`,
    ).toBeLessThanOrEqual(expectedBlockTime + 1);
  });

  // -------------------------------------------------------------------------
  // CP-02: batchSubmissionFrequency (from stack metadata API)
  // -------------------------------------------------------------------------

  test('CP-02: batchSubmissionFrequency matches presets.json', async () => {
    const token = await loginBackend(BACKEND_URL);
    const resp = await fetch(
      `${BACKEND_URL}/api/v1/stacks/thanos/${urls.stackId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(resp.ok, `Stack metadata API returned HTTP ${resp.status}`).toBe(true);

    const body = await resp.json() as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;

    const actual = data.batchSubmissionFrequency ?? data.batch_submission_frequency;
    const expected = presetData.chainDefaults.batchSubmissionFrequency;

    console.log(
      `[CP-02] batchSubmissionFrequency: actual=${actual}, expected=${expected}`,
    );

    expect(
      Number(actual),
      `batchSubmissionFrequency should be ${expected} for ${config.preset}`,
    ).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // CP-03: outputRootFrequency (from stack metadata API)
  // -------------------------------------------------------------------------

  test('CP-03: outputRootFrequency matches presets.json', async () => {
    const token = await loginBackend(BACKEND_URL);
    const resp = await fetch(
      `${BACKEND_URL}/api/v1/stacks/thanos/${urls.stackId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(resp.ok, `Stack metadata API returned HTTP ${resp.status}`).toBe(true);

    const body = await resp.json() as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;

    const actual = data.outputRootFrequency ?? data.output_root_frequency;
    const expected = presetData.chainDefaults.outputRootFrequency;

    console.log(
      `[CP-03] outputRootFrequency: actual=${actual}, expected=${expected}`,
    );

    expect(
      Number(actual),
      `outputRootFrequency should be ${expected} for ${config.preset}`,
    ).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // CP-04: backupEnabled (from stack metadata API)
  // -------------------------------------------------------------------------

  test('CP-04: backupEnabled matches presets.json', async () => {
    const token = await loginBackend(BACKEND_URL);
    const resp = await fetch(
      `${BACKEND_URL}/api/v1/stacks/thanos/${urls.stackId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(resp.ok, `Stack metadata API returned HTTP ${resp.status}`).toBe(true);

    const body = await resp.json() as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;

    const actual = data.backupEnabled ?? data.backup_enabled;
    const expected = presetData.chainDefaults.backupEnabled;

    console.log(
      `[CP-04] backupEnabled: actual=${actual}, expected=${expected}`,
    );

    expect(
      Boolean(actual),
      `backupEnabled should be ${expected} for ${config.preset}`,
    ).toBe(expected);
  });
});
