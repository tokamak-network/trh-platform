// @vitest-environment node
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Keystore IPC schemas (IPC-02)
// ---------------------------------------------------------------------------

export const KeyRoleEnum = z.enum(['admin', 'proposer', 'batcher', 'challenger', 'sequencer']);
export type KeyRole = z.infer<typeof KeyRoleEnum>;

// keystore:store input
export const KeystoreStoreInputSchema = z.object({
  seedPhrase: z.string(),
});
export type KeystoreStoreInput = z.infer<typeof KeystoreStoreInputSchema>;

// keystore:get-addresses response — Record<KeyRole, address>
export const KeystoreGetAddressesResponseSchema = z.record(KeyRoleEnum, z.string().startsWith('0x'));
export type KeystoreGetAddressesResponse = z.infer<typeof KeystoreGetAddressesResponseSchema>;

// keystore:preview-addresses input
export const KeystorePreviewAddressesInputSchema = z.object({
  seedPhrase: z.string(),
});
export type KeystorePreviewAddressesInput = z.infer<typeof KeystorePreviewAddressesInputSchema>;

// keystore:has response
export const KeystoreHasResponseSchema = z.boolean();
export type KeystoreHasResponse = z.infer<typeof KeystoreHasResponseSchema>;

// keystore:is-available response
export const KeystoreIsAvailableResponseSchema = z.boolean();
export type KeystoreIsAvailableResponse = z.infer<typeof KeystoreIsAvailableResponseSchema>;

// keystore:validate input
export const KeystoreValidateInputSchema = z.object({
  mnemonic: z.string(),
});
export type KeystoreValidateInput = z.infer<typeof KeystoreValidateInputSchema>;

// keystore:validate response
export const KeystoreValidateResponseSchema = z.boolean();
export type KeystoreValidateResponse = z.infer<typeof KeystoreValidateResponseSchema>;

// ---------------------------------------------------------------------------
// Docker IPC schemas (IPC-03)
// Matches the interfaces defined in src/main/preload.ts
// ---------------------------------------------------------------------------

// docker:get-status response — matches DockerStatus interface in preload.ts
export const DockerStatusSchema = z.object({
  installed: z.boolean(),
  running: z.boolean(),
  containersUp: z.boolean(),
  healthy: z.boolean(),
  error: z.string().optional(),
});
export type DockerStatus = z.infer<typeof DockerStatusSchema>;

// docker:pull-progress event — matches PullProgress interface in preload.ts
// Note: progress is optional string per preload.ts interface
export const PullProgressSchema = z.object({
  service: z.string(),
  status: z.string(),
  progress: z.string().optional(),
});
export type PullProgress = z.infer<typeof PullProgressSchema>;

// docker:check-ports response — matches PortConflict and PortCheckResult in preload.ts
export const PortConflictSchema = z.object({
  port: z.number(),
  pid: z.number(),
  processName: z.string(),
});
export type PortConflict = z.infer<typeof PortConflictSchema>;

export const PortCheckResultSchema = z.object({
  available: z.boolean(),
  conflicts: z.array(PortConflictSchema),
});
export type PortCheckResult = z.infer<typeof PortCheckResultSchema>;

// docker:check-backend-deps response — matches BackendDependencies in preload.ts
export const BackendDependenciesSchema = z.object({
  pnpm: z.boolean(),
  node: z.boolean(),
  forge: z.boolean(),
  allInstalled: z.boolean(),
});
export type BackendDependencies = z.infer<typeof BackendDependenciesSchema>;
