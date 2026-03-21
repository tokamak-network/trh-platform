import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Valid 12-word BIP39 mnemonic
const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const MOCK_ADDRESSES = {
  admin: '0x9858EfFD232B4033E47d90003D41EC34EcaEdA94',
  proposer: '0x6a3B248855C2D2c4a0F3bA8A1ad62fB188f0B8DB',
  batcher: '0xdEADBEeF00000000000000000000000000000003',
  challenger: '0xdEADBEeF00000000000000000000000000000004',
  sequencer: '0xdEADBEeF00000000000000000000000000000005',
};

const noop = () => () => {};

// vi.hoisted runs before any imports — ensures window.electronAPI exists when SetupPage loads
const { mockElectronAPI, mockKeystore } = vi.hoisted(() => {
  const mockKeystore = {
    store: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    isAvailable: vi.fn().mockResolvedValue(true),
    getAddresses: vi.fn().mockResolvedValue({
      admin: '0x9858EfFD232B4033E47d90003D41EC34EcaEdA94',
      proposer: '0x6a3B248855C2D2c4a0F3bA8A1ad62fB188f0B8DB',
      batcher: '0xdEADBEeF00000000000000000000000000000003',
      challenger: '0xdEADBEeF00000000000000000000000000000004',
      sequencer: '0xdEADBEeF00000000000000000000000000000005',
    }),
    previewAddresses: vi.fn().mockResolvedValue({
      admin: '0x9858EfFD232B4033E47d90003D41EC34EcaEdA94',
      proposer: '0x6a3B248855C2D2c4a0F3bA8A1ad62fB188f0B8DB',
      batcher: '0xdEADBEeF00000000000000000000000000000003',
      challenger: '0xdEADBEeF00000000000000000000000000000004',
      sequencer: '0xdEADBEeF00000000000000000000000000000005',
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn().mockImplementation(async (m: string) => {
      const words = m.trim().split(/\s+/);
      return words.length === 12 || words.length === 24;
    }),
  };

  const _noop = () => () => {};

  const mockElectronAPI = {
    docker: {
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkRunning: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockResolvedValue({ installed: true, running: true, containersUp: true, healthy: true }),
      checkPorts: vi.fn().mockResolvedValue({ available: true, conflicts: [] }),
      killPortProcesses: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      startDaemon: vi.fn().mockResolvedValue(true),
      prune: vi.fn().mockResolvedValue(undefined),
      checkUpdates: vi.fn().mockResolvedValue(false),
      restartWithUpdates: vi.fn().mockResolvedValue(undefined),
      pullImages: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      waitHealthy: vi.fn().mockResolvedValue(true),
      getInstallUrl: vi.fn().mockResolvedValue('https://docker.com'),
      installDocker: vi.fn().mockResolvedValue({ requiresRelogin: false }),
      checkBackendDeps: vi.fn().mockResolvedValue({ pnpm: true, node: true, forge: true, aws: true, allInstalled: true }),
      installBackendDeps: vi.fn().mockResolvedValue(undefined),
      onPullProgress: vi.fn().mockReturnValue(_noop),
      onStatusUpdate: vi.fn().mockReturnValue(_noop),
      onInstallProgress: vi.fn().mockReturnValue(_noop),
      onLog: vi.fn().mockReturnValue(_noop),
      onUpdateAvailable: vi.fn().mockReturnValue(_noop),
      removeAllListeners: vi.fn(),
    },
    app: {
      loadPlatform: vi.fn().mockResolvedValue(undefined),
      openExternal: vi.fn().mockResolvedValue(undefined),
      getVersion: vi.fn().mockResolvedValue('1.0.0-test'),
    },
    webview: {
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      loadUrl: vi.fn(),
      show: vi.fn(),
      hide: vi.fn().mockResolvedValue(undefined),
      onVisibilityChanged: vi.fn().mockReturnValue(_noop),
      onDidNavigate: vi.fn().mockReturnValue(_noop),
      onDidFinishLoad: vi.fn().mockReturnValue(_noop),
      onLoadFailed: vi.fn().mockReturnValue(_noop),
      removeAllListeners: vi.fn(),
    },
    notifications: {
      getAll: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(undefined),
      markAllRead: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue(undefined),
      getUnreadCount: vi.fn().mockResolvedValue(0),
      onChanged: vi.fn().mockReturnValue(_noop),
    },
    keystore: mockKeystore,
    networkGuard: {
      getBlockedRequests: vi.fn().mockResolvedValue([]),
    },
  };

  // Set on globalThis so window.electronAPI is available during module load
  (globalThis as any).electronAPI = mockElectronAPI;

  return { mockElectronAPI, mockKeystore };
});

// Mock CSS and SVG imports
vi.mock('./SetupPage.css', () => ({}));
vi.mock('../components/StepItem.css', () => ({}));
vi.mock('../components/TerminalPanel.css', () => ({}));
vi.mock('../components/PortConflictModal.css', () => ({}));
vi.mock('../assets/logo/logo.svg', () => ({ default: 'logo.svg' }));
vi.mock('../assets/logo/tokamak.svg', () => ({ default: 'tokamak.svg' }));
vi.mock('../assets/logo/rolluphub.svg', () => ({ default: 'rolluphub.svg' }));

import SetupPage from './SetupPage';

describe('SetupPage - Step 6 Key Setup', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onComplete.mockReset();
    // Restore default mock implementations after clearAllMocks
    mockKeystore.isAvailable.mockResolvedValue(true);
    mockKeystore.store.mockResolvedValue(undefined);
    mockKeystore.validate.mockImplementation(async (m: string) => {
      const words = m.trim().split(/\s+/);
      return words.length === 12 || words.length === 24;
    });
    mockKeystore.previewAddresses.mockResolvedValue(MOCK_ADDRESSES);
    mockElectronAPI.docker.checkInstalled.mockResolvedValue(true);
    mockElectronAPI.docker.checkRunning.mockResolvedValue(true);
    mockElectronAPI.docker.checkPorts.mockResolvedValue({ available: true, conflicts: [] });
    mockElectronAPI.docker.pullImages.mockResolvedValue(undefined);
    mockElectronAPI.docker.start.mockResolvedValue(undefined);
    mockElectronAPI.docker.waitHealthy.mockResolvedValue(true);
    mockElectronAPI.docker.checkBackendDeps.mockResolvedValue({ pnpm: true, node: true, forge: true, aws: true, allInstalled: true });
    mockElectronAPI.docker.onPullProgress.mockReturnValue(noop);
    mockElectronAPI.docker.onStatusUpdate.mockReturnValue(noop);
    mockElectronAPI.docker.onInstallProgress.mockReturnValue(noop);
    mockElectronAPI.docker.onLog.mockReturnValue(noop);
    mockElectronAPI.docker.removeAllListeners.mockReturnValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  async function renderAndWaitForKeySetup() {
    render(<SetupPage adminEmail="admin@test.com" adminPassword="password" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Enter your seed phrase/i)).toBeInTheDocument();
    }, { timeout: 10000 });
  }

  it('shows key setup form after all steps complete', async () => {
    await renderAndWaitForKeySetup();

    expect(screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i)).toBeInTheDocument();
    expect(screen.getByText('Save & Continue')).toBeInTheDocument();
    expect(screen.getByText('Skip for now')).toBeInTheDocument();
  });

  it('shows warning when keystore is unavailable', async () => {
    mockKeystore.isAvailable.mockResolvedValueOnce(false);

    render(<SetupPage adminEmail="admin@test.com" adminPassword="password" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/OS keychain is not available/i)).toBeInTheDocument();
    }, { timeout: 10000 });

    expect(screen.getByText('Skip')).toBeInTheDocument();
  });

  it('validates seed phrase on input and shows error for invalid', async () => {
    const user = userEvent.setup();
    await renderAndWaitForKeySetup();

    const textarea = screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i);
    await user.type(textarea, 'invalid five word phrase here extra');

    await waitFor(() => {
      expect(screen.getByText(/Invalid seed phrase/i)).toBeInTheDocument();
    });
  });

  it('shows derived addresses for valid mnemonic', async () => {
    const user = userEvent.setup();
    await renderAndWaitForKeySetup();

    const textarea = screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i);
    await user.clear(textarea);
    await user.type(textarea, VALID_MNEMONIC);

    await waitFor(() => {
      expect(screen.getByText('Derived Addresses')).toBeInTheDocument();
    });

    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('proposer')).toBeInTheDocument();
    expect(screen.getByText('batcher')).toBeInTheDocument();
    expect(screen.getByText('challenger')).toBeInTheDocument();
    expect(screen.getByText('sequencer')).toBeInTheDocument();

    expect(mockKeystore.validate).toHaveBeenCalledWith(VALID_MNEMONIC);
    expect(mockKeystore.previewAddresses).toHaveBeenCalledWith(VALID_MNEMONIC);
  });

  it('save button is disabled until valid mnemonic', async () => {
    await renderAndWaitForKeySetup();

    const saveBtn = screen.getByText('Save & Continue');
    expect(saveBtn).toBeDisabled();
  });

  it('saves seed phrase and calls onComplete', async () => {
    const user = userEvent.setup();
    await renderAndWaitForKeySetup();

    const textarea = screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i);
    await user.clear(textarea);
    await user.type(textarea, VALID_MNEMONIC);

    await waitFor(() => {
      expect(screen.getByText('Derived Addresses')).toBeInTheDocument();
    });

    const saveBtn = screen.getByText('Save & Continue');
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockKeystore.store).toHaveBeenCalledWith(VALID_MNEMONIC);
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('shows error when store fails', async () => {
    mockKeystore.store.mockRejectedValueOnce(new Error('Encryption failed'));

    const user = userEvent.setup();
    await renderAndWaitForKeySetup();

    const textarea = screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i);
    await user.clear(textarea);
    await user.type(textarea, VALID_MNEMONIC);

    await waitFor(() => {
      expect(screen.getByText('Derived Addresses')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save & Continue'));

    await waitFor(() => {
      expect(screen.getByText('Keystore Error')).toBeInTheDocument();
      expect(screen.getByText('Encryption failed')).toBeInTheDocument();
    });
  });

  it('skip button calls onComplete without storing', async () => {
    const user = userEvent.setup();
    await renderAndWaitForKeySetup();

    await user.click(screen.getByText('Skip for now'));

    expect(mockKeystore.store).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });
});
