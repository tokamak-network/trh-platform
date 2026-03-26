// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HDNodeWallet } from 'ethers';
import { validateFunding, getMinBalance, DEFAULT_THRESHOLDS } from '../helpers/funding';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Alternative valid mnemonic for different-address test
const ALT_MNEMONIC =
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

// Mirrors keystore.ts ROLE_INDICES exactly
const ROLES = ['admin', 'proposer', 'batcher', 'challenger', 'sequencer'] as const;
const ROLE_INDICES: Record<string, number> = {
  admin: 0,
  proposer: 1,
  batcher: 2,
  challenger: 3,
  sequencer: 4,
};

function deriveAddress(mnemonic: string, index: number): string {
  const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
  return wallet.address;
}

function deriveAllAddresses(mnemonic: string): Record<string, string> {
  const addresses: Record<string, string> = {};
  for (const role of ROLES) {
    addresses[role] = deriveAddress(mnemonic, ROLE_INDICES[role]);
  }
  return addresses;
}

// Helper: build balances record for all roles with a given amount
function makeBalances(amount: bigint): Record<string, bigint> {
  const balances: Record<string, bigint> = {};
  for (const role of ROLES) {
    balances[role] = amount;
  }
  return balances;
}

describe('FUND-01: BIP44 Key Derivation', () => {
  it('derives 5 unique addresses from test mnemonic', () => {
    const addresses = deriveAllAddresses(TEST_MNEMONIC);
    const values = Object.values(addresses);
    expect(values).toHaveLength(5);
    expect(new Set(values).size).toBe(5);
  });

  it('all addresses are valid Ethereum format', () => {
    const addresses = deriveAllAddresses(TEST_MNEMONIC);
    for (const addr of Object.values(addresses)) {
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("uses correct BIP44 path m/44'/60'/0'/0/{index}", () => {
    // Verify each role maps to the correct index
    for (const role of ROLES) {
      const expectedIndex = ROLE_INDICES[role];
      const directDerivation = HDNodeWallet.fromPhrase(
        TEST_MNEMONIC,
        undefined,
        `m/44'/60'/0'/0/${expectedIndex}`,
      );
      const helperDerivation = deriveAddress(TEST_MNEMONIC, expectedIndex);
      expect(helperDerivation).toBe(directDerivation.address);
    }
  });

  it('is deterministic - same mnemonic gives same addresses', () => {
    const first = deriveAllAddresses(TEST_MNEMONIC);
    const second = deriveAllAddresses(TEST_MNEMONIC);
    expect(first).toEqual(second);
  });

  it('different mnemonic gives different addresses', () => {
    const original = deriveAllAddresses(TEST_MNEMONIC);
    const alternate = deriveAllAddresses(ALT_MNEMONIC);
    // At least admin should differ (in practice all will differ)
    expect(alternate.admin).not.toBe(original.admin);
  });
});

describe('FUND-02: Testnet Threshold', () => {
  it('minimum balance is 0.5 ETH (500000000000000000 wei)', () => {
    expect(getMinBalance('testnet')).toBe(500000000000000000n);
    expect(getMinBalance('testnet')).toBe(DEFAULT_THRESHOLDS.testnet);
  });

  it('passes when all roles have sufficient balance', () => {
    const balances = makeBalances(1000000000000000000n); // 1 ETH
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(true);
    expect(result.insufficient).toEqual([]);
  });

  it('fails when balance is below 0.5 ETH', () => {
    const balances = makeBalances(1000000000000000000n); // 1 ETH
    balances.batcher = 100000000000000000n; // 0.1 ETH
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(false);
    expect(result.insufficient).toContain('batcher');
  });
});

describe('FUND-03: Mainnet Threshold', () => {
  it('minimum balance is 2 ETH (2000000000000000000 wei)', () => {
    expect(getMinBalance('mainnet')).toBe(2000000000000000000n);
    expect(getMinBalance('mainnet')).toBe(DEFAULT_THRESHOLDS.mainnet);
  });

  it('passes when all roles have sufficient balance', () => {
    const balances = makeBalances(3000000000000000000n); // 3 ETH
    const result = validateFunding(balances, 'mainnet');
    expect(result.passed).toBe(true);
    expect(result.insufficient).toEqual([]);
  });

  it('fails when balance is below 2 ETH', () => {
    const balances = makeBalances(3000000000000000000n); // 3 ETH
    balances.proposer = 1000000000000000000n; // 1 ETH
    const result = validateFunding(balances, 'mainnet');
    expect(result.passed).toBe(false);
    expect(result.insufficient).toContain('proposer');
  });
});

describe('FUND-04: Deployment Blocking', () => {
  it('returns passed=true when all roles have sufficient balance', () => {
    const balances = makeBalances(1000000000000000000n); // 1 ETH > 0.5 ETH testnet
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(true);
    expect(result.insufficient).toHaveLength(0);
  });

  it('returns passed=false with insufficient roles when one role is underfunded', () => {
    const balances = makeBalances(1000000000000000000n); // 1 ETH
    balances.challenger = 100000000000000000n; // 0.1 ETH
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(false);
    expect(result.insufficient).toEqual(['challenger']);
  });

  it('returns all roles as insufficient when none meet threshold', () => {
    const balances = makeBalances(100000000000000000n); // 0.1 ETH
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(false);
    expect(result.insufficient).toHaveLength(5);
    for (const role of ROLES) {
      expect(result.insufficient).toContain(role);
    }
  });

  it('correctly identifies only the underfunded roles in mixed scenario', () => {
    const balances: Record<string, bigint> = {
      admin: 1000000000000000000n,      // 1 ETH - sufficient
      proposer: 100000000000000000n,     // 0.1 ETH - insufficient
      batcher: 600000000000000000n,      // 0.6 ETH - sufficient
      challenger: 50000000000000000n,    // 0.05 ETH - insufficient
      sequencer: 500000000000000000n,    // 0.5 ETH - exactly threshold - sufficient
    };
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(false);
    expect(result.insufficient).toHaveLength(2);
    expect(result.insufficient).toContain('proposer');
    expect(result.insufficient).toContain('challenger');
    expect(result.insufficient).not.toContain('admin');
    expect(result.insufficient).not.toContain('batcher');
    expect(result.insufficient).not.toContain('sequencer');
  });

  it('exact boundary: balance equal to threshold passes', () => {
    const threshold = getMinBalance('testnet'); // 0.5 ETH
    const balances = makeBalances(threshold);
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(true);
    expect(result.insufficient).toHaveLength(0);
  });

  it('just below boundary fails', () => {
    const threshold = getMinBalance('testnet'); // 0.5 ETH
    const balances = makeBalances(threshold - 1n);
    const result = validateFunding(balances, 'testnet');
    expect(result.passed).toBe(false);
    expect(result.insufficient).toHaveLength(5);
  });
});
