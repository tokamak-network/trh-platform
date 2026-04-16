/**
 * Electron E2E — Notification Page UI (Spec ENF)
 *
 * Tests the NotificationPage overlay in the Electron BrowserWindow renderer.
 * The notification page is shown when the WebContentsView navigates to any URL
 * containing "/notification" — App.tsx intercepts this and switches viewMode.
 *
 * Test IDs:
 *   ENF-01 — Empty state displayed when no notifications exist
 *   ENF-02 — "← Back" button restores webapp view
 *   ENF-03 — Deployment notification card renders with correct title/message/unread dot
 *   ENF-04 — Dismiss removes the card
 *   ENF-05 — Mark all read clears unread dots on all cards
 *
 * ENF-03 through ENF-05 require:
 *   - A completed deployment (the deployment-watcher must have fired)
 *   - Set LIVE_STACK_ID to the deployed stack's ID so the test skips a fresh deploy
 *   - OR run after electron-general.live.spec.ts which deploys a stack
 *
 * Usage:
 *   npm run build && npx playwright test --config playwright.electron.config.ts \
 *     tests/e2e/electron-notifications.live.spec.ts
 *
 * Prerequisites:
 *   - Docker running (make up or started by Electron app)
 *   - LIVE_L1_RPC_URL set (Sepolia RPC endpoint)
 */

import * as path from 'path';
import * as fs from 'fs';
import { _electron as electron, ElectronApplication } from 'playwright';
import { test, expect } from '@playwright/test';
import { waitForBackendReady } from './helpers/deploy-helper';
import { getPlatformView } from './helpers/platform-view';
import type { AppNotification } from '../../src/renderer/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELECTRON_APP_PATH = path.resolve('dist/main/index.js');
const SCREENSHOT_DIR = '/tmp/pw-screenshots/electron-notifications';

/** Timeout for the app to reach webapp mode (Docker pull + container start). */
const WEBAPP_READY_TIMEOUT_MS = 5 * 60 * 1000;
/** How long to wait for the notification page to appear after triggering navigation. */
const NOTIFICATION_PAGE_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Triggers the notification page overlay by loading a /notification URL in the
 * WebContentsView. App.tsx intercepts the did-navigate event and switches
 * viewMode to 'notifications', which renders <NotificationPage />.
 */
async function openNotificationPage(mainWindow: import('playwright').Page): Promise<void> {
  await mainWindow.evaluate(async () => {
    await window.electronAPI.webview.loadUrl('http://localhost:3000/notification');
  });
}

/**
 * Reads all notifications from the store via IPC.
 * Runs in the renderer context — calls the preload's notifications.getAll() IPC.
 */
async function getNotifications(mainWindow: import('playwright').Page): Promise<AppNotification[]> {
  return mainWindow.evaluate<AppNotification[]>(async () => {
    return window.electronAPI.notifications.getAll();
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication | null = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('[enf] Launching Electron app from:', ELECTRON_APP_PATH);
  electronApp = await electron.launch({
    args: [ELECTRON_APP_PATH],
    env: {
      ...process.env,
      SKIP_PULL: 'true',
      NODE_ENV: 'test',
      ELECTRON_USE_BUILD: '1',
    },
  });
  console.log('[enf] Electron app launched');

  // Wait for Docker + backend to be ready (SetupPage runs in background)
  await waitForBackendReady(WEBAPP_READY_TIMEOUT_MS);

  // Wait for the platform WebContentsView (localhost:3000) to appear — this
  // confirms the app has reached webapp mode and the webview is loaded.
  await getPlatformView(electronApp, WEBAPP_READY_TIMEOUT_MS);
  console.log('[enf] Platform view ready');
});

test.afterAll(async () => {
  if (electronApp) {
    console.log('[enf] Closing Electron app');
    await electronApp.close();
    electronApp = null;
  }
});

// ---------------------------------------------------------------------------
// ENF-01: Empty state
// ---------------------------------------------------------------------------

test('ENF-01: notification page shows empty state when no notifications exist', async () => {
  test.setTimeout(NOTIFICATION_PAGE_TIMEOUT_MS + 30_000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];

  // Dismiss any existing notifications first
  const before = await getNotifications(mainWindow);
  for (const n of before) {
    await mainWindow.evaluate(async (id: string) => {
      await window.electronAPI.notifications.dismiss(id);
    }, n.id);
  }

  await openNotificationPage(mainWindow);

  await expect(mainWindow.getByText('No notifications yet')).toBeVisible({
    timeout: NOTIFICATION_PAGE_TIMEOUT_MS,
  });
  await expect(mainWindow.locator('.notification-empty-icon')).toBeVisible();

  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/enf-01-empty-state.png` });
  console.log('[ENF-01] Empty state verified ✓');
});

// ---------------------------------------------------------------------------
// ENF-02: Back button restores webapp view
// ---------------------------------------------------------------------------

test('ENF-02: back button restores webview and hides notification page', async () => {
  test.setTimeout(NOTIFICATION_PAGE_TIMEOUT_MS + 30_000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];

  // Ensure we are on the notification page
  await openNotificationPage(mainWindow);
  await expect(mainWindow.getByText(/Notifications/)).toBeVisible({
    timeout: NOTIFICATION_PAGE_TIMEOUT_MS,
  });

  // Click Back
  await mainWindow.getByRole('button', { name: /← Back/ }).click();

  // NotificationPage should be gone — setup or webapp content visible instead
  await expect(mainWindow.getByText('No notifications yet')).not.toBeVisible({
    timeout: 5_000,
  });

  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/enf-02-back-to-webapp.png` });
  console.log('[ENF-02] Back navigation verified ✓');
});

