// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => [
      'services:',
      '  backend:',
      '    image: tokamaknetwork/trh-backend:latest',
      '  platform-ui:',
      '    image: tokamaknetwork/trh-platform-ui:latest',
      '  postgres:',
      '    image: postgres:15',
    ].join('\n')),
  };
});

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}));

// ─── helpers ───────────────────────────────────────────────────────────────

/**
 * Build a minimal `https.get` mock that delivers a token JSON body
 * and returns a ClientRequest stub (for the .on('error') chain).
 */
function mockTokenFetch(token: string) {
  return vi.fn((_url: string, callback: (res: any) => void) => {
    const res = {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (event === 'data') handler(JSON.stringify({ token }));
        if (event === 'end') handler();
        return res;
      }),
    };
    callback(res);
    return { on: vi.fn() }; // ClientRequest stub
  });
}

/**
 * Build a minimal `https.request` mock that returns a HEAD response
 * with the given Docker-Content-Digest header.
 */
function mockManifestHead(digest: string) {
  return vi.fn((_opts: any, callback: (res: any) => void) => {
    callback({ headers: { 'docker-content-digest': digest } });
    return { on: vi.fn(), end: vi.fn() };
  });
}

/**
 * Build an `exec` mock that resolves RepoDigests queries with the given
 * local digest string.
 */
function mockLocalDigest(repoDigest: string) {
  // docker.ts calls exec(cmd, opts, callback)
  return vi.fn((_cmd: string, _opts: any, callback: (err: null, stdout: string, stderr: string) => void) => {
    callback(null, repoDigest, '');
  });
}

function mockExecError() {
  return vi.fn((_cmd: string, _opts: any, callback: (err: Error, stdout: string, stderr: string) => void) => {
    callback(new Error('not found'), '', 'Error: no such image');
  });
}

// ─── tests ─────────────────────────────────────────────────────────────────

describe('checkForUpdates', () => {
  let docker: typeof import('./docker');
  let httpsModule: typeof import('https');
  let cpModule: typeof import('child_process');

  beforeEach(async () => {
    vi.resetModules();
    docker = await import('./docker');
    httpsModule = await import('https');
    cpModule = await import('child_process');
  });

  it('returns true when remote digest differs from local', async () => {
    vi.mocked(httpsModule.get).mockImplementation(mockTokenFetch('token-abc') as any);
    vi.mocked(httpsModule.request).mockImplementation(mockManifestHead('sha256:ff00112233445566778899aa') as any);
    vi.mocked(cpModule.exec).mockImplementation(
      mockLocalDigest('tokamaknetwork/trh-backend@sha256:aabbcc001122334455667788') as any
    );

    const result = await docker.checkForUpdates();
    expect(result).toBe(true);
  });

  it('returns false when remote digest matches local', async () => {
    const SAME = 'sha256:1234567890abcdef1234567890abcdef';
    vi.mocked(httpsModule.get).mockImplementation(mockTokenFetch('token-abc') as any);
    vi.mocked(httpsModule.request).mockImplementation(mockManifestHead(SAME) as any);
    vi.mocked(cpModule.exec).mockImplementation(
      mockLocalDigest(`tokamaknetwork/trh-backend@${SAME}`) as any
    );

    const result = await docker.checkForUpdates();
    expect(result).toBe(false);
  });

  it('returns false when auth token fetch fails (network error)', async () => {
    const networkErrorGet = (_url: string, _cb: any) => {
      const stub = { on: vi.fn((event: string, handler: () => void) => { if (event === 'error') handler(); return stub; }) };
      return stub;
    };
    vi.mocked(httpsModule.get).mockImplementation(networkErrorGet as any);

    const result = await docker.checkForUpdates();
    expect(result).toBe(false);
  });

  it('returns false when manifest HEAD returns empty digest', async () => {
    vi.mocked(httpsModule.get).mockImplementation(mockTokenFetch('token-abc') as any);
    vi.mocked(httpsModule.request).mockImplementation(mockManifestHead('') as any);
    vi.mocked(cpModule.exec).mockImplementation(
      mockLocalDigest('tokamaknetwork/trh-backend@sha256:aabbcc001122334455667788') as any
    );

    const result = await docker.checkForUpdates();
    expect(result).toBe(false);
  });

  it('returns false when local image is not present (no RepoDigests)', async () => {
    vi.mocked(httpsModule.get).mockImplementation(mockTokenFetch('token-abc') as any);
    vi.mocked(httpsModule.request).mockImplementation(mockManifestHead('sha256:ff00112233445566778899aa') as any);
    // exec fails → image not present locally
    vi.mocked(cpModule.exec).mockImplementation(mockExecError() as any);

    const result = await docker.checkForUpdates();
    expect(result).toBe(false);
  });

  it('returns false when exec throws unexpectedly', async () => {
    vi.mocked(httpsModule.get).mockImplementation(mockTokenFetch('token-abc') as any);
    vi.mocked(httpsModule.request).mockImplementation(mockManifestHead('sha256:ff00112233445566778899aa') as any);
    vi.mocked(cpModule.exec).mockImplementation(() => { throw new Error('unexpected'); });

    const result = await docker.checkForUpdates();
    expect(result).toBe(false);
  });
});
