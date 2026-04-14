import { shell } from 'electron';
import {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} from '@aws-sdk/client-sso-oidc';
import {
  SSOClient,
  GetRoleCredentialsCommand,
  ListAccountsCommand,
  ListAccountRolesCommand,
} from '@aws-sdk/client-sso';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Module-level credential store
// ---------------------------------------------------------------------------

let currentCredentials: AwsCredentials | null = null;

// SSO session state — kept in memory for account/role selection flow
let ssoAccessToken: string | null = null;
let ssoRegion: string | null = null;

// Active region selected by user for AWS deployment
let activeRegion: string | null = null;

// Last assumed SSO role — used for automatic credential refresh
let lastSsoRole: { accountId: string; roleName: string } | null = null;

// Whether a refresh is currently in-flight (prevents concurrent refresh calls)
let isRefreshing = false;

// Callback invoked for credential lifecycle events (expired, refreshed)
let credentialEventCallback: ((event: string) => void) | null = null;

// ---------------------------------------------------------------------------
// INI parser helpers
// ---------------------------------------------------------------------------

interface IniSection {
  [key: string]: string;
}

interface IniFile {
  [section: string]: IniSection;
}

function parseIni(content: string): IniFile {
  const result: IniFile = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      result[currentSection] = {};
      continue;
    }

    if (currentSection) {
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        result[currentSection][key] = value;
      }
    }
  }

  return result;
}

function getCredentialsPath(): string {
  return (
    process.env.AWS_SHARED_CREDENTIALS_FILE ||
    path.join(os.homedir(), '.aws', 'credentials')
  );
}

function getConfigPath(): string {
  return (
    process.env.AWS_CONFIG_FILE || path.join(os.homedir(), '.aws', 'config')
  );
}

function readIniFile(filePath: string): IniFile {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseIni(content);
}

// ---------------------------------------------------------------------------
// SSO config lookup
// ---------------------------------------------------------------------------

interface SsoConfig {
  sso_start_url: string;
  sso_region: string;
  sso_account_id: string;
  sso_role_name: string;
}

