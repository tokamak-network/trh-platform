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
