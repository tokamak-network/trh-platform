// @vitest-environment node
import { z } from 'zod';

export const DeploymentNetworkEnum = z.enum(['Mainnet', 'Testnet', 'LocalDevnet']);

export const OverrideSchema = z.object({
  field: z.string(),
  value: z.any(),
});

export const PresetDeployRequestSchema = z.object({
  presetId: z.string(),
  chainName: z.string(),
  network: DeploymentNetworkEnum,
  seedPhrase: z.string(),
  infraProvider: z.enum(['aws', 'local']),
  awsAccessKey: z.string().optional(),
  awsSecretKey: z.string().optional(),
  awsRegion: z.string().optional(),
  l1RpcUrl: z.string(),
  l1BeaconUrl: z.string(),
  feeToken: z.string().optional(),
  reuseDeployment: z.boolean().optional(),
  overrides: z.array(OverrideSchema).optional(),
});

export type PresetDeployRequest = z.infer<typeof PresetDeployRequestSchema>;
export type DeploymentNetwork = z.infer<typeof DeploymentNetworkEnum>;
