/**
 * Mock ElectronAPI for browser-based development without Electron/Docker.
 *
 * Control behavior via URL query params:
 *   ?scenario=fresh       - First install, Docker not running
 *   ?scenario=healthy     - Docker running, containers healthy
 *   ?scenario=port-conflict - Port conflicts on startup
 *   ?scenario=dep-missing  - forge/aws not installed
 *   ?scenario=pull-fail    - Image pull failure
 *
 * Default: fresh install flow
 */

import type { ElectronAPI, DockerStatus, BackendDependencies, PortCheckResult, AppNotification } from '../types';

const params = new URLSearchParams(window.location.search);
const SCENARIO = params.get('scenario') ?? 'fresh';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Simulate pull progress
function simulatePull(callback: (p: { service: string; status: string; progress?: string }) => void): Promise<void> {
  return new Promise((resolve) => {
    const services = ['postgres', 'trh-backend', 'trh-platform-ui'];
    let i = 0;
    const tick = () => {
      if (i >= services.length) { resolve(); return; }
      callback({ service: services[i], status: 'Pulling', progress: '50%' });
      setTimeout(() => {
        callback({ service: services[i], status: 'Pull complete' });
        i++;
        setTimeout(tick, 400);
      }, 600);
    };
    tick();
  });
}

// Listeners registry
type Listener<T> = (value: T) => void;
const pullListeners: Listener<{ service: string; status: string; progress?: string }>[] = [];
const statusListeners: Listener<string>[] = [];
const logListeners: Listener<string>[] = [];
const updateListeners: Listener<boolean>[] = [];
const webviewNavigateListeners: Listener<{ url: string; canGoBack: boolean; canGoForward: boolean }>[] = [];
const notifChangedListeners: Listener<void>[] = [];

const emit = <T>(listeners: Listener<T>[], value: T) => listeners.forEach((l) => l(value));

const mockNotifications: AppNotification[] = [
  {
    id: '1',
    type: 'image-update',
    title: 'New Docker Images Available',
    message: 'trh-backend and trh-platform-ui have updates ready to install.',
    timestamp: Date.now() - 3600_000,
    read: false,
    actionLabel: 'Update Now',
    actionType: 'update-containers',
  },
  {
    id: '2',
    type: 'system',
    title: 'System Ready',
    message: 'All services are running and healthy.',
    timestamp: Date.now() - 7200_000,
    read: true,
  },
];

