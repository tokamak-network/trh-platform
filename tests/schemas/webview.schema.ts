// @vitest-environment node
import { z } from 'zod';

const AccountEntrySchema = z.object({
  address: z.string().startsWith('0x'),
  privateKey: z.string().startsWith('0x'),
});

export const DesktopAccountsSchema = z.object({
  admin: AccountEntrySchema,
  proposer: AccountEntrySchema,
  batcher: AccountEntrySchema,
  challenger: AccountEntrySchema,
  sequencer: AccountEntrySchema,
});

export const AwsCredentialsSchema = z.object({
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  sessionToken: z.string().optional(),
  source: z.string().min(1),
});

export type DesktopAccounts = z.infer<typeof DesktopAccountsSchema>;
export type AwsCredentials = z.infer<typeof AwsCredentialsSchema>;
