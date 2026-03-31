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

export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  allInstalled: boolean;
}

export interface PortConflict {
  port: number;
  pid: number;
  processName: string;
}

export interface PortCheckResult {
  available: boolean;
  conflicts: PortConflict[];
}

export interface AppNotification {
  id: string;
  type: 'image-update' | 'release-update' | 'system';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  actionType?: 'update-containers';
}

export type KeyRole = 'admin' | 'proposer' | 'batcher' | 'challenger' | 'sequencer';

export interface KeystoreAPI {
  store: (mnemonic: string) => Promise<void>;
  has: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
  getAddresses: () => Promise<Record<KeyRole, string>>;
  previewAddresses: (mnemonic: string) => Promise<Record<KeyRole, string>>;
  delete: () => Promise<void>;
  validate: (mnemonic: string) => Promise<boolean>;
}

export interface BlockedRequest {
  url: string;
  timestamp: number;
  method: string;
  source: 'renderer' | 'webview';
}

export interface NetworkGuardAPI {
  getBlockedRequests: () => Promise<BlockedRequest[]>;
}

export interface AwsProfile {
  name: string;
  source: 'credentials' | 'sso';
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  source: string;
  expiresAt?: number;
}

export interface SsoAccount {
  accountId: string;
  accountName: string;
  emailAddress: string;
}

export interface SsoRole {
  roleName: string;
  accountId: string;
}

export interface AwsAuthAPI {
  listProfiles: () => Promise<AwsProfile[]>;
  loadProfile: (name: string) => Promise<AwsCredentials>;
  ssoLogin: (profileName: string) => Promise<AwsCredentials>;
  ssoLoginDirect: (startUrl: string, region: string) => Promise<void>;
  ssoListAccounts: () => Promise<SsoAccount[]>;
  ssoListRoles: (accountId: string) => Promise<SsoRole[]>;
  ssoAssumeRole: (accountId: string, roleName: string) => Promise<AwsCredentials>;
  getCredentials: () => Promise<AwsCredentials | null>;
  clear: () => Promise<void>;
}

export interface ElectronAPI {
  docker: {
    checkInstalled: () => Promise<boolean>;
    checkRunning: () => Promise<boolean>;
    getStatus: () => Promise<DockerStatus>;
    checkPorts: () => Promise<PortCheckResult>;
    killPortProcesses: (ports: number[]) => Promise<void>;
    cleanup: () => Promise<void>;
    startDaemon: () => Promise<boolean>;
    prune: () => Promise<void>;
    checkUpdates: () => Promise<boolean>;
    restartWithUpdates: (config?: { adminEmail?: string; adminPassword?: string }) => Promise<void>;
    pullImages: () => Promise<void>;
    start: (config?: { adminEmail?: string; adminPassword?: string }) => Promise<void>;
    stop: () => Promise<void>;
    waitHealthy: (timeoutMs?: number) => Promise<boolean>;
    getInstallUrl: () => Promise<string>;
    installDocker: () => Promise<{ requiresRelogin: boolean }>;
    checkBackendDeps: () => Promise<BackendDependencies>;
    installBackendDeps: () => Promise<void>;
    onPullProgress: (callback: (progress: PullProgress) => void) => () => void;
    onStatusUpdate: (callback: (status: string) => void) => () => void;
    onInstallProgress: (callback: (status: string) => void) => () => void;
    onLog: (callback: (line: string) => void) => () => void;
    onUpdateAvailable: (callback: (available: boolean) => void) => () => void;
    cleanPlatform: () => Promise<void>;
    removeAllListeners: () => void;
  };
  app: {
    loadPlatform: (config?: { adminEmail?: string; adminPassword?: string }) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    getVersion: () => Promise<string>;
  };
  webview: {
    goBack: () => void;
    goForward: () => void;
    reload: () => void;
    loadUrl: (url: string) => void;
    show: () => void;
    hide: () => Promise<void>;
    onVisibilityChanged: (callback: (visible: boolean) => void) => () => void;
    onDidNavigate: (callback: (info: { url: string; canGoBack: boolean; canGoForward: boolean }) => void) => () => void;
    onDidFinishLoad: (callback: (info: { url: string; canGoBack: boolean; canGoForward: boolean }) => void) => () => void;
    onLoadFailed: (callback: (info: { errorCode: number; errorDescription: string }) => void) => () => void;
    removeAllListeners: () => void;
  };
  notifications: {
    getAll: () => Promise<AppNotification[]>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    dismiss: (id: string) => Promise<void>;
    executeAction: (id: string) => Promise<void>;
    getUnreadCount: () => Promise<number>;
    onChanged: (callback: () => void) => () => void;
  };
  keystore: KeystoreAPI;
  awsAuth: AwsAuthAPI;
  networkGuard: NetworkGuardAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
