// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, dialog as ElectronDialog, Notification as ElectronNotification } from 'electron';
import {
  confirmContainerUpdate,
  showUpdateDesktopNotification,
} from '../../src/main/update-notification-safety';

describe('update notification safety', () => {
  it('routes OS desktop notification clicks to the in-app notification page', () => {
    const show = vi.fn();
    const focus = vi.fn();
    const send = vi.fn();
    let clickHandler: (() => void) | undefined;
    const notificationInstance = {
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'click') clickHandler = handler;
        return notificationInstance;
      }),
      show,
    };
    const NotificationCtor = vi.fn(function MockNotification() {
      return notificationInstance;
    });
    NotificationCtor.isSupported = vi.fn(() => true);

    const window = {
      isDestroyed: () => false,
      show,
      focus,
      webContents: { send },
    } as unknown as BrowserWindow;

    showUpdateDesktopNotification(NotificationCtor as unknown as typeof ElectronNotification, window);

    expect(NotificationCtor).toHaveBeenCalledWith({
      title: 'TRH Desktop Update Available',
      body: 'New platform images are available. Open TRH Desktop to update.',
    });
    expect(notificationInstance.on).toHaveBeenCalledWith('click', expect.any(Function));
    expect(notificationInstance.show).toHaveBeenCalled();

    clickHandler?.();

    expect(show).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('app:show-notifications');
  });

  it('does not create an OS desktop notification when unsupported', () => {
    const NotificationCtor = vi.fn();
    NotificationCtor.isSupported = vi.fn(() => false);

    showUpdateDesktopNotification(NotificationCtor as unknown as typeof ElectronNotification, null);

    expect(NotificationCtor).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before pulling images and restarting containers', async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 1 });
    const dialog = { showMessageBox } as unknown as typeof ElectronDialog;
    const window = {
      isDestroyed: () => false,
    } as unknown as BrowserWindow;

    const confirmed = await confirmContainerUpdate(dialog, window);

    expect(confirmed).toBe(false);
    expect(showMessageBox).toHaveBeenCalledWith(window, {
      type: 'warning',
      title: 'Update Platform Containers?',
      message: 'Updating TRH Platform will pull new images and restart containers.',
      detail: expect.stringContaining('currently running chains'),
      buttons: ['Update and Restart Containers', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
  });

  it('allows update only when the destructive confirmation button is selected', async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 });
    const dialog = { showMessageBox } as unknown as typeof ElectronDialog;
    const window = {
      isDestroyed: () => false,
    } as unknown as BrowserWindow;

    await expect(confirmContainerUpdate(dialog, window)).resolves.toBe(true);
  });
});
