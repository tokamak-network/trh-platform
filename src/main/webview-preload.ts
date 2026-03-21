/**
 * Preload script for the platform WebContentsView.
 * Exposes a minimal IPC bridge so the web frontend (trh-platform-ui)
 * can trigger AWS SSO login and other desktop-only operations.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__TRH_DESKTOP__', {
  // AWS SSO flow
  awsSsoLoginDirect: (startUrl: string, region: string): Promise<void> =>
    ipcRenderer.invoke('aws-auth:sso-login-direct', startUrl, region),
  awsSsoListAccounts: (): Promise<any[]> =>
    ipcRenderer.invoke('aws-auth:sso-list-accounts'),
  awsSsoListRoles: (accountId: string): Promise<any[]> =>
    ipcRenderer.invoke('aws-auth:sso-list-roles', accountId),
  awsSsoAssumeRole: (accountId: string, roleName: string): Promise<any> =>
    ipcRenderer.invoke('aws-auth:sso-assume-role', accountId, roleName),
  awsGetCredentials: (): Promise<any> =>
    ipcRenderer.invoke('aws-auth:get-credentials'),
  awsClear: (): Promise<void> =>
    ipcRenderer.invoke('aws-auth:clear'),

  // Balance fetching via user-provided L1 RPC
  fetchBalances: (rpcUrl: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('desktop:fetch-balances', rpcUrl),

  // Seed phrase access (for preset deploy flow)
  getSeedWords: (): Promise<string[] | null> =>
    ipcRenderer.invoke('desktop:get-seed-words'),
});
