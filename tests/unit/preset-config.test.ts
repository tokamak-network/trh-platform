// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPresets } from '../helpers/load-fixtures';
import { PresetDefinitionSchema } from '../schemas/preset.schema';
import type { PresetsFixture } from '../schemas/preset.schema';

// Run `npm run sync-fixtures` to update tests/fixtures/presets.json when backend changes.
const OP_STANDARD_PREDEPLOYS = [
  'L2ToL1MessagePasser',
  'L2CrossDomainMessenger', 'L2StandardBridge', 'L2ERC721Bridge',
  'OptimismMintableERC20Factory', 'OptimismMintableERC721Factory',
  'L1Block', 'GasPriceOracle',
  'SequencerFeeVault', 'BaseFeeVault', 'L1FeeVault',
  'EAS', 'SchemaRegistry',
];

const DEFI_PREDEPLOYS = [
  'UniswapV3Factory', 'UniswapV3SwapRouter',
  'UniswapV3NonfungiblePositionManager', 'USDCBridge', 'WrappedETH',
];

const GAMING_PREDEPLOYS = [
  'VRF', 'VRFCoordinator', 'EntryPoint', 'Paymaster',
];

let presets: PresetsFixture;

beforeAll(() => {
  presets = loadPresets();
});

describe('Fixture validation', () => {
  it('loads presets without errors', () => {
    expect(presets).toBeDefined();
    expect(Object.keys(presets)).toHaveLength(4);
  });

  it.each(['general', 'defi', 'gaming', 'full'] as const)(
    '%s passes Zod schema validation',
    (presetId) => {
      expect(() => PresetDefinitionSchema.parse(presets[presetId])).not.toThrow();
    },
  );
});

describe('PSET-01: Chain parameters', () => {
  it('general: batchSubmissionFrequency=1800, outputRootFrequency=1800, challengePeriod=12', () => {
    const cd = presets.general.chainDefaults;
    expect(cd.batchSubmissionFrequency).toBe(1800);
    expect(cd.outputRootFrequency).toBe(1800);
    expect(cd.challengePeriod).toBe(12);
    expect(cd.l2BlockTime).toBe(2);
  });

  it('defi: batchSubmissionFrequency=900, outputRootFrequency=900, challengePeriod=12', () => {
    const cd = presets.defi.chainDefaults;
    expect(cd.batchSubmissionFrequency).toBe(900);
    expect(cd.outputRootFrequency).toBe(900);
    expect(cd.challengePeriod).toBe(12);
    expect(cd.l2BlockTime).toBe(2);
  });

  it('gaming: batchSubmissionFrequency=300, outputRootFrequency=600, challengePeriod=12', () => {
    const cd = presets.gaming.chainDefaults;
    expect(cd.batchSubmissionFrequency).toBe(300);
    expect(cd.outputRootFrequency).toBe(600);
    expect(cd.challengePeriod).toBe(12);
    expect(cd.l2BlockTime).toBe(2);
  });

  it('full: batchSubmissionFrequency=600, outputRootFrequency=600, challengePeriod=12', () => {
    const cd = presets.full.chainDefaults;
    expect(cd.batchSubmissionFrequency).toBe(600);
    expect(cd.outputRootFrequency).toBe(600);
    expect(cd.challengePeriod).toBe(12);
    expect(cd.l2BlockTime).toBe(2);
  });

  it('all presets have l2BlockTime=2', () => {
    for (const id of ['general', 'defi', 'gaming', 'full'] as const) {
      expect(presets[id].chainDefaults.l2BlockTime).toBe(2);
    }
  });
});

describe('PSET-02: Backup', () => {
  it('general: backupEnabled=false', () => {
    expect(presets.general.chainDefaults.backupEnabled).toBe(false);
  });

  it.each(['defi', 'gaming', 'full'] as const)(
    '%s: backupEnabled=true',
    (presetId) => {
      expect(presets[presetId].chainDefaults.backupEnabled).toBe(true);
    },
  );
});

describe('PSET-03: Infrastructure config', () => {
  it.each(['general', 'defi', 'gaming', 'full'] as const)(
    '%s has estimatedTime with deploy and fundingWait keys',
    (presetId) => {
      const et = presets[presetId].estimatedTime;
      expect(et).toHaveProperty('deploy');
      expect(et).toHaveProperty('fundingWait');
    },
  );

  it('registerCandidate is false for all presets', () => {
    for (const id of ['general', 'defi', 'gaming', 'full'] as const) {
      expect(presets[id].chainDefaults.registerCandidate).toBe(false);
    }
  });
});

