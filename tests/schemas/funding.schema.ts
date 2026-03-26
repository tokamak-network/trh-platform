import { z } from 'zod';

export const NetworkTypeSchema = z.enum(['testnet', 'mainnet']);
export type NetworkType = z.infer<typeof NetworkTypeSchema>;

export const FundingThresholdsSchema = z.object({
  testnet: z.bigint().positive(),
  mainnet: z.bigint().positive(),
});
export type FundingThresholds = z.infer<typeof FundingThresholdsSchema>;

export const FundingResultSchema = z.object({
  passed: z.boolean(),
  insufficient: z.array(z.string()),
});
export type FundingResult = z.infer<typeof FundingResultSchema>;