function getSsoConfig(profileName: string): SsoConfig | null {
  const config = readIniFile(getConfigPath());
  const sectionName =
    profileName === 'default' ? 'default' : `profile ${profileName}`;
  const section = config[sectionName];
  if (!section || !section.sso_start_url) return null;
  return {
    sso_start_url: section.sso_start_url,
    sso_region: section.sso_region,
    sso_account_id: section.sso_account_id,
    sso_role_name: section.sso_role_name,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse ~/.aws/credentials and ~/.aws/config to list available profiles.
 */
export function listProfiles(): AwsProfile[] {
  const profiles: AwsProfile[] = [];

  // Parse credentials file
  const credIni = readIniFile(getCredentialsPath());
  for (const section of Object.keys(credIni)) {
    const data = credIni[section];
    if (data.aws_access_key_id && data.aws_secret_access_key) {
      profiles.push({ name: section, source: 'credentials' });
    }
  }

  // Parse config file for SSO profiles
  const configIni = readIniFile(getConfigPath());
  for (const section of Object.keys(configIni)) {
    const data = configIni[section];
    if (!data.sso_start_url) continue;

    // Section name is "profile <name>" or "default"
    let name: string;
    if (section === 'default') {
      name = 'default';
    } else if (section.startsWith('profile ')) {
      name = section.slice('profile '.length);
    } else {
      continue;
    }

    profiles.push({ name, source: 'sso' });
  }

  return profiles;
}

/**
 * Load static credentials from the credentials file and store in memory.
 */
export function loadProfile(name: string): AwsCredentials {
  const credIni = readIniFile(getCredentialsPath());
  const section = credIni[name];

  if (!section || !section.aws_access_key_id || !section.aws_secret_access_key) {
    throw new Error(`Profile "${name}" not found in credentials file`);
  }

  const creds: AwsCredentials = {
    accessKeyId: section.aws_access_key_id,
    secretAccessKey: section.aws_secret_access_key,
    source: `credentials:${name}`,
  };

  if (section.aws_session_token) {
    creds.sessionToken = section.aws_session_token;
  }

  currentCredentials = creds;
  return creds;
}

/**
 * Perform SSO OIDC device authorization flow.
 * Opens the browser for user to authorize, then fetches temporary credentials.
 */
export async function startSsoLogin(profileName: string): Promise<AwsCredentials> {
  const ssoConfig = getSsoConfig(profileName);
  if (!ssoConfig) {
    throw new Error(
      `SSO configuration not found for profile "${profileName}" in config file`,
    );
  }

  const oidcClient = new SSOOIDCClient({ region: ssoConfig.sso_region });

  // Step 1: Register client
  const registerResp = await oidcClient.send(
    new RegisterClientCommand({
      clientName: 'trh-platform',
      clientType: 'public',
    }),
  );

  const clientId = registerResp.clientId!;
  const clientSecret = registerResp.clientSecret!;

  // Step 2: Start device authorization
  const deviceAuthResp = await oidcClient.send(
    new StartDeviceAuthorizationCommand({
      clientId,
      clientSecret,
      startUrl: ssoConfig.sso_start_url,
    }),
  );

  const deviceCode = deviceAuthResp.deviceCode!;
  const verificationUri = deviceAuthResp.verificationUriComplete!;
  const intervalSec = deviceAuthResp.interval ?? 5;

  // Step 3: Open browser for user authorization
  await shell.openExternal(verificationUri);

  // Step 4: Poll for token
  let accessToken: string | undefined;
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));

    try {
      const tokenResp = await oidcClient.send(
        new CreateTokenCommand({
          clientId,
          clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode,
        }),
      );
      accessToken = tokenResp.accessToken!;
      break;
    } catch (err: any) {
      if (err.name === 'AuthorizationPendingException') continue;
      if (err.name === 'SlowDownException') continue;
      throw err;
    }
  }

  if (!accessToken) {
    throw new Error('SSO login timed out');
  }

  // Step 5: Get role credentials via SSO
  const ssoClient = new SSOClient({ region: ssoConfig.sso_region });
  const roleCredsResp = await ssoClient.send(
    new GetRoleCredentialsCommand({
      accountId: ssoConfig.sso_account_id,
      roleName: ssoConfig.sso_role_name,
      accessToken,
    }),
  );

  const roleCreds = roleCredsResp.roleCredentials!;

  const creds: AwsCredentials = {
    accessKeyId: roleCreds.accessKeyId!,
    secretAccessKey: roleCreds.secretAccessKey!,
    sessionToken: roleCreds.sessionToken!,
    source: `sso:${profileName}`,
    expiresAt: roleCreds.expiration,
  };

  currentCredentials = creds;
  return creds;
}

/**
 * Return in-memory credentials. Returns null if none loaded or if expired.
 * Kicks off a background refresh when credentials are within 10 minutes of expiry.
 */
export function getCredentials(): AwsCredentials | null {
  if (!currentCredentials) return null;

  if (currentCredentials.expiresAt !== undefined) {
    const now = Date.now();

    if (now > currentCredentials.expiresAt) {
      currentCredentials = null;
      credentialEventCallback?.('aws-auth:expired');
      return null;
    }

    // Kick off background refresh when less than 10 minutes remain
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    if (!isRefreshing && currentCredentials.expiresAt - now < TEN_MINUTES_MS) {
      void refreshCredentials();
    }
  }

  return currentCredentials;
}

/**
 * Attempt to refresh credentials using the active SSO session.
 * Returns new credentials on success, null on failure.
 * On failure emits 'aws-auth:expired' via the registered event callback.
 */
