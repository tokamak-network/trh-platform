/**
 * webview.ts
 *
 * Manages an in-app WebContentsView (Electron 28+) for loading localhost:3000.
 * Uses WebContentsView instead of the deprecated BrowserView.
 *
 * NOTE: Electron version in use is ^33.0.0 — WebContentsView is the correct API.
 */

import { BrowserWindow, WebContentsView, ipcMain } from 'electron';

const PLATFORM_UI_URL = 'http://localhost:3000';

// Header height in pixels reserved for navigation controls drawn in the renderer
const HEADER_HEIGHT = 48;

let platformView: WebContentsView | null = null;
let hostWindow: BrowserWindow | null = null;

/**
 * Returns the content bounds for the WebContentsView, filling the window
 * below the header bar.
 */
function getViewBounds(win: BrowserWindow): Electron.Rectangle {
  const [width, height] = win.getContentSize();
  return {
    x: 0,
    y: HEADER_HEIGHT,
    width,
    height: Math.max(0, height - HEADER_HEIGHT)
  };
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

  platformView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Allow mixed content from localhost
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
        canGoBack: platformView?.webContents.canGoBack() ?? false,
        canGoForward: platformView?.webContents.canGoForward() ?? false
      });
    }
  });

  platformView.webContents.on('did-navigate-in-page', (_event, navigationUrl) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('webview:did-navigate', {
        url: navigationUrl,
        canGoBack: platformView?.webContents.canGoBack() ?? false,
        canGoForward: platformView?.webContents.canGoForward() ?? false
      });
    }
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
        canGoBack: platformView?.webContents.canGoBack() ?? false,
        canGoForward: platformView?.webContents.canGoForward() ?? false
      });
    }
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
    if (platformView?.webContents.canGoBack()) {
      platformView.webContents.goBack();
    }
  });

  ipcMain.handle('webview:go-forward', () => {
    if (platformView?.webContents.canGoForward()) {
      platformView.webContents.goForward();
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
}
