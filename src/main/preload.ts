import { contextBridge, ipcRenderer } from 'electron';

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  containersUp: boolean;
  healthy: boolean;
  error?: string;
}

export interface PullProgress {
  service: string;
  status: string;
  progress?: string;
}

export interface PortConflict {
  port: number;
  pid: number;
  processName: string;
  ownedByTrh: boolean;
}

export interface PortCheckResult {
  available: boolean;
  conflicts: PortConflict[];
}

export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  allInstalled: boolean;
}

const electronAPI = {
  docker: {
    checkInstalled: (): Promise<boolean> => ipcRenderer.invoke('docker:check-installed'),
    checkRunning: (): Promise<boolean> => ipcRenderer.invoke('docker:check-running'),
    getStatus: (): Promise<DockerStatus> => ipcRenderer.invoke('docker:get-status'),
    checkPorts: (): Promise<PortCheckResult> => ipcRenderer.invoke('docker:check-ports'),
    killPortProcesses: (ports: number[]): Promise<void> => ipcRenderer.invoke('docker:kill-port-processes', ports),
    cleanup: (): Promise<void> => ipcRenderer.invoke('docker:cleanup'),
    startDaemon: (): Promise<boolean> => ipcRenderer.invoke('docker:start-daemon'),
    prune: (): Promise<void> => ipcRenderer.invoke('docker:prune'),
    isTrhStackRunning: (): Promise<boolean> => ipcRenderer.invoke('docker:is-trh-stack-running'),
    checkUpdates: (): Promise<boolean> => ipcRenderer.invoke('docker:check-updates'),
    restartWithUpdates: (config?: { adminEmail?: string; adminPassword?: string }): Promise<void> => ipcRenderer.invoke('docker:restart-with-updates', config),
    pullImages: (): Promise<void> => ipcRenderer.invoke('docker:pull-images'),
    start: (config?: { adminEmail?: string; adminPassword?: string }): Promise<void> => ipcRenderer.invoke('docker:start', config),
    stop: (): Promise<void> => ipcRenderer.invoke('docker:stop'),
    waitHealthy: (timeoutMs?: number): Promise<boolean> => ipcRenderer.invoke('docker:wait-healthy', timeoutMs),
    getInstallUrl: (): Promise<string> => ipcRenderer.invoke('docker:get-install-url'),
    installDocker: (): Promise<{ requiresRelogin: boolean }> => ipcRenderer.invoke('docker:install-docker'),
    checkBackendDeps: (): Promise<BackendDependencies> => ipcRenderer.invoke('docker:check-backend-deps'),
    installBackendDeps: (): Promise<void> => ipcRenderer.invoke('docker:install-backend-deps'),
    cleanPlatform: (): Promise<void> => ipcRenderer.invoke('docker:clean-platform'),

    onPullProgress: (callback: (progress: PullProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: PullProgress) => callback(progress);
      ipcRenderer.on('docker:pull-progress', handler);
      return () => ipcRenderer.removeListener('docker:pull-progress', handler);
    },
    onStatusUpdate: (callback: (status: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
      ipcRenderer.on('docker:status-update', handler);
      return () => ipcRenderer.removeListener('docker:status-update', handler);
    },
    onInstallProgress: (callback: (status: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
      ipcRenderer.on('docker:install-progress', handler);
      return () => ipcRenderer.removeListener('docker:install-progress', handler);
    },
    onLog: (callback: (line: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
      ipcRenderer.on('docker:log', handler);
      return () => ipcRenderer.removeListener('docker:log', handler);
    },
    onUpdateAvailable: (callback: (available: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, available: boolean) => callback(available);
      ipcRenderer.on('docker:update-available', handler);
      return () => ipcRenderer.removeListener('docker:update-available', handler);
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('docker:pull-progress');
      ipcRenderer.removeAllListeners('docker:status-update');
      ipcRenderer.removeAllListeners('docker:install-progress');
      ipcRenderer.removeAllListeners('docker:log');
      ipcRenderer.removeAllListeners('docker:update-available');
    }
  },

  app: {
    loadPlatform: (config?: { adminEmail?: string; adminPassword?: string }): Promise<void> => ipcRenderer.invoke('app:load-platform', config),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
    relaunch: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),
    onMenuUninstall: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('menu:uninstall', handler);
      return () => ipcRenderer.removeListener('menu:uninstall', handler);
    }
  },

  notifications: {
    getAll: (): Promise<import('./notifications').AppNotification[]> => ipcRenderer.invoke('notifications:get-all'),
    markRead: (id: string): Promise<void> => ipcRenderer.invoke('notifications:mark-read', id),
    markAllRead: (): Promise<void> => ipcRenderer.invoke('notifications:mark-all-read'),
    dismiss: (id: string): Promise<void> => ipcRenderer.invoke('notifications:dismiss', id),
    executeAction: (id: string): Promise<void> => ipcRenderer.invoke('notifications:execute-action', id),
    getUnreadCount: (): Promise<number> => ipcRenderer.invoke('notifications:get-unread-count'),
    onChanged: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('notifications:changed', handler);
      return () => ipcRenderer.removeListener('notifications:changed', handler);
    },
  },

  webview: {
    goBack: (): Promise<void> => ipcRenderer.invoke('webview:go-back'),
    goForward: (): Promise<void> => ipcRenderer.invoke('webview:go-forward'),
    reload: (): Promise<void> => ipcRenderer.invoke('webview:reload'),
    loadUrl: (url: string): Promise<void> => ipcRenderer.invoke('webview:load-url', url),
    show: (): Promise<void> => ipcRenderer.invoke('webview:show'),
    hide: (): Promise<void> => ipcRenderer.invoke('webview:hide'),

    onVisibilityChanged: (callback: (visible: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
      ipcRenderer.on('webview:visibility-changed', handler);
      return () => ipcRenderer.removeListener('webview:visibility-changed', handler);
    },
    onDidNavigate: (callback: (info: { url: string; canGoBack: boolean; canGoForward: boolean }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { url: string; canGoBack: boolean; canGoForward: boolean }) => callback(info);
      ipcRenderer.on('webview:did-navigate', handler);
      return () => ipcRenderer.removeListener('webview:did-navigate', handler);
    },
    onDidFinishLoad: (callback: (info: { url: string; canGoBack: boolean; canGoForward: boolean }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { url: string; canGoBack: boolean; canGoForward: boolean }) => callback(info);
      ipcRenderer.on('webview:did-finish-load', handler);
      return () => ipcRenderer.removeListener('webview:did-finish-load', handler);
    },
    onLoadFailed: (callback: (info: { errorCode: number; errorDescription: string; url: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { errorCode: number; errorDescription: string; url: string }) => callback(info);
      ipcRenderer.on('webview:load-failed', handler);
      return () => ipcRenderer.removeListener('webview:load-failed', handler);
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('webview:visibility-changed');
      ipcRenderer.removeAllListeners('webview:did-navigate');
      ipcRenderer.removeAllListeners('webview:did-finish-load');
      ipcRenderer.removeAllListeners('webview:load-failed');
    }
  },

  keystore: {
    store: (mnemonic: string): Promise<void> => ipcRenderer.invoke('keystore:store', mnemonic),
    has: (): Promise<boolean> => ipcRenderer.invoke('keystore:has'),
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke('keystore:is-available'),
    getAddresses: (): Promise<Record<string, string>> => ipcRenderer.invoke('keystore:get-addresses'),
    previewAddresses: (mnemonic: string): Promise<Record<string, string>> => ipcRenderer.invoke('keystore:preview-addresses', mnemonic),
    delete: (): Promise<void> => ipcRenderer.invoke('keystore:delete'),
    validate: (mnemonic: string): Promise<boolean> => ipcRenderer.invoke('keystore:validate', mnemonic),
  },

  awsAuth: {
    listProfiles: (): Promise<any[]> => ipcRenderer.invoke('aws-auth:list-profiles'),
    loadProfile: (name: string): Promise<any> => ipcRenderer.invoke('aws-auth:load-profile', name),
    ssoLogin: (profileName: string): Promise<any> => ipcRenderer.invoke('aws-auth:sso-login', profileName),
    ssoLoginDirect: (startUrl: string, region: string): Promise<void> => ipcRenderer.invoke('aws-auth:sso-login-direct', startUrl, region),
    ssoListAccounts: (): Promise<any[]> => ipcRenderer.invoke('aws-auth:sso-list-accounts'),
    ssoListRoles: (accountId: string): Promise<any[]> => ipcRenderer.invoke('aws-auth:sso-list-roles', accountId),
    ssoAssumeRole: (accountId: string, roleName: string): Promise<any> => ipcRenderer.invoke('aws-auth:sso-assume-role', accountId, roleName),
    getCredentials: (): Promise<any> => ipcRenderer.invoke('aws-auth:get-credentials'),
    clear: (): Promise<void> => ipcRenderer.invoke('aws-auth:clear'),
  },

  networkGuard: {
    getBlockedRequests: (): Promise<Array<{ url: string; timestamp: number; method: string; source: string }>> =>
      ipcRenderer.invoke('network-guard:get-blocked'),
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
