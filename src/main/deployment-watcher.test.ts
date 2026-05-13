// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  Notification: class {
    static isSupported() { return false; }
    show() {}
  },
}));

const mockAdd = vi.fn();
vi.mock('./notifications', () => ({
  add: (...args: unknown[]) => mockAdd(...args),
}));

import { DeploymentWatcher } from './deployment-watcher';

// Array-based matcher: entries are checked in order (most specific first)
function makeFetch(matchers: Array<[pattern: string, response: unknown]>): typeof fetch {
  return vi.fn((url: string | URL | Request) => {
    const urlStr = url.toString();
    const match = matchers.find(([pattern]) => urlStr.includes(pattern));
    const body = match ? match[1] : { data: {} };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }) as unknown as typeof fetch;
}

describe('DeploymentWatcher — notification type', () => {
  let watcher: DeploymentWatcher;

  beforeEach(() => {
    mockAdd.mockClear();
    watcher = new DeploymentWatcher('http://localhost:8000');
  });

  it('fires deployment-success type when stack transitions Deploying → Deployed', async () => {
    const getToken = () => 'token';

    global.fetch = makeFetch([
      ['/s1/integrations', { data: { integrations: [] } }],
      ['/stacks/thanos', { data: { stacks: [{ id: 's1', name: 'MyChain', status: 'Deploying' }] } }],
    ]);
    await watcher.poll(getToken);

    global.fetch = makeFetch([
      ['/s1/integrations', { data: { integrations: [] } }],
      ['/stacks/thanos', { data: { stacks: [{ id: 's1', name: 'MyChain', status: 'Deployed' }] } }],
    ]);
    await watcher.poll(getToken);

    expect(mockAdd).toHaveBeenCalledOnce();
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment-success' }),
    );
  });

  it('fires deployment type (failure) when stack transitions Deploying → FailedToDeploy', async () => {
    const getToken = () => 'token';

    global.fetch = makeFetch([
      ['/s1/integrations', { data: { integrations: [] } }],
      ['/stacks/thanos', { data: { stacks: [{ id: 's1', name: 'MyChain', status: 'Deploying' }] } }],
    ]);
    await watcher.poll(getToken);

    global.fetch = makeFetch([
      ['/s1/deployments', { data: { deployments: [] } }],
      ['/s1/integrations', { data: { integrations: [] } }],
      ['/stacks/thanos', { data: { stacks: [{ id: 's1', name: 'MyChain', status: 'FailedToDeploy' }] } }],
    ]);
    await watcher.poll(getToken);

    expect(mockAdd).toHaveBeenCalledOnce();
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment' }),
    );
  });

  it('fires deployment-success type when integration transitions InProgress → Completed', async () => {
    const getToken = () => 'token';

    global.fetch = makeFetch([
      ['/s1/integrations', { data: { integrations: [{ id: 'i1', type: 'cross-trade', status: 'InProgress' }] } }],
      ['/stacks/thanos', { data: { stacks: [{ id: 's1', name: 'MyChain', status: 'Deployed' }] } }],
    ]);
    await watcher.poll(getToken);

    global.fetch = makeFetch([
      ['/s1/integrations', { data: { integrations: [{ id: 'i1', type: 'cross-trade', status: 'Completed' }] } }],
      ['/stacks/thanos', { data: { stacks: [{ id: 's1', name: 'MyChain', status: 'Deployed' }] } }],
    ]);
    await watcher.poll(getToken);

    expect(mockAdd).toHaveBeenCalledOnce();
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment-success' }),
    );
  });
});
