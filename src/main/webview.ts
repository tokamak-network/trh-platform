/**
 * webview.ts
 *
 * Manages an in-app WebContentsView (Electron 28+) for loading localhost:3000.
 * Uses WebContentsView instead of the deprecated BrowserView.
 *
 * NOTE: Electron version in use is ^33.0.0 — WebContentsView is the correct API.
 */

import * as path from 'path';
import { BrowserWindow, WebContentsView, ipcMain, shell } from 'electron';
import { hasSeedPhrase, getAddresses, deriveKeysToEnv, getSeedWords } from './keystore';
import type { KeyRole } from './keystore';
import { getCredentials as getAwsCredentials } from './aws-auth';
import { addAllowedHost } from './network-guard';

const PLATFORM_UI_URL = 'http://localhost:3000';
const BACKEND_API_URL = 'http://localhost:8000';

// Height of the macOS hiddenInset title bar area (trafficLightPosition y:16 + button height + padding)
const MACOS_TITLEBAR_HEIGHT = 52;

let platformView: WebContentsView | null = null;
let hostWindow: BrowserWindow | null = null;
let adminCredentials: { email: string; password: string } | null = null;
let autoLoginAttemptedAt = 0;
let cachedAuthToken: string | null = null;

/**
 * Returns the content bounds for the WebContentsView, filling the entire window.
 */
function getViewBounds(win: BrowserWindow): Electron.Rectangle {
  const [width, height] = win.getContentSize();
  if (process.platform === 'darwin') {
    return { x: 0, y: MACOS_TITLEBAR_HEIGHT, width, height: height - MACOS_TITLEBAR_HEIGHT };
  }
  return { x: 0, y: 0, width, height };
}

/**
 * Attaches a resize listener so the view always fills the window.
 */
function attachResizeHandler(win: BrowserWindow): void {
  win.on('resize', () => {
    if (platformView && !win.isDestroyed()) {
      platformView.setBounds(getViewBounds(win));
    }
  });
}

/**
 * Creates and shows the platform WebContentsView inside the given BrowserWindow.
 * If a view already exists, it is shown without re-creating.
 */
export function setAdminCredentials(email: string, password: string): void {
  adminCredentials = { email, password };
}

/**
 * Fetches an auth token from the backend and caches it.
 * Called before the platform view loads so the token is available to the preload.
 */
async function fetchAuthToken(): Promise<void> {
  if (!adminCredentials) return;
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminCredentials.email,
        password: adminCredentials.password,
      }),
    });
    if (!response.ok) return;
    const data = await response.json() as { token?: string };
    if (data.token) cachedAuthToken = data.token;
  } catch { /* backend not ready yet — token stays cached or null */ }
}

export async function showPlatformView(win: BrowserWindow): Promise<void> {
  hostWindow = win;

  if (platformView) {
    // Already exists — just make it visible, and re-inject token in case it expired
    platformView.setBounds(getViewBounds(win));
    win.webContents.send('webview:visibility-changed', true);
    await fetchAuthToken();
    void injectTokenToView();
    return;
  }

  const preloadPath = path.join(__dirname, 'webview-preload.js');

  platformView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload requires sandbox:false
      preload: preloadPath,
      allowRunningInsecureContent: false
    }
  });

  win.contentView.addChildView(platformView);
  platformView.setBounds(getViewBounds(win));

  // Open all window.open() calls in the system browser so MetaMask and other
  // extensions are available. Electron sub-windows don't support browser extensions.
  platformView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Allow localhost certificate errors (self-signed dev setups)
  platformView.webContents.on('certificate-error', (event, url, _error, _cert, callback) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        event.preventDefault();
        callback(true);
        return;
      }
    } catch { /* invalid URL */ }
    callback(false);
  });

  // Navigation events — forward to renderer for UI updates
  platformView.webContents.on('did-navigate', (_event, navigationUrl) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('webview:did-navigate', {
        url: navigationUrl,
        canGoBack: platformView?.webContents.navigationHistory.canGoBack() ?? false,
        canGoForward: platformView?.webContents.navigationHistory.canGoForward() ?? false
      });
    }
    injectKeystoreAccounts();
    injectAwsCredentials();
    void injectTokenToView();
  });

  platformView.webContents.on('did-navigate-in-page', (_event, navigationUrl) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('webview:did-navigate', {
        url: navigationUrl,
        canGoBack: platformView?.webContents.navigationHistory.canGoBack() ?? false,
        canGoForward: platformView?.webContents.navigationHistory.canGoForward() ?? false
      });
    }
    injectKeystoreAccounts();
    injectAwsCredentials();
    void injectTokenToView();
  });

  platformView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, failedUrl) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('webview:load-failed', {
        errorCode,
        errorDescription,
        url: failedUrl
      });
    }
  });

  platformView.webContents.on('did-finish-load', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('webview:did-finish-load', {
        url: platformView?.webContents.getURL() ?? '',
        canGoBack: platformView?.webContents.navigationHistory.canGoBack() ?? false,
        canGoForward: platformView?.webContents.navigationHistory.canGoForward() ?? false
      });
    }

    // Inject keystore-derived accounts into the web frontend
    injectKeystoreAccounts();
    injectAwsCredentials();
    void injectTokenToView();
  });

  attachResizeHandler(win);

  // Pre-fetch auth token before loading so the preload can inject it synchronously
  await fetchAuthToken();
  platformView.webContents.loadURL(PLATFORM_UI_URL);
  win.webContents.send('webview:visibility-changed', true);
}

