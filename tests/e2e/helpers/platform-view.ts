/**
 * Platform UI WebContentsView finder for Electron E2E tests.
 *
 * The TRH Platform Electron app embeds the Next.js UI (localhost:3000) in a
 * WebContentsView alongside the main BrowserWindow. This helper polls the
 * window list until the platform view is found, then returns it ready for
 * Playwright interactions.
 *
 * Authentication is handled automatically by src/main/webview.ts which injects
 * admin credentials into the WebContentsView via the preload bridge.
 */

import type { ElectronApplication, Page } from 'playwright';

/**
 * Find the Platform UI WebContentsView within the running Electron app.
 *
 * Polls `electronApp.windows()` until a window whose URL starts with
 * `http://localhost:3000` is found. Waits for `domcontentloaded` before
 * returning so callers can immediately query the DOM.
 *
 * @param electronApp - The running Electron application
 * @param timeoutMs   - Maximum wait time in ms (default 60 s)
 * @throws If the platform view is not found within the timeout
 */
export async function getPlatformView(
  electronApp: ElectronApplication,
  timeoutMs = 60_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const view = electronApp
      .windows()
      .find((w) => w.url().startsWith('http://localhost:3000'));

    if (view) {
      await view.waitForLoadState('domcontentloaded').catch(() => {
        // domcontentloaded may already have fired — ignore error
      });
      return view;
    }

    await new Promise<void>((r) => setTimeout(r, 1_000));
  }

  throw new Error(
    `Platform UI WebContentsView (localhost:3000) not found within ${timeoutMs}ms. ` +
      'Ensure the Electron app has completed its initial setup (Docker pull/up) before calling getPlatformView.',
  );
}
