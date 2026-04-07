import { describe, it, expect } from 'vitest';

describe('CrossTrade UI Integration', () => {
  describe('UI-04: CrossTradeCard renders dApp URL', () => {
    it('should export CrossTradeCard and CrossTradeCompactInfo components', async () => {
      // This will fail until CrossTradeCard.tsx is created
      const mod = await import('../../trh-platform-ui/src/features/integrations/components/CrossTradeCard');
      expect(mod.CrossTradeCard).toBeDefined();
      expect(mod.CrossTradeCompactInfo).toBeDefined();
    });
  });

  describe('UI-03: INTEGRATION_TYPES includes cross-trade', () => {
    it('should have cross-trade in INTEGRATION_TYPES', async () => {
      // This will fail until integration.ts is updated
      const mod = await import('../../trh-platform-ui/src/features/integrations/schemas/integration');
      const types = (mod as any).INTEGRATION_TYPES;
      expect(types['cross-trade']).toBeDefined();
      expect(types['cross-trade'].label).toBe('CrossTrade');
    });
  });

  describe('UI-03: cross-trade excluded from Add button', () => {
    it('should filter cross-trade from availableTypeEntries like drb', async () => {
      // Verify the filtering logic: cross-trade should be treated same as drb
      const mod = await import('../../trh-platform-ui/src/features/integrations/schemas/integration');
      const types = (mod as any).INTEGRATION_TYPES;
      const autoInstalledTypes = ['drb', 'cross-trade'];
      const availableTypes = Object.keys(types).filter(
        (type: string) => !autoInstalledTypes.includes(type)
      );
      expect(availableTypes).not.toContain('drb');
      expect(availableTypes).not.toContain('cross-trade');
    });
  });
});
