import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, NativeImage, dialog, Notification, session } from 'electron';
import * as path from 'path';
import {
  isDockerInstalled,
  isDockerRunning,
  getDockerStatus,
  pullImages,
  startContainers,
  stopContainers,
  waitForHealthy,
  getDockerInstallUrl,
  checkBackendDependencies,
  installBackendDependencies,
  cleanupProcesses,
  setLogCallback,
  getPortConflicts,
  killPortProcesses,
  cleanupStaleContainers,
  cleanPlatform,
  startDockerDaemon,
  pruneDockerDisk,
  checkForUpdates,
  restartWithUpdates,
  PullProgress
} from './docker';
import { installDockerDesktop, type InstallResult } from './installer';
import {
  showPlatformView,
  destroyPlatformView,
  registerWebviewIpcHandlers,
  setAdminCredentials
} from './webview';
import * as NotificationStore from './notifications';
import {
  isAvailable as keystoreIsAvailable,
  hasSeedPhrase,
  storeSeedPhrase,
  getAddresses,
  previewAddresses,
  deleteSeedPhrase,
  validateMnemonic,
} from './keystore';
import {
  initNetworkGuard,
  setMainWindowId,
  getBlockedRequests,
} from './network-guard';
import {
  listProfiles as listAwsProfiles,
  loadProfile as loadAwsProfile,
  startSsoLogin as startAwsSsoLogin,
  startSsoLoginDirect as startAwsSsoLoginDirect,
  listSsoAccounts as listAwsSsoAccounts,
  listSsoRoles as listAwsSsoRoles,
  assumeSsoRole as assumeAwsSsoRole,
  getCredentials as getAwsCredentials,
  clearCredentials as clearAwsCredentials,
} from './aws-auth';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let dockerOperationInProgress = false;
let updateAvailable = false;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const PLATFORM_UI_URL = 'http://localhost:3000';
const VITE_DEV_URL = 'http://localhost:5173';
const isDev = !app.isPackaged && process.env.ELECTRON_USE_BUILD !== '1';

function getRendererPath(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
  }
  return path.join(__dirname, '..', 'renderer', 'index.html');
}

function getPublicPath(filename: string): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'public', filename);
  }
  return path.join(__dirname, '..', '..', 'public', filename);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 800,
    minHeight: 700,
    show: false,
    icon: getPublicPath('icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL);
  } else {
    mainWindow.loadFile(getRendererPath());
  }

  setLogCallback((line: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('docker:log', line);
    }
  });
}

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Uninstall Platform...',
          click: () => {
            mainWindow?.webContents.send('menu:uninstall');
          }
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ]
    },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'Learn More',
          click: async () => { await shell.openExternal('https://tokamak.network'); }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTrayMenu(): Electron.Menu {
  const template: Electron.MenuItemConstructorOptions[] = [];

  if (updateAvailable) {
    template.push({
      label: '🔄 Update Available — Click to Update',
      click: async () => {
        if (dockerOperationInProgress) {
          dialog.showErrorBox('Operation In Progress', 'Please wait for the current operation to complete.');
          return;
        }
        dockerOperationInProgress = true;
        try {
          await restartWithUpdates();
          updateAvailable = false;
          tray?.setContextMenu(buildTrayMenu());
          tray?.setToolTip('TRH Desktop');
          mainWindow?.webContents.send('docker:update-available', false);
        } catch (error) {
          dialog.showErrorBox(
            'Update Failed',
            error instanceof Error ? error.message : 'Failed to update services'
          );
        } finally {
          dockerOperationInProgress = false;
        }
      }
    });
    template.push({ type: 'separator' });
  }

  template.push(
    {
      label: 'Show Window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(PLATFORM_UI_URL)
    },
    { type: 'separator' },
    {
      label: 'Restart Services',
      click: async () => {
        if (dockerOperationInProgress) {
          dialog.showErrorBox('Operation In Progress', 'Please wait for the current operation to complete.');
          return;
        }
        dockerOperationInProgress = true;
        try {
          await stopContainers();
          await startContainers();
          const dialogOptions = {
            type: 'info' as const,
            title: 'Services Restarted',
            message: 'Docker containers have been restarted successfully.'
          };
          if (mainWindow && !mainWindow.isDestroyed()) {
            dialog.showMessageBox(mainWindow, dialogOptions);
          } else {
            dialog.showMessageBox(dialogOptions);
          }
        } catch (error) {
          dialog.showErrorBox(
            'Restart Failed',
            error instanceof Error ? error.message : 'Failed to restart Docker services'
          );
        } finally {
          dockerOperationInProgress = false;
        }
      }
    },
    {
      label: 'Stop Services',
      click: async () => {
        if (dockerOperationInProgress) {
          dialog.showErrorBox('Operation In Progress', 'Please wait for the current operation to complete.');
          return;
        }
        dockerOperationInProgress = true;
        try {
          await stopContainers();
          const dialogOptions = {
            type: 'info' as const,
            title: 'Services Stopped',
            message: 'Docker containers have been stopped.'
          };
          if (mainWindow && !mainWindow.isDestroyed()) {
            dialog.showMessageBox(mainWindow, dialogOptions);
          } else {
            dialog.showMessageBox(dialogOptions);
          }
        } catch (error) {
          dialog.showErrorBox(
            'Stop Failed',
            error instanceof Error ? error.message : 'Failed to stop Docker services'
          );
        } finally {
          dockerOperationInProgress = false;
        }
      }
    },
  );

  if (hasSeedPhrase()) {
    template.push({ type: 'separator' });
    template.push({
      label: 'Delete Stored Keys',
      click: async () => {
        const result = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Cancel', 'Delete'],
          defaultId: 0,
          cancelId: 0,
          title: 'Delete Stored Keys',
          message: 'This will permanently delete your stored seed phrase from this device. This action cannot be undone. Continue?',
        });
        if (result.response === 1) {
          try {
            deleteSeedPhrase();
            tray?.setContextMenu(buildTrayMenu());
            dialog.showMessageBox({
              type: 'info',
              title: 'Keys Deleted',
              message: 'Your stored seed phrase has been permanently deleted.',
            });
          } catch (error) {
            dialog.showErrorBox('Delete Failed', error instanceof Error ? error.message : 'Failed to delete keys');
          }
        }
      },
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  );

  return Menu.buildFromTemplate(template);
}

