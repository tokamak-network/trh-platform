// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock electron before importing keystore
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`ENC:${s}`)),
    decryptString: vi.fn((buf: Buffer) => {
      const str = buf.toString();
      if (!str.startsWith('ENC:')) throw new Error('corrupted');
      return str.slice(4);
    }),
  },
  app: {
    getPath: vi.fn(() => '/tmp/test-keystore'),
  },
}));

// A valid 12-word BIP39 mnemonic for testing
const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const INVALID_MNEMONIC = 'not a valid mnemonic phrase at all';

describe('keystore', () => {
  let keystore: typeof import('./keystore');
  const keystorePath = path.join('/tmp/test-keystore', 'keystore.enc');

  beforeEach(async () => {
    // Clean up any existing file
    if (fs.existsSync(keystorePath)) {
      fs.unlinkSync(keystorePath);
    }
    if (fs.existsSync('/tmp/test-keystore')) {
      fs.rmSync('/tmp/test-keystore', { recursive: true });
    }

    // Reset module cache to get fresh state
    vi.resetModules();
    keystore = await import('./keystore');
  });

  afterEach(() => {
    if (fs.existsSync('/tmp/test-keystore')) {
      fs.rmSync('/tmp/test-keystore', { recursive: true });
    }
  });

  describe('isAvailable', () => {
    it('returns true when safeStorage encryption is available', () => {
      expect(keystore.isAvailable()).toBe(true);
    });

    it('returns false when safeStorage encryption is not available', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
      expect(keystore.isAvailable()).toBe(false);
    });
  });

  describe('validateMnemonic', () => {
    it('validates a correct 12-word mnemonic', () => {
      expect(keystore.validateMnemonic(VALID_MNEMONIC)).toBe(true);
    });

    it('rejects an invalid mnemonic', () => {
      expect(keystore.validateMnemonic(INVALID_MNEMONIC)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(keystore.validateMnemonic('')).toBe(false);
    });

    it('rejects wrong word count (5 words)', () => {
      expect(keystore.validateMnemonic('abandon abandon abandon abandon abandon')).toBe(false);
    });

    it('trims and lowercases input', () => {
      expect(keystore.validateMnemonic(`  ${VALID_MNEMONIC.toUpperCase()}  `)).toBe(true);
    });
  });

  describe('hasSeedPhrase', () => {
    it('returns false when no keystore file exists', () => {
      expect(keystore.hasSeedPhrase()).toBe(false);
    });

    it('returns true after storing a seed phrase', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      expect(keystore.hasSeedPhrase()).toBe(true);
    });
  });

  describe('storeSeedPhrase', () => {
    it('creates encrypted keystore file', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      expect(fs.existsSync(keystorePath)).toBe(true);
    });

    it('throws when encryption is not available', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
      expect(() => keystore.storeSeedPhrase(VALID_MNEMONIC)).toThrow('OS keychain encryption is not available');
    });

    it('throws for invalid mnemonic', () => {
      expect(() => keystore.storeSeedPhrase(INVALID_MNEMONIC)).toThrow('Invalid mnemonic phrase');
    });

    it('creates parent directory if missing', () => {
      expect(fs.existsSync('/tmp/test-keystore')).toBe(false);
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      expect(fs.existsSync('/tmp/test-keystore')).toBe(true);
    });
  });

  describe('getAddresses', () => {
    it('returns addresses for all 5 roles', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      const addresses = keystore.getAddresses();

      expect(addresses).toHaveProperty('admin');
      expect(addresses).toHaveProperty('proposer');
      expect(addresses).toHaveProperty('batcher');
      expect(addresses).toHaveProperty('challenger');
      expect(addresses).toHaveProperty('sequencer');

      // All addresses should be valid Ethereum addresses
      for (const addr of Object.values(addresses)) {
        expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
    });

    it('derives different addresses for each role', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      const addresses = keystore.getAddresses();
      const addrValues = Object.values(addresses);
      const unique = new Set(addrValues);
      expect(unique.size).toBe(5);
    });

    it('throws when no seed phrase is stored', () => {
      expect(() => keystore.getAddresses()).toThrow('No seed phrase stored');
    });
  });

  describe('previewAddresses', () => {
    it('returns addresses without storing', () => {
      const addresses = keystore.previewAddresses(VALID_MNEMONIC);

      expect(Object.keys(addresses)).toEqual(['admin', 'proposer', 'batcher', 'challenger', 'sequencer']);
      expect(keystore.hasSeedPhrase()).toBe(false); // Not stored
    });

    it('returns same addresses as getAddresses after store', () => {
      const preview = keystore.previewAddresses(VALID_MNEMONIC);
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      const stored = keystore.getAddresses();

      expect(preview).toEqual(stored);
    });

    it('throws for invalid mnemonic', () => {
      expect(() => keystore.previewAddresses(INVALID_MNEMONIC)).toThrow('Invalid mnemonic phrase');
    });
  });

  describe('deriveKeysToEnv', () => {
    it('returns private keys as environment variables', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      const env = keystore.deriveKeysToEnv(['admin', 'batcher']);

      expect(env).toHaveProperty('ADMIN_PRIVATE_KEY');
      expect(env).toHaveProperty('BATCHER_PRIVATE_KEY');
      expect(env.ADMIN_PRIVATE_KEY).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(env.BATCHER_PRIVATE_KEY).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('only includes requested roles', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      const env = keystore.deriveKeysToEnv(['sequencer']);

      expect(Object.keys(env)).toEqual(['SEQUENCER_PRIVATE_KEY']);
    });
  });

  describe('deleteSeedPhrase', () => {
    it('removes the keystore file', () => {
      keystore.storeSeedPhrase(VALID_MNEMONIC);
      expect(keystore.hasSeedPhrase()).toBe(true);

      keystore.deleteSeedPhrase();
      expect(keystore.hasSeedPhrase()).toBe(false);
    });

    it('does not throw when no file exists', () => {
      expect(() => keystore.deleteSeedPhrase()).not.toThrow();
    });
  });
});
