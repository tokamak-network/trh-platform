import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { BrowserWindow } from 'electron';

const DOCKER_DMG_URL_ARM64 = 'https://desktop.docker.com/mac/main/arm64/Docker.dmg';
const DOCKER_DMG_URL_AMD64 = 'https://desktop.docker.com/mac/main/amd64/Docker.dmg';

function getDockerDmgUrl(): string {
  return os.arch() === 'arm64' ? DOCKER_DMG_URL_ARM64 : DOCKER_DMG_URL_AMD64;
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

    const request = https.get(url, (response) => {
      // Handle HTTP redirects (Docker download URLs may redirect)
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
        reject(new Error(`HTTP ${response.statusCode}: Failed to download Docker DMG`));
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

    // 30-minute timeout for large DMG download (~600MB)
    request.setTimeout(1800000, () => {
      request.destroy();
      reject(new Error('Download timed out after 30 minutes'));
    });
  });
}

export async function installDockerDesktop(mainWindow: BrowserWindow): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic Docker installation is only supported on macOS');
  }

  const arch = os.arch();
  const dmgUrl = getDockerDmgUrl();
  const tmpDir = os.tmpdir();
  const dmgPath = path.join(tmpDir, 'Docker.dmg');

  sendProgress(mainWindow, `Detected architecture: ${arch === 'arm64' ? 'Apple Silicon (arm64)' : 'Intel (x86_64)'}`);
  sendProgress(mainWindow, 'Starting Docker Desktop download...');

  // Step 1: Download the DMG
  try {
    await downloadFile(dmgUrl, dmgPath, (downloaded, total) => {
      if (total > 0) {
        const percent = Math.round((downloaded / total) * 100);
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
        const totalMB = (total / 1024 / 1024).toFixed(1);
        sendProgress(mainWindow, `Downloading Docker Desktop... ${percent}% (${downloadedMB}MB / ${totalMB}MB)`);
      } else {
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
        sendProgress(mainWindow, `Downloading Docker Desktop... ${downloadedMB}MB`);
      }
    });
  } catch (err) {
    throw new Error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Download complete. Mounting disk image...');

  // Step 2: Mount the DMG
  try {
    await execPromise(`hdiutil attach -nobrowse -quiet "${dmgPath}"`, 120000);
  } catch (err) {
    fs.unlink(dmgPath, () => {});
    throw new Error(`Failed to mount Docker DMG: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Installing Docker.app to /Applications...');

  // Step 3: Copy Docker.app to /Applications
  try {
    await execPromise('cp -R /Volumes/Docker/Docker.app /Applications/', 300000);
  } catch (err) {
    // Attempt to unmount before throwing
    try { await execPromise('hdiutil detach /Volumes/Docker', 30000); } catch { /* ignore */ }
    fs.unlink(dmgPath, () => {});
    throw new Error(`Failed to install Docker.app: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Unmounting disk image...');

  // Step 4: Unmount the DMG
  try {
    await execPromise('hdiutil detach /Volumes/Docker', 30000);
  } catch (err) {
    // Non-fatal: log but continue
    sendProgress(mainWindow, `Warning: Could not unmount disk image: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  sendProgress(mainWindow, 'Launching Docker Desktop...');

  // Step 5: Open Docker Desktop
  try {
    await execPromise('open /Applications/Docker.app', 10000);
  } catch (err) {
    throw new Error(`Failed to launch Docker Desktop: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Step 6: Clean up temp file
  fs.unlink(dmgPath, (err) => {
    if (err) {
      sendProgress(mainWindow, `Note: Could not remove temp file at ${dmgPath}`);
    }
  });

  sendProgress(mainWindow, 'Docker Desktop installed and launched successfully!');
}
