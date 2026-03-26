// @vitest-environment node
import { z } from 'zod';

export const ChainDefaultsSchema = z.object({
  l2BlockTime: z.number().int().positive(),
  batchSubmissionFrequency: z.number().int().positive(),
  outputRootFrequency: z.number().int().positive(),
  challengePeriod: z.number().int().positive(),
  registerCandidate: z.boolean(),
  backupEnabled: z.boolean(),
});

export const ModulesSchema = z.object({
  bridge: z.boolean(),
  blockExplorer: z.boolean(),
  monitoring: z.boolean(),
  crossTrade: z.boolean(),
  uptimeService: z.boolean(),
});

export const PresetDefinitionSchema = z.object({
  id: z.enum(['general', 'defi', 'gaming', 'full']),
  name: z.string().min(1),
  description: z.string().min(1),
  chainDefaults: ChainDefaultsSchema,
  modules: ModulesSchema,
  genesisPredeploys: z.array(z.string()).min(1),
  availableFeeTokens: z.array(z.string()).min(1),
  estimatedTime: z.record(z.string(), z.string()),
  overridableFields: z.array(z.string()).min(1),
});

export type PresetDefinition = z.infer<typeof PresetDefinitionSchema>;
export type ChainDefaults = z.infer<typeof ChainDefaultsSchema>;
export type Modules = z.infer<typeof ModulesSchema>;

export const PresetsFixtureSchema = z.record(
  z.enum(['general', 'defi', 'gaming', 'full']),
  PresetDefinitionSchema,
);
export type PresetsFixture = z.infer<typeof PresetsFixtureSchema>;
