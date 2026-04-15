import { BrowserWindow } from 'electron';

export interface AppNotification {
  id: string;
  type: 'image-update' | 'release-update' | 'system' | 'deployment';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  actionType?: 'update-containers';
}

const notifications: AppNotification[] = [];
let mainWindowGetter: (() => BrowserWindow | null) | null = null;

function notifyRenderer(): void {
  const win = mainWindowGetter?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('notifications:changed');
  }
}

export function initNotificationStore(getMainWindow: () => BrowserWindow | null): void {
  mainWindowGetter = getMainWindow;
}

export function getAll(): AppNotification[] {
  return [...notifications].sort((a, b) => b.timestamp - a.timestamp);
}

export function add(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): AppNotification {
  const newNotification: AppNotification = {
    ...notification,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    read: false,
  };
  notifications.unshift(newNotification);
  notifyRenderer();
  return newNotification;
}

export function markRead(id: string): void {
  const n = notifications.find(n => n.id === id);
  if (n) {
    n.read = true;
    notifyRenderer();
  }
}

export function markAllRead(): void {
  notifications.forEach(n => { n.read = true; });
  notifyRenderer();
}

export function dismiss(id: string): void {
  const idx = notifications.findIndex(n => n.id === id);
  if (idx !== -1) {
    notifications.splice(idx, 1);
    notifyRenderer();
  }
}

export function getUnreadCount(): number {
  return notifications.filter(n => !n.read).length;
}

export function hasUpdateNotification(): boolean {
  return notifications.some(n => n.type === 'image-update' && !n.read);
}
