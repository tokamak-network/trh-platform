import type { BrowserWindow, dialog as ElectronDialog, Notification as ElectronNotification } from 'electron';

const UPDATE_NOTIFICATION_TITLE = 'TRH Desktop Update Available';
const UPDATE_NOTIFICATION_BODY = 'New platform images are available. Open TRH Desktop to update.';

export function showUpdateDesktopNotification(
  NotificationCtor: typeof ElectronNotification,
  mainWindow: BrowserWindow | null
): void {
  if (!NotificationCtor.isSupported()) return;

  const notification = new NotificationCtor({
    title: UPDATE_NOTIFICATION_TITLE,
    body: UPDATE_NOTIFICATION_BODY,
  });

  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('app:show-notifications');
  });

  notification.show();
}

export async function confirmContainerUpdate(
  electronDialog: typeof ElectronDialog,
  mainWindow: BrowserWindow | null
): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    title: 'Update Platform Containers?',
    message: 'Updating TRH Platform will pull new images and restart containers.',
    detail: [
      'This can affect currently running chains because backend and platform UI containers will restart.',
      'RPC/API requests, deployment tasks, and chain management operations may be temporarily interrupted.',
      'Continue only when it is safe to pause active platform operations.',
    ].join('\n\n'),
    buttons: ['Update and Restart Containers', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };

  const result = mainWindow && !mainWindow.isDestroyed()
    ? await electronDialog.showMessageBox(mainWindow, options)
    : await electronDialog.showMessageBox(options);

  return result.response === 0;
}
