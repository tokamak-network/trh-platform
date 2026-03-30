import { useState, useEffect } from 'react';
import ConfigPage from './pages/ConfigPage';
import SetupPage from './pages/SetupPage';
import NotificationPage from './pages/NotificationPage';

type ViewMode = 'config' | 'setup' | 'webapp' | 'notifications';

const api = window.electronAPI;

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('config');
  const [version, setVersion] = useState('');
  const [credentials, setCredentials] = useState({
    email: 'admin@gmail.com',
    password: 'admin',
  });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dockerHealthy, setDockerHealthy] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
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
          setDockerHealthy(true);
        }
      } catch {
        // Docker not available — proceed to config page
      }
    })();

    const cleanupUpdate = api.docker.onUpdateAvailable((available) => {
      setUpdateAvailable(available);
    });

    return () => cleanupUpdate();
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

  const handleConfigDone = async (email: string, password: string) => {
    setCredentials({ email, password });
    if (dockerHealthy) {
      await api.app.loadPlatform({ adminEmail: email, adminPassword: password });
      setViewMode('webapp');
    } else {
      setViewMode('setup');
    }
  };

  const handleSetupDone = async () => {
    await api.app.loadPlatform({ adminEmail: credentials.email, adminPassword: credentials.password });
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
      setViewMode('config');
    }
  };

  switch (viewMode) {
    case 'webapp':
      return (
        <>
          {updateAvailable && (
            <div className="update-banner-global">
              New platform update available —{' '}
              <button onClick={() => api.docker.restartWithUpdates().then(() => setUpdateAvailable(false))}>
                Update Now
              </button>
            </div>
          )}
          {version && <div className="version">v{version}</div>}

          {/* Gear button */}
          <div className="gear-menu">
            <button
              className="gear-btn"
              onClick={() => setGearOpen((prev) => !prev)}
              aria-label="Platform settings"
            >
              ⚙
            </button>

            {gearOpen && (
              <>
                {/* Click-outside overlay */}
                <div className="gear-backdrop" onClick={() => setGearOpen(false)} />
                <div className="gear-dropdown">
                  {version && (
                    <div className="gear-version">TRH Platform v{version}</div>
                  )}
                  <button
                    className="gear-uninstall-btn"
                    onClick={() => {
                      setGearOpen(false);
                      setUninstallInput('');
                      setUninstallOpen(true);
                    }}
                  >
                    Uninstall
                  </button>
                </div>
              </>
            )}
          </div>

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
          {viewMode === 'config' && <ConfigPage onContinue={handleConfigDone} />}
          {viewMode === 'setup' && (
            <SetupPage
              adminEmail={credentials.email}
              adminPassword={credentials.password}
              onComplete={handleSetupDone}
            />
          )}
          {version && <div className="version">v{version}</div>}
        </>
      );
  }
}
