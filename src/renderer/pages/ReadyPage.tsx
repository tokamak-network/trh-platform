import { useState, useEffect } from 'react';
import './ReadyPage.css';
import trhCenter from '../assets/trh-center.svg';
import nextIcon from '../assets/icon/next-icon.svg';

const planets = [
  { label: 'App Chain', className: 'planet-1' },
  { label: 'Ecosystem', className: 'planet-2' },
  { label: 'Protocol', className: 'planet-3' },
  { label: 'Stack', className: 'planet-4' },
  { label: 'Integration', className: 'planet-5' },
  { label: 'SDK', className: 'planet-6' },
];

interface ReadyPageProps {
  updateAvailable?: boolean;
  onUpdate?: () => void;
}

export default function ReadyPage({ updateAvailable, onUpdate }: ReadyPageProps) {
  const api = window.electronAPI;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [webviewVisible, setWebviewVisible] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState('');
  const [webviewLoadError, setWebviewLoadError] = useState<string | null>(null);

  useEffect(() => {
    const cleanupVisibility = api.webview.onVisibilityChanged((visible) => {
      setWebviewVisible(visible);
      if (!visible) setWebviewLoadError(null);
    });
    const cleanupNavigate = api.webview.onDidNavigate((info) => {
      setWebviewUrl(info.url);
      setCanGoBack(info.canGoBack);
      setCanGoForward(info.canGoForward);
      setWebviewLoadError(null);
    });
    const cleanupFinish = api.webview.onDidFinishLoad((info) => {
      setWebviewUrl(info.url);
      setCanGoBack(info.canGoBack);
      setCanGoForward(info.canGoForward);
      setWebviewLoadError(null);
    });
    const cleanupFail = api.webview.onLoadFailed((info) => {
      if (info.errorCode !== -3) { // -3 = ERR_ABORTED (navigation cancelled, not a real error)
        setWebviewLoadError(`Failed to load: ${info.errorDescription}`);
      }
    });
    return () => {
      cleanupVisibility();
      cleanupNavigate();
      cleanupFinish();
      cleanupFail();
      api.webview.removeAllListeners();
    };
  }, []);

  const handleHideWebview = async () => {
    await api.webview.hide();
  };

  const handleLoadPlatform = async () => {
    if (loading || updating) return;
    setLoading(true);
    setError(null);
    try {
      await api.app.loadPlatform();
    } catch {
      setError('Platform UI is not responding. Check if Docker containers are running.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (updating || loading) return;
    setUpdating(true);
    setError(null);
    let updated = false;
    try {
      updated = await api.docker.restartWithUpdates();
      if (!updated) return;
      // Wait for services to become healthy
      const healthy = await api.docker.waitHealthy(180000);
      if (!healthy) {
        setError('Services did not become healthy after update. Try restarting.');
      }
    } catch (err: any) {
      setError(err.message || 'Update failed. Try restarting the app.');
    } finally {
      setUpdating(false);
      if (updated) onUpdate?.();
    }
  };

  return (
    <div className={`ready-page visible${webviewVisible ? ' webview-active' : ''}`}>
      {webviewVisible && (
        <div className="webview-navbar">
          <div className="webview-nav-left">
            <button className="nav-btn" onClick={() => api.webview.goBack()} disabled={!canGoBack} title="Back">&#8592;</button>
            <button className="nav-btn" onClick={() => api.webview.goForward()} disabled={!canGoForward} title="Forward">&#8594;</button>
            <button className="nav-btn" onClick={() => api.webview.reload()} title="Reload">&#8635;</button>
          </div>
          <div className="webview-nav-url">{webviewUrl}</div>
          <div className="webview-nav-right">
            {webviewLoadError && <span className="nav-error">{webviewLoadError}</span>}
            <button className="nav-btn-home" onClick={handleHideWebview}>&#8592; Dashboard</button>
          </div>
        </div>
      )}

      <div className="solar-system">
        <img src={trhCenter} alt="TRH" className="solar-center" />
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className={`orbit orbit-${i}`} />
        ))}
        {planets.map((p, i) => (
          <div key={i} className={`planet ${p.className}`}>
            <span className="planet-label">{p.label}</span>
            <div className="planet-dot" />
          </div>
        ))}
      </div>
      <div className="ready-content">
        <h1 className="ready-title">
          L2 On-Demand
          <span>Tailored for Ethereum</span>
        </h1>
        <p className="ready-subtitle">Explore and Deploy your On-Demand Appchain</p>
        <p className="ready-subtitle-secondary">A Fast, Secure, and Fully Customizable L2 Appchain</p>
        {(updateAvailable || updating) && (
          <div className="update-banner">
            <span>{updating ? 'Updating services...' : 'New platform update available'}</span>
            {!updating && (
              <button className="update-btn" onClick={handleUpdate}>Update Now</button>
            )}
          </div>
        )}
        {error && (
          <p className="ready-error">{error}</p>
        )}
        <div className="ready-buttons">
          <button className="btn-secondary" onClick={handleLoadPlatform} disabled={loading || updating}>
            Dashboard
          </button>
          <button className="btn-start" onClick={handleLoadPlatform} disabled={loading || updating}>
            {loading ? 'Loading...' : 'Get Started'}
            {!loading && <img src={nextIcon} alt="arrow" />}
          </button>
        </div>
      </div>
    </div>
  );
}
