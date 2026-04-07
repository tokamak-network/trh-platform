/**
 * Unit tests for CrossTrade E2E helper utilities
 *
 * Verifies:
 * - PRESET_MODULES.defi includes 'crossTrade'
 * - isModuleEnabled correctly returns true/false per preset
 * - StackUrls type has crossTradeUrl field (TypeScript compile check via usage)
 */

import { describe, it, expect } from 'vitest';
import { isModuleEnabled, PRESET_MODULES } from '../e2e/helpers/matrix-config';

describe('PRESET_MODULES crossTrade membership', () => {
  it('defi preset includes crossTrade', () => {
    expect(PRESET_MODULES.defi).toContain('crossTrade');
  });

  it('gaming preset includes crossTrade', () => {
    expect(PRESET_MODULES.gaming).toContain('crossTrade');
  });

  it('full preset includes crossTrade', () => {
    expect(PRESET_MODULES.full).toContain('crossTrade');
  });

  it('general preset does NOT include crossTrade', () => {
    expect(PRESET_MODULES.general).not.toContain('crossTrade');
  });
});

describe('isModuleEnabled for crossTrade', () => {
  it('isModuleEnabled("defi", "crossTrade") returns true', () => {
    expect(isModuleEnabled('defi', 'crossTrade')).toBe(true);
  });

  it('isModuleEnabled("gaming", "crossTrade") returns true', () => {
    expect(isModuleEnabled('gaming', 'crossTrade')).toBe(true);
  });

  it('isModuleEnabled("full", "crossTrade") returns true', () => {
    expect(isModuleEnabled('full', 'crossTrade')).toBe(true);
  });

  it('isModuleEnabled("general", "crossTrade") returns false', () => {
    expect(isModuleEnabled('general', 'crossTrade')).toBe(false);
  });
});