// ---------------------------------------------------------------------------
// ENF-03: Deployment notification card renders correctly
// ---------------------------------------------------------------------------

test('ENF-03: L2 deployment success notification card renders with correct content', async () => {
  test.setTimeout(NOTIFICATION_PAGE_TIMEOUT_MS + 30_000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];

  // This test requires the deployment-watcher to have fired (i.e. a stack
  // transitioned Deploying → Deployed while this Electron app was running).
  // Run after electron-general.live.spec.ts, or set LIVE_STACK_ID.
  const notifications = await getNotifications(mainWindow);
  const deployNotif = notifications.find(
    (n) => n.title === 'L2 Deployment Complete',
  );
  if (!deployNotif) {
    console.warn('[ENF-03] No deployment notification found — skipping (run after a deployment)');
    test.skip();
    return;
  }

  await openNotificationPage(mainWindow);

  // Card must be visible with correct title and message
  await expect(mainWindow.getByText('L2 Deployment Complete')).toBeVisible({
    timeout: NOTIFICATION_PAGE_TIMEOUT_MS,
  });
  await expect(mainWindow.getByText(/is now deployed and running/)).toBeVisible();

  // Unread dot present (notification is new)
  const card = mainWindow.locator('.notification-card.unread').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.notification-unread-dot')).toBeVisible();

  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/enf-03-deployment-notification.png` });
  console.log('[ENF-03] Deployment notification card verified ✓');
});

// ---------------------------------------------------------------------------
// ENF-04: Dismiss notification
// ---------------------------------------------------------------------------

test('ENF-04: dismissing a notification removes its card', async () => {
  test.setTimeout(NOTIFICATION_PAGE_TIMEOUT_MS + 30_000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];

  const notifications = await getNotifications(mainWindow);
  if (notifications.length === 0) {
    console.warn('[ENF-04] No notifications to dismiss — skipping');
    test.skip();
    return;
  }

  await openNotificationPage(mainWindow);

  // Get the first visible card title
  const firstTitle = notifications[0].title;
  const titleLocator = mainWindow.getByText(firstTitle);
  await expect(titleLocator).toBeVisible({ timeout: NOTIFICATION_PAGE_TIMEOUT_MS });

  // Click the dismiss (×) button on the card
  const card = mainWindow.locator('.notification-card').first();
  await card.locator('.notification-dismiss-btn').click();

  // Card should disappear
  await expect(titleLocator).not.toBeVisible({ timeout: 5_000 });

  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/enf-04-dismissed.png` });
  console.log(`[ENF-04] Dismissed "${firstTitle}" ✓`);
});

// ---------------------------------------------------------------------------
// ENF-05: Mark all read
// ---------------------------------------------------------------------------

test('ENF-05: mark all read removes all unread dots', async () => {
  test.setTimeout(NOTIFICATION_PAGE_TIMEOUT_MS + 30_000);
  expect(electronApp).not.toBeNull();

  const mainWindow = electronApp!.windows()[0];

  const notifications = await getNotifications(mainWindow);
  const hasUnread = notifications.some((n) => !n.read);
  if (!hasUnread) {
    console.warn('[ENF-05] No unread notifications — skipping');
    test.skip();
    return;
  }

  await openNotificationPage(mainWindow);

  // Header shows unread count
  await expect(mainWindow.getByText(/Notifications \(\d+\)/)).toBeVisible({
    timeout: NOTIFICATION_PAGE_TIMEOUT_MS,
  });

  // Click "Mark all read"
  await mainWindow.getByRole('button', { name: /Mark all read/ }).click();

  // Unread count badge disappears from header
  await expect(mainWindow.getByText(/Notifications \(\d+\)/)).not.toBeVisible({
    timeout: 5_000,
  });
  await expect(mainWindow.getByText('Notifications')).toBeVisible();

  // No unread dots remain
  await expect(mainWindow.locator('.notification-unread-dot')).not.toBeVisible();

  await mainWindow.screenshot({ path: `${SCREENSHOT_DIR}/enf-05-all-read.png` });
  console.log('[ENF-05] Mark all read verified ✓');
});
