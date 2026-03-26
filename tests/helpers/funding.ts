export interface FundingThresholds {
  testnet: bigint;
  mainnet: bigint;
}

export const DEFAULT_THRESHOLDS: FundingThresholds = {
  testnet: 500000000000000000n,  // 0.5 ETH in wei
  mainnet: 2000000000000000000n, // 2.0 ETH in wei
};

export type NetworkType = 'testnet' | 'mainnet';

export function getMinBalance(network: NetworkType): bigint {
  return network === 'mainnet'
    ? DEFAULT_THRESHOLDS.mainnet
    : DEFAULT_THRESHOLDS.testnet;
}

export function validateFunding(
  balances: Record<string, bigint>,
  network: NetworkType,
): { passed: boolean; insufficient: string[] } {
  const minBalance = getMinBalance(network);
  const insufficient: string[] = [];

  for (const [role, balance] of Object.entries(balances)) {
    if (balance < minBalance) {
      insufficient.push(role);
    }
  }

  return { passed: insufficient.length === 0, insufficient };
}
