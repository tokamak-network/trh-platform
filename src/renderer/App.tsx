import { useState, useEffect } from 'react';
import SetupPage from './pages/SetupPage';
import NotificationPage from './pages/NotificationPage';

type ViewMode = 'setup' | 'webapp' | 'notifications';

const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

export default function App() {
  const api = window.electronAPI;
  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [version, setVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [uninstallInput, setUninstallInput] = useState('');
  const [uninstalling, setUninstalling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await api.app.getVersion();
        setVersion(v);
      } catch {
        console.warn('Failed to get app version');
      }

      try {
        const status = await api.docker.getStatus();
        if (status.healthy) {
          await api.app.loadPlatform({ adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD });
          setViewMode('webapp');
        }
      } catch {
        // Docker not available — stay on setup page
      }
    })();

    const cleanupUpdate = api.docker.onUpdateAvailable((available) => {
      setUpdateAvailable(available);
    });
    const cleanupShowNotifications = api.app.onShowNotifications(() => {
      api.webview.hide();
      setViewMode('notifications');
    });

    return () => {
      cleanupUpdate();
      cleanupShowNotifications();
    };
  }, []);

  // Intercept webview navigation to /notification → show NotificationPage
  useEffect(() => {
    if (viewMode !== 'webapp' && viewMode !== 'notifications') return;

    const cleanup = api.webview.onDidNavigate((info) => {
      if (info.url.includes('/notification')) {
        api.webview.hide();
        setViewMode('notifications');
      } else if (viewMode === 'notifications') {
        setViewMode('webapp');
      }
    });

    return cleanup;
  }, [viewMode]);

  const handleSetupDone = async () => {
    await api.app.loadPlatform({ adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD });
    setViewMode('webapp');
  };

  const handleBackToWebapp = () => {
    api.webview.show();
    setViewMode('webapp');
  };

  const handleUninstall = async () => {
    if (uninstallInput !== 'UNINSTALL') return;
    setUninstalling(true);
    try {
      await api.docker.cleanPlatform();
    } catch (err) {
      console.error('cleanPlatform failed:', err);
    } finally {
      setUninstalling(false);
      setUninstallOpen(false);
      setUninstallInput('');
      setGearOpen(false);
      await api.webview.hide();
      setViewMode('setup');
    }
  };

  switch (viewMode) {
    case 'webapp':
      return (
        <>
          {updateAvailable && (
            <div className="update-banner-global">
              New platform update available —{' '}
              <button
                onClick={async () => {
                  const updated = await api.docker.restartWithUpdates();
                  if (updated) setUpdateAvailable(false);
                }}
              >
                Update Now
              </button>
            </div>
          )}
          {version && <div className="version">v{version}</div>}

          {/* Uninstall confirmation modal */}
          {uninstallOpen && (
            <div className="uninstall-overlay">
              <div className="uninstall-modal">
                <h2 className="uninstall-title">Uninstall Platform</h2>
                <p className="uninstall-warning">
                  This will permanently remove all platform containers, volumes, and data.
                  This action cannot be undone.
                </p>
                <label className="uninstall-label">
                  Type &ldquo;UNINSTALL&rdquo; to confirm
                </label>
                <input
                  className="uninstall-input"
                  type="text"
                  value={uninstallInput}
                  onChange={(e) => setUninstallInput(e.target.value)}
                  placeholder="UNINSTALL"
                  autoFocus
                  disabled={uninstalling}
                />
                <div className="uninstall-actions">
                  <button
                    className="uninstall-cancel-btn"
                    onClick={() => {
                      setUninstallOpen(false);
                      setUninstallInput('');
                    }}
                    disabled={uninstalling}
                  >
                    Cancel
                  </button>
                  <button
                    className="uninstall-confirm-btn"
                    onClick={handleUninstall}
                    disabled={uninstallInput !== 'UNINSTALL' || uninstalling}
                  >
                    {uninstalling ? 'Uninstalling...' : 'Uninstall'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      );

    case 'notifications':
      return <NotificationPage onBack={handleBackToWebapp} />;

    default:
      return (
        <>
          <div className="titlebar-drag" />
          <SetupPage
            adminEmail={ADMIN_EMAIL}
            adminPassword={ADMIN_PASSWORD}
            onComplete={handleSetupDone}
          />
          {version && <div className="version">v{version}</div>}
        </>
      );
  }
}