describe('PSET-04: Genesis Predeploys', () => {
  it('general has exactly 13 OP standard predeploys', () => {
    expect(presets.general.genesisPredeploys).toHaveLength(13);
  });

  it('defi has 18 predeploys (13 OP + 5 DeFi)', () => {
    expect(presets.defi.genesisPredeploys).toHaveLength(18);
  });

  it('gaming has 17 predeploys (13 OP + 4 Gaming)', () => {
    expect(presets.gaming.genesisPredeploys).toHaveLength(17);
  });

  it('full has 22 predeploys (13 OP + 5 DeFi + 4 Gaming)', () => {
    expect(presets.full.genesisPredeploys).toHaveLength(22);
  });

  it('all presets include all 13 OP standard predeploys', () => {
    for (const id of ['general', 'defi', 'gaming', 'full'] as const) {
      for (const deploy of OP_STANDARD_PREDEPLOYS) {
        expect(presets[id].genesisPredeploys).toContain(deploy);
      }
    }
  });

  it('defi includes all DeFi predeploys', () => {
    for (const deploy of DEFI_PREDEPLOYS) {
      expect(presets.defi.genesisPredeploys).toContain(deploy);
    }
  });

  it('gaming includes all Gaming predeploys', () => {
    for (const deploy of GAMING_PREDEPLOYS) {
      expect(presets.gaming.genesisPredeploys).toContain(deploy);
    }
  });

  it('full includes both DeFi and Gaming predeploys', () => {
    for (const deploy of DEFI_PREDEPLOYS) {
      expect(presets.full.genesisPredeploys).toContain(deploy);
    }
    for (const deploy of GAMING_PREDEPLOYS) {
      expect(presets.full.genesisPredeploys).toContain(deploy);
    }
  });

  it('general does NOT contain any DeFi or Gaming predeploys', () => {
    for (const deploy of DEFI_PREDEPLOYS) {
      expect(presets.general.genesisPredeploys).not.toContain(deploy);
    }
    for (const deploy of GAMING_PREDEPLOYS) {
      expect(presets.general.genesisPredeploys).not.toContain(deploy);
    }
  });
});

describe('PSET-05: Modules', () => {
  it('all presets have bridge=true and blockExplorer=true', () => {
    for (const id of ['general', 'defi', 'gaming', 'full'] as const) {
      expect(presets[id].modules.bridge).toBe(true);
      expect(presets[id].modules.blockExplorer).toBe(true);
    }
  });

  it('general: monitoring=false, crossTrade=false, uptimeService=false', () => {
    const m = presets.general.modules;
    expect(m.monitoring).toBe(false);
    expect(m.crossTrade).toBe(false);
    expect(m.uptimeService).toBe(false);
  });

  it('defi: monitoring=true, crossTrade=true, uptimeService=true', () => {
    const m = presets.defi.modules;
    expect(m.monitoring).toBe(true);
    expect(m.crossTrade).toBe(true);     // UI-01: DeFi has crossTrade
    expect(m.uptimeService).toBe(true);
  });

  it('gaming: monitoring=true, crossTrade=false, uptimeService=true', () => {
    const m = presets.gaming.modules;
    expect(m.monitoring).toBe(true);
    expect(m.crossTrade).toBe(false);    // UI-02: Gaming has no crossTrade
    expect(m.uptimeService).toBe(true);
  });

  it('full: monitoring=true, crossTrade=true, uptimeService=true', () => {
    const m = presets.full.modules;
    expect(m.monitoring).toBe(true);
    expect(m.crossTrade).toBe(true);
    expect(m.uptimeService).toBe(true);
  });
});

describe('PSET-06: Fee Tokens', () => {
  const EXPECTED_FEE_TOKENS = ['TON', 'ETH', 'USDT', 'USDC'];

  it.each(['general', 'defi', 'gaming', 'full'] as const)(
    '%s has exactly ["TON", "ETH", "USDT", "USDC"]',
    (presetId) => {
      expect(presets[presetId].availableFeeTokens).toEqual(EXPECTED_FEE_TOKENS);
    },
  );
});