/**
 * Hides the platform WebContentsView and returns the user to the main dashboard.
 * The view is NOT destroyed — it is merely positioned off-screen so its state
 * (scroll position, session) is preserved for next time.
 */
export function hidePlatformView(win: BrowserWindow): void {
  if (platformView && !win.isDestroyed()) {
    // Move out of visible area without destroying
    platformView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  win.webContents.send('webview:visibility-changed', false);
}

/**
 * Fetches ETH balance for an address via JSON-RPC.
 */
async function fetchBalance(rpcUrl: string, address: string): Promise<string> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    });
    const json = await res.json() as { result?: string };
    if (json.result) {
      const wei = BigInt(json.result);
      const eth = Number(wei) / 1e18;
      return `${eth.toFixed(4)} ETH`;
    }
  } catch { /* RPC error */ }
  return '—';
}

/**
 * Injects keystore-derived account data into the WebContentsView.
 * Provides addresses, private keys, and balances so the web frontend can skip
 * the Account Selection step when keys are already stored in the desktop app.
 */
async function injectKeystoreAccounts(): Promise<void> {
  if (!platformView || !hasSeedPhrase()) return;

  try {
    const addresses = getAddresses();
    const roles: KeyRole[] = ['admin', 'proposer', 'batcher', 'challenger', 'sequencer'];
    const keys = deriveKeysToEnv(roles);

    const payload = {
      admin: { address: addresses.admin, privateKey: keys.ADMIN_PRIVATE_KEY },
      proposer: { address: addresses.proposer, privateKey: keys.PROPOSER_PRIVATE_KEY },
      batcher: { address: addresses.batcher, privateKey: keys.BATCHER_PRIVATE_KEY },
      challenger: { address: addresses.challenger, privateKey: keys.CHALLENGER_PRIVATE_KEY },
      sequencer: { address: addresses.sequencer, privateKey: keys.SEQUENCER_PRIVATE_KEY },
    };

    platformView.webContents.executeJavaScript(
      `window.__TRH_DESKTOP_ACCOUNTS__ = ${JSON.stringify(payload)};`
    ).catch(() => { /* ignore injection errors */ });
  } catch {
    // Keystore read failed — skip injection silently
  }
}

/**
 * Fallback: injects the cached auth token into the webview if on the login page.
 * The primary mechanism is the preload synchronous injection (before React renders).
 * This handles the reuse path and token expiry scenarios.
 */
async function injectTokenToView(): Promise<void> {
  if (!platformView || !adminCredentials) return;

  // Only inject on the login/auth page
  const currentUrl = platformView.webContents.getURL();
  const parsed = (() => { try { return new URL(currentUrl); } catch { return null; } })();
  const isLoginPage = parsed !== null && (
    parsed.pathname === '/' ||
    parsed.pathname.startsWith('/auth')
  );

  if (!isLoginPage) return;

  // Debounce: skip if attempted within the last 2 seconds (prevents rapid retries)
  const now = Date.now();
  if (now - autoLoginAttemptedAt < 2000) return;
  autoLoginAttemptedAt = now;

  // Refresh the token in case it expired
  await fetchAuthToken();
  if (!cachedAuthToken) return;

  const token = cachedAuthToken;
  await platformView.webContents.executeJavaScript(`
    (function() {
      localStorage.setItem('accessToken', ${JSON.stringify(token)});
      document.cookie = 'auth-token=' + ${JSON.stringify(token)} + '; path=/';
      window.location.href = '/';
    })();
  `).catch(() => { /* view may have been destroyed */ });
}