export const mockElectronAPI: ElectronAPI = {
  docker: {
    checkInstalled: async () => {
      await delay(300);
      return SCENARIO !== 'no-docker';
    },

    checkRunning: async () => {
      await delay(300);
      return SCENARIO === 'healthy';
    },

    getStatus: async (): Promise<DockerStatus> => {
      await delay(200);
      if (SCENARIO === 'healthy') {
        return { installed: true, running: true, containersUp: true, healthy: true };
      }
      return { installed: true, running: false, containersUp: false, healthy: false };
    },

    checkPorts: async (): Promise<PortCheckResult> => {
      await delay(200);
      if (SCENARIO === 'port-conflict') {
        return {
          available: false,
          conflicts: [
            { port: 3000, pid: 12345, processName: 'node' },
            { port: 8000, pid: 12346, processName: 'python' },
          ],
        };
      }
      return { available: true, conflicts: [] };
    },

    killPortProcesses: async (ports: number[]) => {
      emit(logListeners, `Killed processes on ports: ${ports.join(', ')}`);
      await delay(500);
    },

    cleanup: async () => { await delay(300); },
    startDaemon: async () => { await delay(1000); return true; },
    prune: async () => { await delay(800); },

    checkUpdates: async () => {
      await delay(500);
      return false;
    },

    restartWithUpdates: async () => {
      emit(logListeners, 'Pulling latest images...');
      await delay(1500);
      emit(logListeners, 'Restarting containers...');
      await delay(1000);
    },

    pullImages: async () => {
      if (SCENARIO === 'pull-fail') {
        await delay(1000);
        throw new Error('Network error: failed to pull image tokamaknetwork/trh-backend');
      }
      await simulatePull((p) => emit(pullListeners, p));
    },

    start: async (config) => {
      emit(logListeners, `Starting containers with admin: ${config?.adminEmail}`);
      await delay(1200);
      emit(logListeners, 'postgres ... done');
      await delay(400);
      emit(logListeners, 'trh-backend ... done');
      await delay(400);
      emit(logListeners, 'trh-platform-ui ... done');
    },

    stop: async () => { await delay(500); },

    waitHealthy: async () => {
      const steps = ['Waiting for postgres...', 'Waiting for backend...', 'Waiting for UI...', 'All services healthy!'];
      for (const msg of steps) {
        emit(logListeners, msg);
        await delay(600);
      }
      return SCENARIO !== 'health-fail';
    },

    getInstallUrl: async () => 'https://docs.docker.com/desktop/',
    installDocker: async () => { await delay(500); return { requiresRelogin: false }; },

    checkBackendDeps: async (): Promise<BackendDependencies> => {
      await delay(400);
      if (SCENARIO === 'dep-missing') {
        return { pnpm: true, node: true, forge: false, aws: false, allInstalled: false };
      }
      return { pnpm: true, node: true, forge: true, aws: true, allInstalled: true };
    },

    installBackendDeps: async () => {
      emit(logListeners, 'Installing forge...');
      await delay(1500);
      emit(logListeners, 'Installing aws-cli...');
      await delay(1500);
      emit(logListeners, 'All dependencies installed.');
    },

    onPullProgress: (cb) => { pullListeners.push(cb); return () => pullListeners.splice(pullListeners.indexOf(cb), 1); },
    onStatusUpdate: (cb) => { statusListeners.push(cb); return () => statusListeners.splice(statusListeners.indexOf(cb), 1); },
    onInstallProgress: (cb) => { statusListeners.push(cb); return () => statusListeners.splice(statusListeners.indexOf(cb), 1); },
    onLog: (cb) => { logListeners.push(cb); return () => logListeners.splice(logListeners.indexOf(cb), 1); },
    onUpdateAvailable: (cb) => { updateListeners.push(cb); return () => updateListeners.splice(updateListeners.indexOf(cb), 1); },
    removeAllListeners: () => { pullListeners.length = 0; statusListeners.length = 0; logListeners.length = 0; },
  },

  app: {
    loadPlatform: async () => {
      emit(logListeners, '[mock] Platform loaded (WebView not available in browser mode)');
      // Simulate webview navigation after load
      setTimeout(() => {
        emit(webviewNavigateListeners, { url: 'http://localhost:3000/', canGoBack: false, canGoForward: false });
      }, 300);
    },
    openExternal: async (url) => { window.open(url, '_blank'); },
    getVersion: async () => '1.1.4-mock',
  },

  webview: {
    goBack: () => {},
    goForward: () => {},
    reload: () => {},
    loadUrl: (url) => { emit(logListeners, `[mock] loadUrl: ${url}`); },
    show: () => {},
    hide: async () => {},
    onVisibilityChanged: () => () => {},
    onDidNavigate: (cb) => { webviewNavigateListeners.push(cb); return () => webviewNavigateListeners.splice(webviewNavigateListeners.indexOf(cb), 1); },
    onDidFinishLoad: () => () => {},
    onLoadFailed: () => () => {},
    removeAllListeners: () => {},
  },

  notifications: {
    getAll: async () => [...mockNotifications],
    markRead: async (id) => {
      const n = mockNotifications.find((n) => n.id === id);
      if (n) n.read = true;
      emit(notifChangedListeners, undefined as unknown as void);
    },
    markAllRead: async () => {
      mockNotifications.forEach((n) => (n.read = true));
      emit(notifChangedListeners, undefined as unknown as void);
    },
    dismiss: async (id) => {
      const idx = mockNotifications.findIndex((n) => n.id === id);
      if (idx >= 0) mockNotifications.splice(idx, 1);
      emit(notifChangedListeners, undefined as unknown as void);
    },
    executeAction: async (id) => { emit(logListeners, `[mock] executeAction: ${id}`); },
    getUnreadCount: async () => mockNotifications.filter((n) => !n.read).length,
    onChanged: (cb) => { notifChangedListeners.push(cb); return () => notifChangedListeners.splice(notifChangedListeners.indexOf(cb), 1); },
  },

  keystore: {
    store: async () => { await delay(500); },
    has: async () => false,
    isAvailable: async () => true,
    getAddresses: async () => ({ admin: '0x0000000000000000000000000000000000000001', proposer: '0x0000000000000000000000000000000000000002', batcher: '0x0000000000000000000000000000000000000003', challenger: '0x0000000000000000000000000000000000000004', sequencer: '0x0000000000000000000000000000000000000005' }),
    previewAddresses: async () => ({ admin: '0x0000000000000000000000000000000000000001', proposer: '0x0000000000000000000000000000000000000002', batcher: '0x0000000000000000000000000000000000000003', challenger: '0x0000000000000000000000000000000000000004', sequencer: '0x0000000000000000000000000000000000000005' }),
    delete: async () => {},
    validate: async () => true,
  },

  awsAuth: {
    listProfiles: async () => [
      { name: 'default', source: 'credentials' as const },
      { name: 'dev', source: 'credentials' as const },
    ],
    loadProfile: async () => ({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      source: 'profile:default',
    }),
    ssoLogin: async () => ({
      accessKeyId: 'ASIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'FwoGZXIvYXdzEBYaDH...',
      source: 'sso:dev',
      expiresAt: Date.now() + 3600000,
    }),
    getCredentials: async () => null,
    clear: async () => {},
  },

  networkGuard: {
    getBlockedRequests: async () => [],
  },
};
