import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';

// In browser dev mode (no Electron), inject mock ElectronAPI
if (import.meta.env.VITE_MOCK_ELECTRON === 'true' || !window.electronAPI) {
  const { mockElectronAPI } = await import('./mock/electronAPI');
  window.electronAPI = mockElectronAPI;
  console.info('[dev] Mock ElectronAPI injected. Use ?scenario=<name> to change scenario.');
  console.info('[dev] Scenarios: fresh | healthy | port-conflict | dep-missing | pull-fail | health-fail');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