function createTray(): void {
  const iconPath = getPublicPath('tray-icon.png');
  let icon: NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('TRH Desktop');
  tray.setContextMenu(buildTrayMenu());

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
    }
  });
}

function startUpdateChecker(): void {
  const runCheck = async () => {
    if (dockerOperationInProgress || updateAvailable) return;
    try {
      const hasUpdate = await checkForUpdates();
      if (!hasUpdate) return;

      updateAvailable = true;

      // Update tray menu
      tray?.setContextMenu(buildTrayMenu());
      tray?.setToolTip('TRH Desktop — Update Available');

      // Add to notification store
      if (!NotificationStore.hasUpdateNotification()) {
        NotificationStore.add({
          type: 'image-update',
          title: 'Platform Update Available',
          message: 'New Docker images are available for TRH Platform.',
          actionLabel: 'Update Now',
          actionType: 'update-containers',
        });
      }

      // Notify renderer (legacy banner support)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('docker:update-available', true);
      }

      // macOS system notification
      if (Notification.isSupported()) {
        new Notification({
          title: 'TRH Desktop Update Available',
          body: 'New platform images are available. Open TRH Desktop to update.',
        }).show();
      }
    } catch {
      // Silently ignore background check failures
    }
  };

  updateCheckInterval = setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);
}

