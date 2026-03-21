/**
 * webview.ts
 *
 * Manages an in-app WebContentsView (Electron 28+) for loading localhost:3000.
 * Uses WebContentsView instead of the deprecated BrowserView.
 *
 * NOTE: Electron version in use is ^33.0.0 — WebContentsView is the correct API.
 */

import * as path from 'path';
import { BrowserWindow, WebContentsView, ipcMain } from 'electron';
import { hasSeedPhrase, getAddresses, deriveKeysToEnv } from './keystore';
import type { KeyRole } from './keystore';
import { getCredentials as getAwsCredentials } from './aws-auth';
import { addAllowedHost } from './network-guard';

const PLATFORM_UI_URL = 'http://localhost:3000';

let platformView: WebContentsView | null = null;
let hostWindow: BrowserWindow | null = null;

/**
 * Returns the content bounds for the WebContentsView, filling the entire window.
 */
function getViewBounds(win: BrowserWindow): Electron.Rectangle {
  const [width, height] = win.getContentSize();
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
export function showPlatformView(win: BrowserWindow): void {
  hostWindow = win;

  if (platformView) {
    // Already exists — just make it visible
    platformView.setBounds(getViewBounds(win));
    win.webContents.send('webview:visibility-changed', true);
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
  });

  attachResizeHandler(win);

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
      sequencer: { address: addresses.sequencer, privateKey: keys.SEQUENCER_PRIVATE_KEY },
    };

    platformView.webContents.executeJavaScript(
      `window.__TRH_DESKTOP_ACCOUNTS__ = ${JSON.stringify(payload)};`
    ).catch(() => { /* ignore injection errors */ });

    // Inject balance-refresh hook that uses the L1 RPC URL from the deployment form
    platformView.webContents.executeJavaScript(`
      (function() {
        if (window.__TRH_BALANCE_HOOK_INSTALLED__) return;
        window.__TRH_BALANCE_HOOK_INSTALLED__ = true;

        function findRpcInput() {
          // Look for input with L1 RPC URL placeholder or label
          var inputs = document.querySelectorAll('input[placeholder*="rpc"], input[placeholder*="RPC"], input[placeholder*="alchemy"], input[placeholder*="infura"]');
          if (inputs.length > 0) return inputs[0];
          // Fallback: find by label text
          var labels = document.querySelectorAll('label');
          for (var i = 0; i < labels.length; i++) {
            if (labels[i].textContent && labels[i].textContent.match(/L1.*RPC|RPC.*URL/i)) {
              var input = labels[i].closest('.form-group, .field, div')?.querySelector('input');
              if (input) return input;
            }
          }
          return null;
        }

        function hookRefreshButton() {
          var buttons = document.querySelectorAll('button');
          var refreshBtn = null;
          for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent && buttons[i].textContent.match(/refresh.*balance/i)) {
              refreshBtn = buttons[i];
              break;
            }
          }
          if (!refreshBtn || refreshBtn.__trh_hooked__) return;
          refreshBtn.__trh_hooked__ = true;

          refreshBtn.addEventListener('click', async function(e) {
            if (!window.__TRH_DESKTOP__ || !window.__TRH_DESKTOP__.fetchBalances) return;
            var rpcInput = findRpcInput();
            var rpcUrl = rpcInput ? rpcInput.value : '';
            if (!rpcUrl) return;

            e.stopPropagation();
            e.preventDefault();

            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Loading...';
            try {
              var balances = await window.__TRH_DESKTOP__.fetchBalances(rpcUrl);
              // Update balance display in account selection UI
              var accounts = window.__TRH_DESKTOP_ACCOUNTS__ || {};
              var selects = document.querySelectorAll('select, .account-select, [class*="account"]');
              // Try updating text near each account address
              Object.entries(balances).forEach(function(entry) {
                var addr = entry[0];
                var bal = entry[1];
                var addrShort = addr.slice(0, 6) + '...' + addr.slice(-4);
                // Find elements containing this address and update nearby balance display
                var allEls = document.querySelectorAll('input, span, td, div, p');
                for (var j = 0; j < allEls.length; j++) {
                  var el = allEls[j];
                  var text = el.value || el.textContent || '';
                  if (text.includes(addr) || text.includes(addrShort)) {
                    // Look for a sibling or nearby element to show balance
                    var parent = el.closest('tr, .account-row, .form-group, div');
                    if (parent) {
                      var balEl = parent.querySelector('.balance, [class*="balance"]');
                      if (balEl) {
                        balEl.textContent = bal;
                      } else {
                        // Check if there's already a balance span we added
                        var existing = parent.querySelector('.trh-balance-display');
                        if (existing) {
                          existing.textContent = bal;
                        } else {
                          var span = document.createElement('span');
                          span.className = 'trh-balance-display';
                          span.style.cssText = 'margin-left:8px;color:#666;font-size:0.9em;';
                          span.textContent = bal;
                          el.parentElement.appendChild(span);
                        }
                      }
                    }
                    break;
                  }
                }
              });
            } catch(err) {
              console.error('[TRH] Balance fetch error:', err);
            } finally {
              refreshBtn.disabled = false;
              refreshBtn.innerHTML = '↻ Refresh Balances';
            }
          }, true);
        }

        // Hook on DOM changes (SPA navigation)
        var observer = new MutationObserver(function() { hookRefreshButton(); });
        observer.observe(document.body, { childList: true, subtree: true });
        hookRefreshButton();
      })();
    `).catch(() => { /* ignore */ });
  } catch {
    // Keystore read failed — skip injection silently
  }
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

  ipcMain.handle('webview:show', () => {
    const win = getMainWindow();
    if (win) showPlatformView(win);
  });

  ipcMain.handle('webview:hide', () => {
    const win = getMainWindow();
    if (win) hidePlatformView(win);
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
    const addrList = [addresses.admin, addresses.proposer, addresses.batcher, addresses.sequencer];
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
