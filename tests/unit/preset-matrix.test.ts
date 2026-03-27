// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPresets } from '../helpers/load-fixtures';
import { PresetDefinitionSchema } from '../schemas/preset.schema';
import type { PresetsFixture } from '../schemas/preset.schema';

const PRESET_IDS = ['general', 'defi', 'gaming', 'full'] as const;
const INFRA_PROVIDERS = ['local', 'aws'] as const;

// Run `npm run sync-fixtures` to update tests/fixtures/presets.json when backend changes.
const OP_STANDARD_PREDEPLOYS = [
  'L2ToL1MessagePasser',
  'L2CrossDomainMessenger', 'L2StandardBridge', 'L2ERC721Bridge',
  'OptimismMintableERC20Factory', 'OptimismMintableERC721Factory',
  'L1Block', 'GasPriceOracle',
  'SequencerFeeVault', 'BaseFeeVault', 'L1FeeVault',
  'EAS', 'SchemaRegistry',
];

let presets: PresetsFixture;

beforeAll(() => {
  presets = loadPresets();
});

describe.each(PRESET_IDS)('Preset: %s', (presetId) => {
  it.each(INFRA_PROVIDERS)('infra: %s - passes schema validation', (_infra) => {
    const preset = presets[presetId];
    expect(() => PresetDefinitionSchema.parse(preset)).not.toThrow();
  });

  it.each(INFRA_PROVIDERS)('infra: %s - chain defaults are valid positive integers', (_infra) => {
    const cd = presets[presetId].chainDefaults;
    expect(cd.l2BlockTime).toBeGreaterThan(0);
    expect(cd.batchSubmissionFrequency).toBeGreaterThan(0);
    expect(cd.outputRootFrequency).toBeGreaterThan(0);
    expect(cd.challengePeriod).toBeGreaterThan(0);
  });

  it.each(INFRA_PROVIDERS)('infra: %s - has exactly 5 module keys', (_infra) => {
    expect(Object.keys(presets[presetId].modules)).toHaveLength(5);
  });

  it.each(INFRA_PROVIDERS)('infra: %s - includes all OP standard predeploys', (_infra) => {
    const predeploys = presets[presetId].genesisPredeploys;
    for (const deploy of OP_STANDARD_PREDEPLOYS) {
      expect(predeploys).toContain(deploy);
    }
  });

  it.each(INFRA_PROVIDERS)('infra: %s - has estimated deploy and funding wait times', (_infra) => {
    expect(presets[presetId].estimatedTime).toHaveProperty('deploy');
    expect(presets[presetId].estimatedTime).toHaveProperty('fundingWait');
  });

  it.each(INFRA_PROVIDERS)('infra: %s - has non-empty fee tokens', (_infra) => {
    expect(presets[presetId].availableFeeTokens.length).toBeGreaterThan(0);
  });
});
