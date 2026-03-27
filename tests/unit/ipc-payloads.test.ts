// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  KeystoreGetAddressesResponseSchema,
  KeystoreHasResponseSchema,
  KeystoreValidateResponseSchema,
  DockerStatusSchema,
  PullProgressSchema,
  PortCheckResultSchema,
  BackendDependenciesSchema,
} from '../schemas/ipc.schema';

// ---------------------------------------------------------------------------
// Keystore IPC Payload Tests (IPC-02)
// ---------------------------------------------------------------------------

describe('Keystore IPC Payloads (IPC-02)', () => {
  it('IPC-02: keystore:get-addresses response matches schema', () => {
    const response = {
      admin: '0xabc0000000000000000000000000000000000000',
      proposer: '0xdef0000000000000000000000000000000000000',
      batcher: '0x1230000000000000000000000000000000000000',
      challenger: '0x4560000000000000000000000000000000000000',
      sequencer: '0x7890000000000000000000000000000000000000',
    };
    const result = KeystoreGetAddressesResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('IPC-02: keystore:get-addresses rejects invalid role names', () => {
    // z.record(KeyRoleEnum, ...) rejects keys not in the enum
    const response = {
      admin: '0xabc0000000000000000000000000000000000000',
      invalidRole: '0xdef0000000000000000000000000000000000000',
    };
    const result = KeystoreGetAddressesResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('IPC-02: keystore:has response matches schema', () => {
    const result = KeystoreHasResponseSchema.safeParse(true);
    expect(result.success).toBe(true);
    expect(result.data).toBe(true);
  });

  it('IPC-02: keystore:validate response matches schema', () => {
    const result = KeystoreValidateResponseSchema.safeParse(false);
    expect(result.success).toBe(true);
    expect(result.data).toBe(false);
  });

  it('IPC-02: preload.ts DockerStatus interface fields align with DockerStatusSchema', () => {
    const preloadPath = join(__dirname, '..', '..', 'src', 'main', 'preload.ts');
    const preloadContent = readFileSync(preloadPath, 'utf-8');

    // Extract fields from the DockerStatus interface block
    const interfaceMatch = preloadContent.match(/export interface DockerStatus\s*\{([^}]+)\}/);
    expect(interfaceMatch, 'DockerStatus interface not found in preload.ts').toBeTruthy();

    const interfaceBody = interfaceMatch![1];

    // Extract field names (strip optional marker and type annotation)
    const fieldPattern = /^\s*(\w+)\??:/gm;
    const extractedFields = new Set<string>();
    for (const match of interfaceBody.matchAll(fieldPattern)) {
      extractedFields.add(match[1]);
    }

    // Compare with Zod schema shape keys
    const schemaKeys = new Set(Object.keys(DockerStatusSchema.shape));

    // Every field in the TypeScript interface must appear in the Zod schema
    for (const field of extractedFields) {
      expect(
        schemaKeys.has(field),
        `Field '${field}' exists in DockerStatus interface but not in DockerStatusSchema`
      ).toBe(true);
    }

    // Every key in the Zod schema must appear in the TypeScript interface
    for (const key of schemaKeys) {
      expect(
        extractedFields.has(key),
        `Key '${key}' exists in DockerStatusSchema but not in DockerStatus interface`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Docker IPC Payload Tests (IPC-03)
// ---------------------------------------------------------------------------

describe('Docker IPC Payloads (IPC-03)', () => {
  it('IPC-03: docker:get-status response matches schema', () => {
    const status = { installed: true, running: true, containersUp: true, healthy: true };
    const result = DockerStatusSchema.safeParse(status);
    expect(result.success).toBe(true);
  });

  it('IPC-03: docker:get-status with error matches schema', () => {
    const status = {
      installed: true,
      running: false,
      containersUp: false,
      healthy: false,
      error: 'Docker daemon not running',
    };
    const result = DockerStatusSchema.safeParse(status);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe('Docker daemon not running');
    }
  });

  it('IPC-03: pull-progress event matches schema', () => {
    // PullProgress.progress is optional string per preload.ts interface
    const progress = { service: 'trh-backend', status: 'downloading', progress: '45%' };
    const result = PullProgressSchema.safeParse(progress);
    expect(result.success).toBe(true);
  });

  it('IPC-03: pull-progress event without progress field matches schema', () => {
    // progress field is optional
    const progress = { service: 'trh-backend', status: 'pulling' };
    const result = PullProgressSchema.safeParse(progress);
    expect(result.success).toBe(true);
  });

  it('IPC-03: port check result matches schema', () => {
    // PortCheckResult has available: boolean and conflicts: PortConflict[]
    const checkResult = {
      available: true,
      conflicts: [],
    };
    const result = PortCheckResultSchema.safeParse(checkResult);
    expect(result.success).toBe(true);
  });

  it('IPC-03: port check result with conflicts matches schema', () => {
    const checkResult = {
      available: false,
      conflicts: [
        { port: 3000, pid: 12345, processName: 'node' },
      ],
    };
    const result = PortCheckResultSchema.safeParse(checkResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conflicts).toHaveLength(1);
      expect(result.data.conflicts[0].port).toBe(3000);
    }
  });

  it('IPC-03: backend dependencies result matches schema', () => {
    // BackendDependencies has pnpm/node/forge/allInstalled booleans
    const deps = { pnpm: true, node: true, forge: false, allInstalled: false };
    const result = BackendDependenciesSchema.safeParse(deps);
    expect(result.success).toBe(true);
  });

  it('IPC-03: backend dependencies all installed matches schema', () => {
    const deps = { pnpm: true, node: true, forge: true, allInstalled: true };
    const result = BackendDependenciesSchema.safeParse(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allInstalled).toBe(true);
    }
  });
});