function setupIpcHandlers(): void {
  ipcMain.handle('docker:check-installed', () => isDockerInstalled());
  ipcMain.handle('docker:check-running', () => isDockerRunning());
  ipcMain.handle('docker:get-status', () => getDockerStatus());
  ipcMain.handle('docker:get-install-url', () => getDockerInstallUrl());

  ipcMain.handle('docker:install-docker', async (): Promise<InstallResult> => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available');
    }
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      return await installDockerDesktop(mainWindow);
    } finally {
      dockerOperationInProgress = false;
    }
  });
  ipcMain.handle('docker:check-ports', () => getPortConflicts());
  ipcMain.handle('docker:kill-port-processes', async (_event, ports: number[]) => {
    await killPortProcesses(ports);
  });

  ipcMain.handle('docker:cleanup', async () => {
    await cleanupStaleContainers();
  });

  ipcMain.handle('docker:clean-platform', async () => {
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      await cleanPlatform();
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('docker:start-daemon', async () => {
    return await startDockerDaemon();
  });

  ipcMain.handle('docker:prune', async () => {
    await pruneDockerDisk();
  });

  ipcMain.handle('docker:check-updates', async () => {
    if (dockerOperationInProgress) return false;
    dockerOperationInProgress = true;
    try {
      return await checkForUpdates();
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('docker:restart-with-updates', async (_event, config?: { adminEmail?: string; adminPassword?: string }) => {
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      await restartWithUpdates(config);
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('docker:start', async (_event, config?: { adminEmail?: string; adminPassword?: string }) => {
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      await startContainers(config);
      // Store credentials for auto-login when webview loads
      if (config?.adminEmail && config?.adminPassword) {
        setAdminCredentials(config.adminEmail, config.adminPassword);
      }
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('docker:stop', async () => {
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      await stopContainers();
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('docker:pull-images', async (event): Promise<void> => {
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      await pullImages((progress: PullProgress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('docker:pull-progress', progress);
        }
      });
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('docker:wait-healthy', async (event, timeoutMs?: number): Promise<boolean> => {
    return await waitForHealthy(timeoutMs, (status: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('docker:status-update', status);
      }
    });
  });

  ipcMain.handle('docker:check-backend-deps', () => checkBackendDependencies());

  ipcMain.handle('docker:install-backend-deps', async (event): Promise<void> => {
    if (dockerOperationInProgress) {
      throw new Error('Docker operation already in progress');
    }
    dockerOperationInProgress = true;
    try {
      await installBackendDependencies((status: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('docker:install-progress', status);
        }
      });
    } finally {
      dockerOperationInProgress = false;
    }
  });

  ipcMain.handle('app:load-platform', async (_event, config?: { adminEmail?: string; adminPassword?: string }): Promise<void> => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (config?.adminEmail && config?.adminPassword) {
      setAdminCredentials(config.adminEmail, config.adminPassword);
    }

    const maxRetries = 10;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(PLATFORM_UI_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          showPlatformView(mainWindow);
          return;
        }
      } catch {
        // Retry unless this is the last attempt
      }
      if (i === maxRetries - 1) {
        throw new Error('Platform UI failed to respond. Please check if Docker containers are running.');
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  });

  ipcMain.handle('app:open-external', async (_event, url: string): Promise<void> => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid URL protocol');
      }
      await shell.openExternal(url);
    } catch {
      throw new Error('Invalid URL');
    }
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  // Notification IPC handlers
  ipcMain.handle('notifications:get-all', () => NotificationStore.getAll());
  ipcMain.handle('notifications:mark-read', (_event, id: string) => NotificationStore.markRead(id));
  ipcMain.handle('notifications:mark-all-read', () => NotificationStore.markAllRead());
  ipcMain.handle('notifications:dismiss', (_event, id: string) => NotificationStore.dismiss(id));
  ipcMain.handle('notifications:get-unread-count', () => NotificationStore.getUnreadCount());
  ipcMain.handle('notifications:execute-action', async (_event, id: string) => {
    const all = NotificationStore.getAll();
    const notification = all.find(n => n.id === id);
    if (!notification) throw new Error('Notification not found');

    if (notification.actionType === 'update-containers') {
      if (dockerOperationInProgress) throw new Error('Docker operation already in progress');
      dockerOperationInProgress = true;
      try {
        await restartWithUpdates();
        updateAvailable = false;
        tray?.setContextMenu(buildTrayMenu());
        tray?.setToolTip('TRH Desktop');
        mainWindow?.webContents.send('docker:update-available', false);
        NotificationStore.dismiss(id);
      } finally {
        dockerOperationInProgress = false;
      }
    }
  });

  // Keystore IPC handlers
  ipcMain.handle('keystore:store', async (_event, mnemonic: string) => {
    storeSeedPhrase(mnemonic);
  });
  ipcMain.handle('keystore:has', () => hasSeedPhrase());
  ipcMain.handle('keystore:is-available', () => keystoreIsAvailable());
  ipcMain.handle('keystore:get-addresses', () => getAddresses());
  ipcMain.handle('keystore:preview-addresses', (_event, mnemonic: string) => previewAddresses(mnemonic));
  ipcMain.handle('keystore:delete', () => deleteSeedPhrase());
  ipcMain.handle('keystore:validate', (_event, mnemonic: string) => validateMnemonic(mnemonic));

  // AWS Auth IPC handlers
  ipcMain.handle('aws-auth:list-profiles', () => {
    return listAwsProfiles();
  });
  ipcMain.handle('aws-auth:load-profile', (_event, name: string) => {
    return loadAwsProfile(name);
  });
  ipcMain.handle('aws-auth:sso-login', async (_event, profileName: string) => {
    return startAwsSsoLogin(profileName);
  });
  ipcMain.handle('aws-auth:get-credentials', () => {
    return getAwsCredentials();
  });
  ipcMain.handle('aws-auth:clear', () => {
    clearAwsCredentials();
  });
  ipcMain.handle('aws-auth:sso-login-direct', async (_event, startUrl: string, region: string) => {
    return startAwsSsoLoginDirect(startUrl, region);
  });
  ipcMain.handle('aws-auth:sso-list-accounts', async () => {
    return listAwsSsoAccounts();
  });
  ipcMain.handle('aws-auth:sso-list-roles', async (_event, accountId: string) => {
    return listAwsSsoRoles(accountId);
  });
  ipcMain.handle('aws-auth:sso-assume-role', async (_event, accountId: string, roleName: string) => {
    return assumeAwsSsoRole(accountId, roleName);
  });

  // Network Guard IPC handlers
  ipcMain.handle('network-guard:get-blocked', () => getBlockedRequests());

  registerWebviewIpcHandlers(() => mainWindow);
}

app.whenReady().then(async () => {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  setupIpcHandlers();
  initNetworkGuard(session.defaultSession);
  setupApplicationMenu();
  createWindow();
  if (mainWindow) {
    setMainWindowId(mainWindow.webContents.id);
  }
  createTray();

  // Set dock icon explicitly when not packaged (packaged app uses the .icns from bundle automatically)
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(getPublicPath('icon.png'));
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  NotificationStore.initNotificationStore(() => mainWindow);
  startUpdateChecker();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }

  event.preventDefault();
  destroyPlatformView();
  cleanupProcesses();
  try {
    await stopContainers();
  } catch (error) {
    console.error('Failed to stop containers on quit:', error);
  }
  app.exit(0);
});

app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      event.preventDefault();
      callback(true);
      return;
    }
  } catch { /* invalid URL */ }
  callback(false);
});
