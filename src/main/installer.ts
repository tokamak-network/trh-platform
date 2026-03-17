import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { BrowserWindow } from 'electron';

const DOCKER_MAC_URL_ARM64 = 'https://desktop.docker.com/mac/main/arm64/Docker.dmg';
const DOCKER_MAC_URL_AMD64 = 'https://desktop.docker.com/mac/main/amd64/Docker.dmg';
const DOCKER_WIN_URL = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe';
const DOCKER_LINUX_SCRIPT_URL = 'https://get.docker.com';

export interface InstallResult {
  requiresRelogin: boolean;
}

function execPromise(command: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function sendProgress(mainWindow: BrowserWindow, message: string): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('docker:install-progress', message);
  }
}

function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const makeRequest = (requestUrl: string) => {
      const isHttps = requestUrl.startsWith('https://');
      const requester = isHttps ? https : http;

      const request = requester.get(requestUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect with no location header'));
            return;
          }
          file.close();
          fs.unlink(destPath, () => {});
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: Failed to download`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          onProgress(downloadedBytes, totalBytes);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      request.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });

      // 30-minute timeout for large installer downloads
      request.setTimeout(1800000, () => {
        request.destroy();
        reject(new Error('Download timed out after 30 minutes'));
      });
    };

    makeRequest(url);
  });
}

function makeProgressReporter(mainWindow: BrowserWindow, label: string) {
  return (downloaded: number, total: number) => {
    if (total > 0) {
      const percent = Math.round((downloaded / total) * 100);
      const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
      const totalMB = (total / 1024 / 1024).toFixed(1);
      sendProgress(mainWindow, `${label}... ${percent}% (${downloadedMB}MB / ${totalMB}MB)`);
    } else {
      const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
      sendProgress(mainWindow, `${label}... ${downloadedMB}MB`);
    }
  };
}

// ─── macOS ────────────────────────────────────────────────────────────────────

async function installDockerMac(mainWindow: BrowserWindow): Promise<void> {
  const arch = os.arch();
  const dmgUrl = arch === 'arm64' ? DOCKER_MAC_URL_ARM64 : DOCKER_MAC_URL_AMD64;
  const tmpDir = os.tmpdir();
  const dmgPath = path.join(tmpDir, 'Docker.dmg');

  sendProgress(mainWindow, `Detected architecture: ${arch === 'arm64' ? 'Apple Silicon (arm64)' : 'Intel (x86_64)'}`);
  sendProgress(mainWindow, 'Starting Docker Desktop download...');

  try {
    await downloadFile(dmgUrl, dmgPath, makeProgressReporter(mainWindow, 'Downloading Docker Desktop'));
  } catch (err) {
    throw new Error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Download complete. Mounting disk image...');

  try {
    await execPromise(`hdiutil attach -nobrowse -quiet "${dmgPath}"`, 120000);
  } catch (err) {
    fs.unlink(dmgPath, () => {});
    throw new Error(`Failed to mount Docker DMG: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Installing Docker.app to /Applications...');

  try {
    await execPromise('cp -R /Volumes/Docker/Docker.app /Applications/', 300000);
  } catch (err) {
    try { await execPromise('hdiutil detach /Volumes/Docker', 30000); } catch { /* ignore */ }
    fs.unlink(dmgPath, () => {});
    throw new Error(`Failed to install Docker.app: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Unmounting disk image...');

  try {
    await execPromise('hdiutil detach /Volumes/Docker', 30000);
  } catch (err) {
    sendProgress(mainWindow, `Warning: Could not unmount disk image: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Launching Docker Desktop...');

  try {
    await execPromise('open /Applications/Docker.app', 10000);
  } catch (err) {
    throw new Error(`Failed to launch Docker Desktop: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  fs.unlink(dmgPath, () => {});
  sendProgress(mainWindow, 'Docker Desktop installed and launched successfully!');
}

// ─── Windows ──────────────────────────────────────────────────────────────────

async function installDockerWindows(mainWindow: BrowserWindow): Promise<void> {
  const tmpDir = os.tmpdir();
  const installerPath = path.join(tmpDir, 'DockerDesktopInstaller.exe');

  sendProgress(mainWindow, 'Downloading Docker Desktop installer for Windows...');

  try {
    await downloadFile(DOCKER_WIN_URL, installerPath, makeProgressReporter(mainWindow, 'Downloading Docker Desktop'));
  } catch (err) {
    throw new Error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Running Docker Desktop installer (UAC prompt may appear)...');
  sendProgress(mainWindow, 'This may take several minutes. Please wait...');

  try {
    // The installer handles UAC elevation itself
    await execPromise(`"${installerPath}" install --quiet --accept-license`, 600000);
  } catch (err) {
    fs.unlink(installerPath, () => {});
    throw new Error(`Installation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  fs.unlink(installerPath, () => {});
  sendProgress(mainWindow, 'Docker Desktop installed successfully! Starting Docker...');

  // Launch Docker Desktop
  try {
    await execPromise(
      'start "" "%ProgramFiles%\\Docker\\Docker\\Docker Desktop.exe"',
      15000
    );
  } catch {
    // Non-fatal: user can start Docker Desktop manually
    sendProgress(mainWindow, 'Please start Docker Desktop from the Start Menu.');
  }
}

// ─── Linux ────────────────────────────────────────────────────────────────────

async function installDockerLinux(mainWindow: BrowserWindow): Promise<boolean> {
  const tmpDir = os.tmpdir();
  const scriptPath = path.join(tmpDir, 'get-docker.sh');

  sendProgress(mainWindow, 'Downloading Docker installation script...');

  try {
    await downloadFile(DOCKER_LINUX_SCRIPT_URL, scriptPath, makeProgressReporter(mainWindow, 'Downloading script'));
  } catch (err) {
    throw new Error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Installing Docker Engine (a privilege prompt will appear)...');

  // Use pkexec for GUI privilege elevation (available on most Linux desktops via polkit)
  try {
    await execPromise(`pkexec sh "${scriptPath}"`, 600000);
  } catch (pkexecErr) {
    // Fallback: try sudo via terminal (for systems without polkit)
    fs.unlink(scriptPath, () => {});
    throw new Error(
      `Privilege elevation failed: ${pkexecErr instanceof Error ? pkexecErr.message : 'Unknown error'}. ` +
      'Please install Docker manually: https://docs.docker.com/engine/install/'
    );
  }

  fs.unlink(scriptPath, () => {});

  sendProgress(mainWindow, 'Docker Engine installed. Starting service...');

  try {
    await execPromise('pkexec systemctl enable --now docker', 30000);
  } catch (err) {
    sendProgress(mainWindow, `Warning: Could not enable Docker service: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Add current user to docker group (avoids sudo for future docker commands)
  const username = os.userInfo().username;
  let addedToGroup = false;
  try {
    await execPromise(`pkexec usermod -aG docker ${username}`, 30000);
    addedToGroup = true;
    sendProgress(mainWindow, `Added user '${username}' to docker group.`);
  } catch (err) {
    sendProgress(mainWindow, `Warning: Could not add user to docker group: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Docker Engine installed successfully!');

  // Returns true if user was added to docker group (requires relogin to take effect)
  return addedToGroup;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function installDockerDesktop(mainWindow: BrowserWindow): Promise<InstallResult> {
  const platform = process.platform;

  if (platform === 'darwin') {
    await installDockerMac(mainWindow);
    return { requiresRelogin: false };
  }

  if (platform === 'win32') {
    await installDockerWindows(mainWindow);
    return { requiresRelogin: false };
  }

  if (platform === 'linux') {
    const requiresRelogin = await installDockerLinux(mainWindow);
    return { requiresRelogin };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}
