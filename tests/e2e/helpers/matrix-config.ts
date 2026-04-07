/**
 * Matrix Configuration — Preset/Module mapping and stack config resolution
 *
 * Reads LIVE_PRESET, LIVE_FEE_TOKEN, LIVE_CHAIN_NAME from environment and
 * provides the preset→module mapping used by matrix verification tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Preset = 'general' | 'defi' | 'gaming' | 'full';

export type FeeToken = 'TON' | 'ETH' | 'USDT' | 'USDC';

export type ModuleName =
  | 'bridge'
  | 'blockExplorer'
  | 'monitoring'
  | 'uptimeService'
  | 'crossTrade'
  | 'drb';

export interface StackConfig {
  preset: Preset;
  feeToken: FeeToken;
  chainName: string;
}

// ---------------------------------------------------------------------------
// Preset → Module matrix
// ---------------------------------------------------------------------------

export const PRESET_MODULES: Record<Preset, ModuleName[]> = {
  general: ['bridge', 'blockExplorer'],
  defi: ['bridge', 'blockExplorer', 'monitoring', 'uptimeService', 'crossTrade'],
  gaming: ['bridge', 'blockExplorer', 'monitoring', 'uptimeService', 'crossTrade', 'drb'],
  full: ['bridge', 'blockExplorer', 'monitoring', 'uptimeService', 'crossTrade', 'drb'],
};

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const VALID_PRESETS: readonly Preset[] = ['general', 'defi', 'gaming', 'full'];
const VALID_FEE_TOKENS: readonly FeeToken[] = ['TON', 'ETH', 'USDT', 'USDC'];

function isPreset(value: string): value is Preset {
  return (VALID_PRESETS as readonly string[]).includes(value);
}

function isFeeToken(value: string): value is FeeToken {
  return (VALID_FEE_TOKENS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Check whether a given module is enabled for a preset.
 */
export function isModuleEnabled(preset: Preset, module: ModuleName): boolean {
  return PRESET_MODULES[preset].includes(module);
}

/**
 * AA setup is required for all presets when feeToken is not TON.
 * TON = native token — no paymaster needed.
 */
export function needsAASetup(feeToken: FeeToken): boolean {
  return feeToken !== 'TON';
}

/**
 * Read stack configuration from environment variables with validation and defaults.
 *
 * - LIVE_PRESET   → default 'gaming'
 * - LIVE_FEE_TOKEN → default 'USDC'
 * - LIVE_CHAIN_NAME → default '{feeToken.toLowerCase()}-{preset}'
 */
export function getStackConfig(): StackConfig {
  const rawPreset = process.env.LIVE_PRESET ?? 'gaming';
  if (!isPreset(rawPreset)) {
    throw new Error(
      `Invalid LIVE_PRESET="${rawPreset}". Must be one of: ${VALID_PRESETS.join(', ')}`
    );
  }

  const rawFeeToken = process.env.LIVE_FEE_TOKEN ?? 'USDC';
  if (!isFeeToken(rawFeeToken)) {
    throw new Error(
      `Invalid LIVE_FEE_TOKEN="${rawFeeToken}". Must be one of: ${VALID_FEE_TOKENS.join(', ')}`
    );
  }

  const chainName =
    process.env.LIVE_CHAIN_NAME ?? `${rawFeeToken.toLowerCase()}-${rawPreset}`;

  return {
    preset: rawPreset,
    feeToken: rawFeeToken,
    chainName,
  };
}