export async function refreshCredentials(): Promise<AwsCredentials | null> {
  if (isRefreshing) return currentCredentials;
  if (!ssoAccessToken || !ssoRegion || !lastSsoRole) return null;

  isRefreshing = true;
  try {
    const creds = await assumeSsoRole(lastSsoRole.accountId, lastSsoRole.roleName);
    return creds;
  } catch {
    credentialEventCallback?.('aws-auth:expired');
    return null;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Set the active AWS region for deployment.
 */
export function setActiveRegion(region: string): void {
  activeRegion = region;
}

/**
 * Get the active AWS region selected for deployment.
 */
export function getActiveRegion(): string | null {
  return activeRegion;
}

/**
 * Register a callback to receive credential lifecycle events.
 * Events: 'aws-auth:expired'
 */
export function setCredentialEventCallback(cb: (event: string) => void): void {
  credentialEventCallback = cb;
}

/**
 * Clear in-memory credentials and reset all auth state.
 */
export function clearCredentials(): void {
  currentCredentials = null;
  ssoAccessToken = null;
  ssoRegion = null;
  activeRegion = null;
  lastSsoRole = null;
}

// ---------------------------------------------------------------------------
// Direct SSO login (no ~/.aws/config required)
// ---------------------------------------------------------------------------

/**
 * Start SSO device auth flow with explicit start URL and region.
 * Returns after browser auth completes. Stores SSO access token for
 * subsequent listSsoAccounts / listSsoRoles / assumeSsoRole calls.
 */
export async function startSsoLoginDirect(
  startUrl: string,
  region: string,
): Promise<void> {
  const oidcClient = new SSOOIDCClient({ region });

  const registerResp = await oidcClient.send(
    new RegisterClientCommand({ clientName: 'trh-platform', clientType: 'public' }),
  );
  const clientId = registerResp.clientId!;
  const clientSecret = registerResp.clientSecret!;

  const deviceAuthResp = await oidcClient.send(
    new StartDeviceAuthorizationCommand({ clientId, clientSecret, startUrl }),
  );
  const deviceCode = deviceAuthResp.deviceCode!;
  const verificationUri = deviceAuthResp.verificationUriComplete ?? deviceAuthResp.verificationUri!;
  const intervalSec = deviceAuthResp.interval ?? 5;

  await shell.openExternal(verificationUri);

  let accessToken: string | undefined;
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    try {
      const tokenResp = await oidcClient.send(
        new CreateTokenCommand({
          clientId,
          clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode,
        }),
      );
      accessToken = tokenResp.accessToken!;
      break;
    } catch (err: any) {
      if (err.name === 'AuthorizationPendingException') continue;
      if (err.name === 'SlowDownException') continue;
      throw err;
    }
  }

  if (!accessToken) {
    throw new Error('SSO login timed out');
  }

  ssoAccessToken = accessToken;
  ssoRegion = region;
}

/**
 * List AWS accounts available to the current SSO session.
 */
export async function listSsoAccounts(): Promise<SsoAccount[]> {
  if (!ssoAccessToken || !ssoRegion) {
    throw new Error('No active SSO session. Call startSsoLoginDirect first.');
  }

  const ssoClient = new SSOClient({ region: ssoRegion });
  const resp = await ssoClient.send(
    new ListAccountsCommand({ accessToken: ssoAccessToken }),
  );

  return (resp.accountList ?? []).map((a) => ({
    accountId: a.accountId!,
    accountName: a.accountName ?? '',
    emailAddress: a.emailAddress ?? '',
  }));
}

/**
 * List roles available for an account in the current SSO session.
 */
export async function listSsoRoles(accountId: string): Promise<SsoRole[]> {
  if (!ssoAccessToken || !ssoRegion) {
    throw new Error('No active SSO session. Call startSsoLoginDirect first.');
  }

  const ssoClient = new SSOClient({ region: ssoRegion });
  const resp = await ssoClient.send(
    new ListAccountRolesCommand({ accessToken: ssoAccessToken, accountId }),
  );

  return (resp.roleList ?? []).map((r) => ({
    roleName: r.roleName!,
    accountId: r.accountId!,
  }));
}

/**
 * Assume a role in the current SSO session and store credentials in memory.
 */
export async function assumeSsoRole(
  accountId: string,
  roleName: string,
): Promise<AwsCredentials> {
  if (!ssoAccessToken || !ssoRegion) {
    throw new Error('No active SSO session. Call startSsoLoginDirect first.');
  }

  const ssoClient = new SSOClient({ region: ssoRegion });
  const resp = await ssoClient.send(
    new GetRoleCredentialsCommand({
      accessToken: ssoAccessToken,
      accountId,
      roleName,
    }),
  );

  const roleCreds = resp.roleCredentials!;
  const creds: AwsCredentials = {
    accessKeyId: roleCreds.accessKeyId!,
    secretAccessKey: roleCreds.secretAccessKey!,
    sessionToken: roleCreds.sessionToken!,
    source: `sso:${accountId}/${roleName}`,
    expiresAt: roleCreds.expiration,
  };

  lastSsoRole = { accountId, roleName };
  currentCredentials = creds;
  return creds;
}
