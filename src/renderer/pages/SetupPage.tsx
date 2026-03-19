import { useState, useEffect, useRef, useCallback } from 'react';
import StepItem, { type StepStatus } from '../components/StepItem';
import TerminalPanel, { type LogLine, createLogLine } from '../components/TerminalPanel';
import PortConflictModal from '../components/PortConflictModal';
import type { PortConflict } from '../types';
import './SetupPage.css';
import logo from '../assets/logo/logo.svg';
import tokamakLogo from '../assets/logo/tokamak.svg';
import rollupHubLogo from '../assets/logo/rolluphub.svg';

const api = window.electronAPI;

interface SetupPageProps {
  adminEmail: string;
  adminPassword: string;
  onComplete: () => void;
}

interface StepState {
  status: StepStatus;
  detail: string;
  progress?: number;
}

type PortModalState =
  | { open: false }
  | { open: true; conflicts: PortConflict[]; resolve: (action: 'confirm' | 'cancel') => void };

export default function SetupPage({ adminEmail, adminPassword, onComplete }: SetupPageProps) {
  const [steps, setSteps] = useState<Record<string, StepState>>({
    docker: { status: 'pending', detail: 'Waiting...' },
    images: { status: 'pending', detail: 'Waiting...' },
    containers: { status: 'pending', detail: 'Waiting...' },
    deps: { status: 'pending', detail: 'Waiting...' },
    ready: { status: 'pending', detail: 'Waiting...' },
    keysetup: { status: 'pending', detail: 'Waiting...' },
  });
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [showInstallDocker, setShowInstallDocker] = useState(false);
  const [installingDocker, setInstallingDocker] = useState(false);
  const [portModal, setPortModal] = useState<PortModalState>({ open: false });
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [seedInput, setSeedInput] = useState('');
  const [seedValid, setSeedValid] = useState<boolean | null>(null);
  const [seedAddresses, setSeedAddresses] = useState<Record<string, string> | null>(null);
  const [keystoreAvailable, setKeystoreAvailable] = useState(true);
  const [savingKeys, setSavingKeys] = useState(false);
  const runningRef = useRef(false);

  const appendLog = useCallback((text: string) => {
    setLogs(prev => [...prev, createLogLine(text)]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const updateStep = useCallback((key: string, update: Partial<StepState>) => {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }, []);

  const truncate = (s: string, max = 35) => s.length > max ? s.substring(0, max) + '...' : s;

  const runSetup = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    setError(null);
    setShowRetry(false);
    setShowInstallDocker(false);

    // Reset all steps
    setSteps({
      docker: { status: 'pending', detail: 'Waiting...' },
      images: { status: 'pending', detail: 'Waiting...' },
      containers: { status: 'pending', detail: 'Waiting...' },
      deps: { status: 'pending', detail: 'Waiting...' },
      ready: { status: 'pending', detail: 'Waiting...' },
      keysetup: { status: 'pending', detail: 'Waiting...' },
    });

    api.docker.removeAllListeners();
    const logCleanup = api.docker.onLog((line) => {
      setLogs(prev => [...prev, createLogLine(line)]);

    });

    appendLog('Starting setup...');

    // Step 1: Docker check (auto-start if not running)
    appendLog('Checking Docker installation...');
    updateStep('docker', { status: 'loading', detail: 'Checking Docker...' });

    const installed = await api.docker.checkInstalled();
    if (!installed) {
      appendLog('Docker not found on system');
      updateStep('docker', { status: 'error', detail: 'Not installed' });
      setError({ title: 'Docker Required', message: 'Install Docker Desktop to continue.' });
      setShowInstallDocker(true);
      setShowRetry(true);
      runningRef.current = false;
      logCleanup();
      return;
    }

    appendLog('Docker installed, checking if daemon is running...');
    let running = await api.docker.checkRunning();
    if (!running) {
      appendLog('Docker daemon is not running, attempting to start...');
      updateStep('docker', { status: 'loading', detail: 'Starting Docker...' });
      running = await api.docker.startDaemon();
      if (!running) {
        updateStep('docker', { status: 'error', detail: 'Not running' });
        setError({ title: 'Docker Not Running', message: 'Could not start Docker automatically. Please start Docker Desktop manually and retry.' });
        setShowRetry(true);
        runningRef.current = false;
        logCleanup();
        return;
      }
    }

    appendLog('Docker daemon is running');
    updateStep('docker', { status: 'success', detail: 'Docker ready' });

    // Step 2: Pull images (auto-retry up to 2 times)
    appendLog('Pulling container images...');
    updateStep('images', { status: 'loading', detail: 'Pulling images...', progress: 0 });

    let pullSuccess = false;
    for (let pullAttempt = 0; pullAttempt < 3; pullAttempt++) {
      let pullProgress = 0;
      const pullCleanup = api.docker.onPullProgress((progress) => {
        pullProgress = Math.min(pullProgress + 2, 95);
        updateStep('images', {
          status: 'loading',
          detail: truncate(progress.status),
          progress: pullProgress,
        });
      });

      try {
        await api.docker.pullImages();
        appendLog('All images pulled successfully');
        updateStep('images', { status: 'success', detail: 'Images ready', progress: 100 });
        pullCleanup();
        pullSuccess = true;
        break;
      } catch (err: any) {
        pullCleanup();
        const msg = err.message || '';

        // Disk space → prune and retry
        if ((msg.includes('disk') || msg.includes('space')) && pullAttempt < 2) {
          appendLog('Low disk space, pruning Docker...');
          updateStep('images', { status: 'loading', detail: 'Freeing disk space...', progress: 0 });
          await api.docker.prune();
          appendLog('Prune complete, retrying pull...');
          continue;
        }

        // Network/timeout → just retry once
        if (pullAttempt < 2) {
          appendLog(`Pull failed (attempt ${pullAttempt + 1}), retrying...`);
          updateStep('images', { status: 'loading', detail: 'Retrying pull...', progress: 0 });
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        updateStep('images', { status: 'error', detail: 'Failed' });
        setError({ title: 'Pull Failed', message: msg || 'Check your internet connection and disk space.' });
        setShowRetry(true);
        runningRef.current = false;
        logCleanup();
        return;
      }
    }
    if (!pullSuccess) {
      updateStep('images', { status: 'error', detail: 'Failed' });
      setError({ title: 'Pull Failed', message: 'Could not pull images after multiple attempts.' });
      setShowRetry(true);
      runningRef.current = false;
      logCleanup();
      return;
    }

    // Step 3: Port check + Start containers
    // Helper: check ports, show modal if conflicts, kill if user confirms
    const resolvePortConflicts = async (): Promise<boolean> => {
      appendLog('Checking for port conflicts...');
      updateStep('containers', { status: 'loading', detail: 'Checking ports...' });

      const portResult = await api.docker.checkPorts();
      if (portResult.available) {
        appendLog('All ports available');
        return true;
      }

      const conflictPorts = [...new Set(portResult.conflicts.map(c => c.port))];
      appendLog('Port conflict on: ' + conflictPorts.join(', '));

      const userChoice = await new Promise<'confirm' | 'cancel'>((resolve) => {
        setPortModal({ open: true, conflicts: portResult.conflicts, resolve });
      });
      setPortModal({ open: false });

      if (userChoice === 'cancel') {
        appendLog('User cancelled — ports not freed');
        return false;
      }

      appendLog('Freeing ports...');
      updateStep('containers', { status: 'loading', detail: 'Freeing ports...' });
      await api.docker.killPortProcesses(conflictPorts);
      appendLog('Ports freed successfully');
      return true;
    };

    const isPortError = (msg: string) =>
      msg.toLowerCase().includes('port') || msg.toLowerCase().includes('address already in use');

    const isStaleError = (msg: string) =>
      msg.toLowerCase().includes('stale') || msg.toLowerCase().includes('already in use by container') ||
      msg.toLowerCase().includes('network') || msg.toLowerCase().includes('volume conflict');

    // Attempt container start with port conflict resolution + stale cleanup (up to 3 tries)
    let containerStarted = false;
    let didCleanup = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const portsOk = await resolvePortConflicts();
        if (!portsOk) {
          updateStep('containers', { status: 'error', detail: 'Port conflict' });
          setError({ title: 'Port Conflict', message: 'Free the required ports manually and retry.' });
          setShowRetry(true);
          runningRef.current = false;
          logCleanup();
          return;
        }

        appendLog('Starting containers...');
        updateStep('containers', { status: 'loading', detail: 'Starting containers...' });
        await api.docker.start({ adminEmail, adminPassword });
        appendLog('Containers started successfully');
        updateStep('containers', { status: 'success', detail: 'Running' });
        containerStarted = true;
        break;
      } catch (err: any) {
        const errorMsg = err.message || 'Could not start containers.';

        // Port error → retry with port resolution
        if (isPortError(errorMsg) && attempt < 2) {
          appendLog('Port conflict during startup, retrying...');
          continue;
        }

        // Stale containers/network/volume → auto-cleanup and retry
        if ((isStaleError(errorMsg) || errorMsg.includes('failed with code')) && !didCleanup) {
          appendLog('Docker environment issue detected, cleaning up...');
          updateStep('containers', { status: 'loading', detail: 'Cleaning up...' });
          try {
            await api.docker.cleanup();
            didCleanup = true;
            appendLog('Cleanup done, retrying...');
            continue;
          } catch {
            appendLog('Cleanup failed');
          }
        }

        updateStep('containers', { status: 'error', detail: 'Failed' });
        setError({ title: 'Start Failed', message: errorMsg });
        setShowRetry(true);
        runningRef.current = false;
        logCleanup();
        return;
      }
    }

    if (!containerStarted) {
      updateStep('containers', { status: 'error', detail: 'Failed' });
      setError({ title: 'Start Failed', message: 'Could not start containers after multiple attempts.' });
      setShowRetry(true);
      runningRef.current = false;
      logCleanup();
      return;
    }

    // Step 4: Backend dependencies (auto-retry up to 2 times)
    appendLog('Checking backend dependencies...');
    updateStep('deps', { status: 'loading', detail: 'Checking dependencies...', progress: 10 });

    let depsReady = false;
    for (let depAttempt = 0; depAttempt < 3; depAttempt++) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        const deps = await api.docker.checkBackendDeps();
        updateStep('deps', { progress: 30 });

        if (!deps.allInstalled) {
          const missing: string[] = [];
          if (!deps.pnpm) missing.push('pnpm');
          if (!deps.node) missing.push('node');
          if (!deps.forge) missing.push('forge');
          if (!deps.aws) missing.push('aws');

          appendLog('Installing: ' + missing.join(', '));
          updateStep('deps', { status: 'loading', detail: `Installing: ${missing.join(', ')}...` });

          const installCleanup = api.docker.onInstallProgress((status) => {
            updateStep('deps', { status: 'loading', detail: truncate(status) });
          });

          await api.docker.installBackendDeps();
          installCleanup();

          updateStep('deps', { status: 'loading', detail: 'Verifying installation...', progress: 90 });
          await new Promise(r => setTimeout(r, 1000));

          const verifyDeps = await api.docker.checkBackendDeps();
          if (!verifyDeps.allInstalled) {
            const stillMissing: string[] = [];
            if (!verifyDeps.pnpm) stillMissing.push('pnpm');
            if (!verifyDeps.node) stillMissing.push('node');
            if (!verifyDeps.forge) stillMissing.push('forge');
            if (!verifyDeps.aws) stillMissing.push('aws');
            throw new Error(`Still missing: ${stillMissing.join(', ')}`);
          }
        }

        appendLog('All backend dependencies verified');
        updateStep('deps', { status: 'success', detail: 'All tools ready', progress: 100 });
        depsReady = true;
        break;
      } catch (err: any) {
        if (depAttempt < 2) {
          appendLog(`Dependency install failed (attempt ${depAttempt + 1}), retrying...`);
          updateStep('deps', { status: 'loading', detail: 'Retrying install...', progress: 0 });
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        updateStep('deps', { status: 'error', detail: 'Installation failed' });
        setError({ title: 'Dependencies Failed', message: err.message || 'Could not install backend tools.' });
        setShowRetry(true);
        runningRef.current = false;
        logCleanup();
        return;
      }
    }
    if (!depsReady) {
      updateStep('deps', { status: 'error', detail: 'Installation failed' });
      setError({ title: 'Dependencies Failed', message: 'Could not install dependencies after multiple attempts.' });
      setShowRetry(true);
      runningRef.current = false;
      logCleanup();
      return;
    }

    // Step 5: Health check (auto-restart containers once if timeout)
    let healthPassed = false;
    for (let healthAttempt = 0; healthAttempt < 2; healthAttempt++) {
      appendLog('Running health checks...');
      updateStep('ready', { status: 'loading', detail: 'Health check...' });

      const statusCleanup = api.docker.onStatusUpdate((status) => {
        updateStep('ready', { status: 'loading', detail: status });
      });

      try {
        const healthy = await api.docker.waitHealthy(180000);
        statusCleanup();

        if (healthy) {
          appendLog('All services healthy - setup complete!');
          updateStep('ready', { status: 'success', detail: 'All systems go!' });
          healthPassed = true;
          break;
        }

        // Timeout — try restarting containers once
        if (healthAttempt === 0) {
          appendLog('Health check timed out, restarting containers...');
          updateStep('ready', { status: 'loading', detail: 'Restarting services...' });
          try {
            await api.docker.stop();
            await api.docker.start({ adminEmail, adminPassword });
            appendLog('Containers restarted, rechecking health...');
            continue;
          } catch {
            appendLog('Restart failed');
          }
        }

        updateStep('ready', { status: 'error', detail: 'Timeout' });
        setError({ title: 'Timeout', message: 'Services did not become healthy. Try restarting Docker Desktop and retry.' });
        setShowRetry(true);
        runningRef.current = false;
        logCleanup();
        return;
      } catch (err: any) {
        statusCleanup();
        if (healthAttempt === 0) {
          appendLog('Health check error, retrying...');
          continue;
        }
        updateStep('ready', { status: 'error', detail: 'Error' });
        setError({ title: 'Failed', message: err.message || 'Unexpected error.' });
        setShowRetry(true);
        runningRef.current = false;
        logCleanup();
        return;
      }
    }

    if (!healthPassed) {
      updateStep('ready', { status: 'error', detail: 'Failed' });
      setError({ title: 'Failed', message: 'Services did not become healthy after restart.' });
      setShowRetry(true);
      runningRef.current = false;
      logCleanup();
      return;
    }

    runningRef.current = false;
    logCleanup();

    updateStep('keysetup', { status: 'loading', detail: 'Ready for input' });

    try {
      const available = await api.keystore.isAvailable();
      setKeystoreAvailable(available);
    } catch {
      setKeystoreAvailable(false);
    }

    setShowKeySetup(true);
  }, [adminEmail, adminPassword, appendLog, updateStep, onComplete]);

  useEffect(() => {
    runSetup();
    return () => {
      api.docker.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (runningRef.current) {
        e.preventDefault();
        e.returnValue = 'Setup is in progress. Closing may leave the system in an inconsistent state.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleRetry = () => {
    runSetup();
  };

  const handleSeedChange = async (value: string) => {
    setSeedInput(value);
    setSeedAddresses(null);
    setSeedValid(null);

    const trimmed = value.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) {
      if (words.length > 0) setSeedValid(false);
      return;
    }

    try {
      const valid = await api.keystore.validate(trimmed);
      setSeedValid(valid);
      if (valid) {
        const addrs = await api.keystore.previewAddresses(trimmed);
        setSeedAddresses(addrs);
      }
    } catch {
      setSeedValid(false);
    }
  };

  const handleSaveKeys = async () => {
    if (!seedValid || savingKeys) return;
    setSavingKeys(true);
    try {
      await api.keystore.store(seedInput.trim());
      updateStep('keysetup', { status: 'success', detail: 'Keys stored securely' });
      await new Promise(r => setTimeout(r, 1000));
      onComplete();
    } catch (err: any) {
      updateStep('keysetup', { status: 'error', detail: 'Save failed' });
      setError({ title: 'Keystore Error', message: err.message || 'Failed to store seed phrase.' });
      setShowRetry(true);
    } finally {
      setSavingKeys(false);
    }
  };

  const handleSkipKeys = () => {
    updateStep('keysetup', { status: 'success', detail: 'Skipped' });
    onComplete();
  };

  const handleInstallDocker = async () => {
    if (installingDocker) return;
    setInstallingDocker(true);
    setError(null);
    appendLog('Starting Docker Desktop installation...');
    updateStep('docker', { status: 'loading', detail: 'Installing Docker...' });

    const installProgressCleanup = api.docker.onInstallProgress((status) => {
      appendLog(status);
      updateStep('docker', { status: 'loading', detail: status.substring(0, 40) });
    });

    try {
      const result = await api.docker.installDocker();
      setShowInstallDocker(false);
      if (result.requiresRelogin) {
        appendLog('Docker installed. You must log out and back in for group changes to take effect.');
        updateStep('docker', { status: 'error', detail: 'Relogin required' });
        setError({
          title: 'Log Out Required',
          message: 'Docker was installed successfully. Please log out and back in to apply group permissions, then click Retry.',
        });
        setShowRetry(true);
      } else {
        appendLog('Docker installed. Starting daemon...');
        updateStep('docker', { status: 'loading', detail: 'Starting Docker...' });
        runningRef.current = false;
        runSetup();
      }
    } catch (err: any) {
      const msg = err?.message || 'Installation failed.';
      appendLog(`Docker install failed: ${msg}`);
      updateStep('docker', { status: 'error', detail: 'Install failed' });
      setError({
        title: 'Installation Failed',
        message: `${msg} Please install Docker manually from docker.com and retry.`,
      });
      setShowRetry(true);
    } finally {
      installProgressCleanup();
      setInstallingDocker(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="container">
        <div className="header">
          <div className="logo-row">
            <img src={logo} alt="TRH" className="logo-main" />
            <div className="logo-words">
              <img src={tokamakLogo} alt="Tokamak" />
              <div className="logo-sep" />
              <img src={rollupHubLogo} alt="Rollup Hub" />
            </div>
          </div>
          <h1>TRH Desktop</h1>
          <p className="subtitle">One-click L2 Rollup Deployment</p>
        </div>

        <div className="steps">
          <StepItem index={1} title="Docker Environment" detail={steps.docker.detail} status={steps.docker.status} />
          <StepItem index={2} title="Container Images" detail={steps.images.detail} status={steps.images.status} showProgress progress={steps.images.progress} />
          <StepItem index={3} title="Building & Starting Services" detail={steps.containers.detail} status={steps.containers.status} />
          <StepItem index={4} title="Verifying Dependencies" detail={steps.deps.detail} status={steps.deps.status} showProgress progress={steps.deps.progress} />
          <StepItem index={5} title="Platform Ready" detail={steps.ready.detail} status={steps.ready.status} />
          <StepItem index={6} title="L2 Key Setup" detail={steps.keysetup.detail} status={steps.keysetup.status} />
        </div>

        {showKeySetup && (
          <div className="key-setup-form">
            {!keystoreAvailable ? (
              <div className="key-setup-warning">
                <p>OS keychain is not available. Seed phrase storage is disabled on this system.</p>
                <button className="btn btn-outline" onClick={handleSkipKeys}>Skip</button>
              </div>
            ) : (
              <>
                <p className="key-setup-desc">
                  Enter your seed phrase to enable L2 rollup deployment.
                  Your phrase is encrypted locally and never sent over the network.
                </p>
                <textarea
                  className="seed-input"
                  placeholder="Enter 12 or 24 word seed phrase..."
                  value={seedInput}
                  onChange={(e) => handleSeedChange(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  autoComplete="off"
                />
                {seedValid === false && (
                  <p className="seed-error">Invalid seed phrase. Must be 12 or 24 words.</p>
                )}
                {seedValid && seedAddresses && (
                  <div className="seed-addresses">
                    <p className="seed-addresses-title">Derived Addresses</p>
                    <table>
                      <tbody>
                        {Object.entries(seedAddresses).map(([role, addr]) => (
                          <tr key={role}>
                            <td className="role-name">{role}</td>
                            <td className="role-path">{"m/44'/60'/0'/0/" + ({ admin: 0, proposer: 1, batcher: 2, challenger: 3, sequencer: 4 } as Record<string, number>)[role]}</td>
                            <td className="role-addr">{String(addr).slice(0, 6)}...{String(addr).slice(-4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="key-setup-buttons">
                  <button className="btn btn-primary" onClick={handleSaveKeys} disabled={!seedValid || savingKeys}>
                    {savingKeys ? 'Saving...' : 'Save & Continue'}
                  </button>
                  <button className="btn btn-outline" onClick={handleSkipKeys}>
                    Skip for now
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="error-box visible">
            <h4>{error.title}</h4>
            <p>{error.message}</p>
          </div>
        )}

        <TerminalPanel logs={logs} onClear={clearLogs} />

        <div className="btn-row">
          {showInstallDocker && (
            <button className="btn btn-primary" onClick={handleInstallDocker} disabled={installingDocker}>
              {installingDocker ? 'Installing Docker...' : 'Install Docker'}
            </button>
          )}
          {showRetry && (
            <button className="btn btn-outline" onClick={handleRetry}>
              Retry
            </button>
          )}
        </div>
      </div>

      {portModal.open && (
        <PortConflictModal
          conflicts={portModal.conflicts}
          onConfirm={() => portModal.resolve('confirm')}
          onCancel={() => portModal.resolve('cancel')}
        />
      )}
    </div>
  );
}
