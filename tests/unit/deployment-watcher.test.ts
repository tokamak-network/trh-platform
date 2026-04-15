// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must be defined before importing the module under test)
// ---------------------------------------------------------------------------

vi.mock('electron', () => {
  const NotificationMock = vi.fn().mockImplementation(() => {
    return { show: vi.fn() };
  });
  NotificationMock.isSupported = vi.fn().mockReturnValue(true);
  return { Notification: NotificationMock };
});

vi.mock('../../src/main/notifications', () => ({
  add: vi.fn().mockReturnValue({ id: 'mock-id', type: 'deployment', title: '', message: '', timestamp: 0, read: false }),
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { DeploymentWatcher } from '../../src/main/deployment-watcher';
import { Notification } from 'electron';
import * as NotificationStore from '../../src/main/notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StackStatus = 'Deploying' | 'Updating' | 'Deployed' | 'FailedToDeploy' | 'FailedToUpdate' | 'Idle';
type IntegrationStatus = 'InProgress' | 'Completed' | 'Failed';

function makeStack(id: string, name: string, status: StackStatus) {
  return { id, name, status };
}

function makeIntegration(id: string, type: string, status: IntegrationStatus) {
  return { id, type, status };
}

function makeGetToken(token: string | null) {
  return () => token;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentWatcher', () => {
  let watcher: DeploymentWatcher;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    watcher = new DeploymentWatcher('http://localhost:8000');
  });

  afterEach(() => {
    watcher.stop();
  });

  // DW-01: No notification on initial load (no previous state)
  it('DW-01: does not fire notification on initial state snapshot', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deploying')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [] } }),
      });

    await watcher.poll(makeGetToken('test-token'));

    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).not.toHaveBeenCalled();
    expect(NotificationStore.add).not.toHaveBeenCalled();
  });

  // DW-02: Deploying → Deployed fires success notification
  it('DW-02: Deploying → Deployed fires L2 Deployment Complete notification', async () => {
    // First poll: snapshot Deploying
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deploying')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [] } }),
      });
    await watcher.poll(makeGetToken('test-token'));

    vi.clearAllMocks();

    // Second poll: transition to Deployed
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [] } }),
      });
    await watcher.poll(makeGetToken('test-token'));

    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'L2 Deployment Complete' }),
    );
    expect(NotificationStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment', title: 'L2 Deployment Complete' }),
    );
    const addArgs = (NotificationStore.add as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { message: string };
    expect(addArgs.message).toContain('my-chain');
    expect(addArgs.message).toContain('is now deployed and running');
  });

  // DW-03: Deploying → FailedToDeploy fires failure notification
  it('DW-03: Deploying → FailedToDeploy fires L2 Deployment Failed notification', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deploying')] } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { integrations: [] } }) });
    await watcher.poll(makeGetToken('token'));

    vi.clearAllMocks();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'FailedToDeploy')] } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { integrations: [] } }) });
    await watcher.poll(makeGetToken('token'));

    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'L2 Deployment Failed' }),
    );
  });

  // DW-04: Same status → no notification
  it('DW-04: same status on consecutive polls does not fire notification', async () => {
    for (let i = 0; i < 2; i++) {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { integrations: [] } }) });
      await watcher.poll(makeGetToken('token'));
    }

    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).not.toHaveBeenCalled();
  });

  // DW-05: InProgress → Completed fires service notification
  it('DW-05: InProgress → Completed fires Service Deployment Complete notification', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [makeIntegration('i1', 'bridge', 'InProgress')] } }),
      });
    await watcher.poll(makeGetToken('token'));

    vi.clearAllMocks();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [makeIntegration('i1', 'bridge', 'Completed')] } }),
      });
    await watcher.poll(makeGetToken('token'));

    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Service Deployment Complete' }),
    );
  });

  // DW-06: No token → poll is skipped
  it('DW-06: skips poll when token is null', async () => {
    await watcher.poll(makeGetToken(null));

    expect(fetchMock).not.toHaveBeenCalled();
    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).not.toHaveBeenCalled();
  });

  // DW-07: API error → no crash, no notification
  it('DW-07: API fetch error does not crash and fires no notification', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));

    await expect(watcher.poll(makeGetToken('token'))).resolves.not.toThrow();
    const notificationMock = Notification as unknown as ReturnType<typeof vi.fn>;
    expect(notificationMock).not.toHaveBeenCalled();
  });
});