/**
 * Injects AWS credentials into the WebContentsView.
 * Provides credentials so the web frontend can use them for AWS API calls.
 */
function injectAwsCredentials(): void {
  if (!platformView) return;
  const creds = getAwsCredentials();
  if (!creds) return;

  const payload = {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    source: creds.source,
  };

  platformView.webContents.executeJavaScript(
    `window.__TRH_AWS_CREDENTIALS__ = ${JSON.stringify(payload)};`
  ).catch(() => {});
}

/**
 * Destroys the WebContentsView and frees resources.
 * Call this when the application is quitting or when a full reset is needed.
 */
export function destroyPlatformView(): void {
  if (platformView) {
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.contentView.removeChildView(platformView);
    }
    // WebContentsView does not have a .destroy() method on the view itself;
    // destroying the underlying webContents closes the page.
    platformView.webContents.close();
    platformView = null;
  }
  hostWindow = null;
  autoLoginAttemptedAt = 0;
  cachedAuthToken = null;
}

/**
 * Registers IPC handlers for renderer-driven webview navigation controls.
 *
 * Channels:
 *   webview:go-back          — navigate back
 *   webview:go-forward       — navigate forward
 *   webview:reload           — reload current page
 *   webview:load-url         — load a specific URL (validated)
 *   webview:show             — show the platform view
 *   webview:hide             — hide the platform view (return to dashboard)
 */
export function registerWebviewIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Synchronous IPC: preload calls this before page scripts run to get the cached auth token
  ipcMain.on('desktop:get-auth-token-sync', (event) => {
    event.returnValue = cachedAuthToken ?? '';
  });

  ipcMain.handle('webview:go-back', () => {
    if (platformView?.webContents.navigationHistory.canGoBack()) {
      platformView.webContents.navigationHistory.goBack();
    }
  });

  ipcMain.handle('webview:go-forward', () => {
    if (platformView?.webContents.navigationHistory.canGoForward()) {
      platformView.webContents.navigationHistory.goForward();
    }
  });

  ipcMain.handle('webview:reload', () => {
    platformView?.webContents.reload();
  });

  ipcMain.handle('webview:load-url', (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http/https URLs are allowed');
      }
      platformView?.webContents.loadURL(url);
    } catch {
      throw new Error('Invalid URL');
    }
  });

  ipcMain.handle('webview:show', async () => {
    const win = getMainWindow();
    if (win) await showPlatformView(win);
  });

  ipcMain.handle('webview:hide', () => {
    const win = getMainWindow();
    if (win) hidePlatformView(win);
  });

  // Return seed phrase words from keystore for preset deploy flow
  ipcMain.handle('desktop:get-seed-words', async (): Promise<string[] | null> => {
    return getSeedWords();
  });

  // Fetch balances using user-provided L1 RPC URL
  ipcMain.handle('desktop:fetch-balances', async (_event, rpcUrl: string): Promise<Record<string, string>> => {
    if (!hasSeedPhrase()) return {};

    // Whitelist the RPC host so NetworkGuard allows the request
    try {
      const parsed = new URL(rpcUrl);
      addAllowedHost(parsed.hostname);
    } catch {
      return {};
    }

    const addresses = getAddresses();
    const addrList = [addresses.admin, addresses.proposer, addresses.batcher, addresses.challenger, addresses.sequencer];
    const balances: Record<string, string> = {};
    await Promise.all(
      addrList.map(async (addr) => {
        balances[addr] = await fetchBalance(rpcUrl, addr);
      })
    );

    // Inject balances into WebView so platform-ui can read them
    if (platformView) {
      platformView.webContents.executeJavaScript(
        `window.__TRH_DESKTOP_BALANCES__ = ${JSON.stringify(balances)};`
        + `window.dispatchEvent(new Event('trh-balances-loaded'));`
      ).catch(() => { /* ignore */ });
    }

    return balances;
  });
}
