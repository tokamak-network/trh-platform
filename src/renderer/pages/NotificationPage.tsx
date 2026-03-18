import { useState, useEffect, useCallback } from 'react';
import type { AppNotification } from '../types';
import './NotificationPage.css';

const api = window.electronAPI;

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getTypeIcon(type: AppNotification['type']): string {
  switch (type) {
    case 'image-update': return '🔄';
    case 'release-update': return '🚀';
    case 'system': return '⚙️';
  }
}

interface NotificationCardProps {
  notification: AppNotification;
  onDismiss: (id: string) => void;
  onAction: (id: string) => Promise<void>;
}

function NotificationCard({ notification, onDismiss, onAction }: NotificationCardProps) {
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(false);

  const handleAction = async () => {
    setExecuting(true);
    try {
      await onAction(notification.id);
      setDone(true);
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className={`notification-card ${notification.read ? '' : 'unread'}`}>
      {notification.read
        ? <div className="notification-read-spacer" />
        : <div className="notification-unread-dot" />
      }
      <div className="notification-icon">{getTypeIcon(notification.type)}</div>
      <div className="notification-content">
        <div className="notification-card-title">{notification.title}</div>
        <div className="notification-card-message">{notification.message}</div>
        <div className="notification-card-time">{getRelativeTime(notification.timestamp)}</div>
      </div>
      <div className="notification-actions">
        {notification.actionLabel && !done && (
          <button
            className="notification-action-btn"
            onClick={handleAction}
            disabled={executing}
          >
            {executing && <span className="notification-spinner" />}
            {notification.actionLabel}
          </button>
        )}
        {done && (
          <span className="notification-action-done">✓ Updated</span>
        )}
        <button
          className="notification-dismiss-btn"
          onClick={() => onDismiss(notification.id)}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface Props {
  onBack: () => void;
}

export default function NotificationPage({ onBack }: Props) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const all = await api.notifications.getAll();
      setNotifications(all);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const cleanup = api.notifications.onChanged(loadNotifications);
    return cleanup;
  }, [loadNotifications]);

  const handleDismiss = async (id: string) => {
    await api.notifications.dismiss(id);
  };

  const handleAction = async (id: string) => {
    await api.notifications.executeAction(id);
  };

  const handleMarkAllRead = async () => {
    await api.notifications.markAllRead();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="notification-page">
      <div className="notification-header">
        <button className="notification-back-btn" onClick={onBack}>
          ← Back
        </button>
        <span className="notification-title">
          Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </span>
        {unreadCount > 0 && (
          <button className="notification-mark-all-btn" onClick={handleMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="notification-empty">
            <div className="notification-empty-icon">🔔</div>
            <p>No notifications yet</p>
          </div>
        ) : (
          notifications.map(n => (
            <NotificationCard
              key={n.id}
              notification={n}
              onDismiss={handleDismiss}
              onAction={handleAction}
            />
          ))
        )}
      </div>
    </div>
  );
}
