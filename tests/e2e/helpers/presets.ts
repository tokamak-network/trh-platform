/**
 * Preset Data Helper
 *
 * Loads preset definitions from tests/fixtures/presets.json and exposes
 * typed helpers + address constants for preset-based verification tests.
 *
 * Address constants are sourced from:
 *   - OP Stack standard predeploys (well-known 0x4200... slots)
 *   - DRB addresses: docs/prd-drb-node-auto-install.md
 *   - AA addresses: tests/e2e/matrix/aa-health.live.spec.ts, paymaster-smoke.spec.ts
 *   - DeFi Uniswap addresses: TODO — not yet confirmed from deployment config
 */

import type { Preset } from './matrix-config';

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

export interface ChainDefaults {
  l2BlockTime: number;
  batchSubmissionFrequency: number;
  outputRootFrequency: number;
  challengePeriod: number;
  backupEnabled: boolean;
  registerCandidate: boolean;
}

export interface PresetData {
  id: string;
  name: string;
  chainDefaults: ChainDefaults;
  modules: Record<string, boolean>;
  genesisPredeploys: string[];
  overridableFields: string[];
}

// ---------------------------------------------------------------------------
// Fixture load
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PRESETS_JSON = require('../../fixtures/presets.json') as Record<string, PresetData>;

export function getPresetData(preset: Preset): PresetData {
  const data = PRESETS_JSON[preset];
  if (!data) throw new Error(`Unknown preset: ${preset}`);
  return data;
}

// ---------------------------------------------------------------------------
// Known predeploy addresses (OP Stack standard)
//
// Source: https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/constants.ts
// These are deterministic for all OP-based chains.
// ---------------------------------------------------------------------------

export const OP_STANDARD_ADDRESSES: Record<string, string> = {
  L2ToL1MessagePasser:              '0x4200000000000000000000000000000000000016',
  L2CrossDomainMessenger:           '0x4200000000000000000000000000000000000007',
  L2StandardBridge:                 '0x4200000000000000000000000000000000000010',
  L2ERC721Bridge:                   '0x4200000000000000000000000000000000000014',
  OptimismMintableERC20Factory:     '0x4200000000000000000000000000000000000012',
  OptimismMintableERC721Factory:    '0x4200000000000000000000000000000000000017',
  L1Block:                          '0x4200000000000000000000000000000000000015',
  GasPriceOracle:                   '0x420000000000000000000000000000000000000F',
  SequencerFeeVault:                '0x4200000000000000000000000000000000000011',
  BaseFeeVault:                     '0x4200000000000000000000000000000000000019',
  L1FeeVault:                       '0x420000000000000000000000000000000000001A',
  // SchemaRegistry and EAS are in presets.json but addresses vary by chain.
  // TODO: confirm actual deployed addresses from Thanos genesis config.
};

// ---------------------------------------------------------------------------
// DRB predeploy addresses
// Source: docs/prd-drb-node-auto-install.md
// ---------------------------------------------------------------------------

export const DRB_ADDRESSES = {
  DRB:            '0x4200000000000000000000000000000000000060',
  VRF:            '0x4200000000000000000000000000000000000200',
  VRFCoordinator: '0x4200000000000000000000000000000000000201',
  // Commit2RevealDRB at 0x...0202 is planned but not yet deployed.
} as const;

// ---------------------------------------------------------------------------
// AA predeploy addresses (ERC-4337 v0.8)
// Source: tests/e2e/matrix/aa-health.live.spec.ts, tests/e2e/paymaster-smoke.spec.ts
// ---------------------------------------------------------------------------

export const AA_ADDRESSES = {
  EntryPoint:          '0x4200000000000000000000000000000000000063',
  SimplePriceOracle:   '0x4200000000000000000000000000000000000066',
  MultiTokenPaymaster: '0x4200000000000000000000000000000000000067',
  Simple7702Account:   '0x4200000000000000000000000000000000000068',
} as const;

// ---------------------------------------------------------------------------
// DeFi-specific predeploy addresses
// Source: TODO — confirm from deployment config or Thanos genesis block
// UniswapV3 addresses are deployment-specific (not at canonical mainnet addresses).
// ---------------------------------------------------------------------------

// placeholder — replace with confirmed genesis addresses when available
export const DEFI_ADDRESSES: Record<string, string> = {
  // UniswapV3Factory:                    'TODO',
  // UniswapV3SwapRouter:                 'TODO',
  // UniswapV3NonfungiblePositionManager: 'TODO',
  // USDCBridge:                          'TODO',
  // WrappedETH (WETH9 predeploy):        '0x4200000000000000000000000000000000000006',
};
