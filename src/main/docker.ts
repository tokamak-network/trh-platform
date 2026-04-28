import { spawn, exec, ChildProcess } from 'child_process';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { app } from 'electron';

const COMMAND_TIMEOUT = 30000;
const HEALTH_CHECK_TIMEOUT = 120000;
const HEALTH_CHECK_INTERVAL = 3000;
const PULL_TIMEOUT = 600000;
const COMPOSE_TIMEOUT = 120000;

const REQUIRED_PORTS = [3000, 5433, 8000];
const TRH_CONTAINER_NAMES = ['trh-postgres', 'trh-backend', 'trh-platform-ui'];
const activeProcesses = new Set<ChildProcess>();

let logCallback: ((line: string) => void) | null = null;

export function setLogCallback(cb: ((line: string) => void) | null): void {
  logCallback = cb;
}

function emitLog(line: string): void {
  if (logCallback && line.trim()) {
    logCallback(line.trim());
  }
}

const DOCKER_PATHS = [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  '/usr/bin/docker',
  '/Applications/Docker.app/Contents/Resources/bin/docker'
];

const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`;

function findDocker(): string {
  for (const p of DOCKER_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return 'docker';
}

const DOCKER_BIN = findDocker();

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  containersUp: boolean;
  healthy: boolean;
  error?: string;
}

export interface PullProgress {
  service: string;
  status: string;
  progress?: string;
}

export interface ContainerConfig {
  adminEmail?: string;
  adminPassword?: string;
}

export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  runtimeDir: boolean;
  allInstalled: boolean;
}

export interface ImageVersion {
  service: string;
  image: string;
  shortId: string;
}

function getComposePath(): string {
  const composePath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'docker-compose.yml')
    : path.join(__dirname, '..', '..', 'resources', 'docker-compose.yml');

  if (!fs.existsSync(composePath)) {
    throw new Error(`Docker Compose file not found: ${composePath}`);
  }
  return composePath;
}

function execPromise(command: string, timeout = COMMAND_TIMEOUT): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout, env: { ...process.env, PATH: EXTENDED_PATH } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  // Use lsof first (most reliable on macOS — catches all interfaces)
  try {
    const result = await execPromise(`lsof -iTCP:${port} -sTCP:LISTEN -t`, 5000);
    if (result.trim()) return false; // something is listening
  } catch {
    // lsof returns non-zero when nothing found = port is free
  }

  // Fallback: try binding on all interfaces
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

export async function checkRequiredPorts(): Promise<{ available: boolean; blockedPorts: number[] }> {
  const blockedPorts: number[] = [];
  for (const port of REQUIRED_PORTS) {
    if (!(await isPortAvailable(port))) {
      blockedPorts.push(port);
    }
  }
  return { available: blockedPorts.length === 0, blockedPorts };
}

export interface PortConflict {
  port: number;
  pid: number;
  processName: string;
  ownedByTrh: boolean;
}

export async function getPortConflicts(): Promise<{ available: boolean; conflicts: PortConflict[] }> {
  const portCheck = await checkRequiredPorts();
  if (portCheck.available) {
    return { available: true, conflicts: [] };
  }

  const conflicts: PortConflict[] = [];
  for (const port of portCheck.blockedPorts) {
    try {
      const pidOutput = await execPromise(`lsof -i :${port} -t -sTCP:LISTEN`);
      const pids = pidOutput.split('\n').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);
      for (const pid of pids) {
        try {
          const name = (await execPromise(`ps -p ${pid} -o comm=`)).trim();
          let ownedByTrh = false;
          if (name.includes('docker') || name.includes('com.docker')) {
            try {
              const containerName = (await execPromise(
                `"${DOCKER_BIN}" ps --filter "publish=${port}" --format "{{.Names}}"`,
                5000
              )).trim();
              ownedByTrh = TRH_CONTAINER_NAMES.some(n => containerName.includes(n));
            } catch {
              // docker ps failed — treat as unknown docker container
            }
          }
          conflicts.push({ port, pid, processName: name, ownedByTrh });
        } catch {
          conflicts.push({ port, pid, processName: 'unknown', ownedByTrh: false });
        }
      }
    } catch {
      // lsof failed — port is blocked but can't identify the process
      emitLog(`Could not identify process on port ${port}`);
    }
  }

  return { available: false, conflicts };
}

export async function killPortProcesses(ports: number[]): Promise<void> {
  let externalDockerFound = false;

  for (const port of ports) {
    try {
      const pidOutput = await execPromise(`lsof -i :${port} -t -sTCP:LISTEN`);
      const pids = pidOutput.split('\n').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);
      for (const pid of pids) {
        try {
          const name = (await execPromise(`ps -p ${pid} -o comm=`)).trim();
          if (name.includes('docker') || name.includes('com.docker')) {
            // Check if this port is owned by one of our own trh containers
            let isTrhOwned = false;
            try {
              const containerName = (await execPromise(
                `"${DOCKER_BIN}" ps --filter "publish=${port}" --format "{{.Names}}"`,
                5000
              )).trim();
              isTrhOwned = TRH_CONTAINER_NAMES.some(n => containerName.includes(n));
            } catch {
              // docker ps failed — treat as external
            }

            if (isTrhOwned) {
              emitLog(`Port ${port} is held by our own trh container — skipping (will be handled by compose up)`);
            } else {
              externalDockerFound = true;
              emitLog(`Port ${port} is held by external Docker container (${name}) — will stop it`);
            }
          } else {
            process.kill(pid, 'SIGTERM');
            emitLog(`Killed process ${pid} on port ${port}`);
          }
        } catch (err) {
          emitLog(`Could not kill process ${pid} on port ${port}: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    } catch {
      // No process found on port, already free
    }
  }

  if (externalDockerFound) {
    emitLog('Stopping external Docker containers occupying required ports...');
    for (const port of ports) {
      try {
        const containerName = (await execPromise(
          `"${DOCKER_BIN}" ps --filter "publish=${port}" --format "{{.Names}}"`,
          5000
        )).trim();
        // Only stop containers that are NOT our own trh containers
        if (containerName && !TRH_CONTAINER_NAMES.some(n => containerName.includes(n))) {
          const containerId = (await execPromise(
            `"${DOCKER_BIN}" ps --filter "publish=${port}" --format "{{.ID}}"`,
            5000
          )).trim();
          if (containerId) {
            await execPromise(`"${DOCKER_BIN}" stop ${containerId}`);
            await execPromise(`"${DOCKER_BIN}" rm -f ${containerId}`);
            emitLog(`Stopped external container ${containerId} on port ${port}`);
          }
        }
      } catch {
        emitLog(`Could not stop Docker container on port ${port}`);
      }
    }
  }

  // Wait for processes to terminate
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Verify ports are freed (skip trh-owned ports — they stay running intentionally)
  for (const port of ports) {
    if (!(await isPortAvailable(port))) {
      // Check if still held by our own trh container — that's OK
      try {
        const containerName = (await execPromise(
          `"${DOCKER_BIN}" ps --filter "publish=${port}" --format "{{.Names}}"`,
          5000
        )).trim();
        if (TRH_CONTAINER_NAMES.some(n => containerName.includes(n))) {
          continue; // trh container holding the port — expected, skip error
        }
      } catch {
        // ignore
      }
      throw new Error(`Port ${port} is still in use after killing processes. You may need to free it manually.`);
    }
  }
}

export function cleanupProcesses(): void {
  activeProcesses.forEach(proc => {
    if (!proc.killed) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    }
  });
  activeProcesses.clear();
}

function validateCredentials(config?: ContainerConfig): { email?: string; password?: string } {
  const result: { email?: string; password?: string } = {};

  if (config?.adminEmail) {
    const email = String(config.adminEmail).trim();
    if (email.length > 254) throw new Error('Email address too long');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email format');
    result.email = email;
  }

  if (config?.adminPassword) {
    const password = String(config.adminPassword);
    if (password.length > 128) throw new Error('Password too long');
    if (password.length < 5) throw new Error('Password must be at least 5 characters');
    result.password = password;
  }

  return result;
}

export async function startDockerDaemon(): Promise<boolean> {
  emitLog('Attempting to start Docker Desktop...');
  try {
    if (process.platform === 'darwin') {
      await execPromise('open -a Docker', 5000);
    } else if (process.platform === 'win32') {
      await execPromise('start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', 5000);
    } else {
      await execPromise('systemctl start docker', 5000);
    }
  } catch {
    emitLog('Could not launch Docker automatically');
    return false;
  }

  // Wait up to 60s for daemon to respond
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    emitLog(`Waiting for Docker daemon... (${i + 1})`);
    if (await isDockerRunning()) {
      emitLog('Docker daemon is now running');
      return true;
    }
  }

  emitLog('Docker daemon did not start in time');
  return false;
}

export async function pruneDockerDisk(): Promise<void> {
  emitLog('Freeing disk space with docker system prune...');
  try {
    await execPromise(`"${DOCKER_BIN}" system prune -f --volumes`, 60000);
    emitLog('Docker prune complete');
  } catch (err) {
    emitLog('Prune failed: ' + (err instanceof Error ? err.message : 'unknown'));
  }
}

export async function isDockerInstalled(): Promise<boolean> {
  try {
    await execPromise(`"${DOCKER_BIN}" --version`);
    return true;
  } catch {
    return false;
  }
}

export async function isDockerRunning(): Promise<boolean> {
  try {
    await execPromise(`"${DOCKER_BIN}" info`);
    return true;
  } catch {
    return false;
  }
}

export async function getDockerStatus(): Promise<DockerStatus> {
  const installed = await isDockerInstalled();
  if (!installed) {
    return { installed: false, running: false, containersUp: false, healthy: false };
  }

  const running = await isDockerRunning();
  if (!running) {
    return { installed: true, running: false, containersUp: false, healthy: false };
  }

  try {
    const composePath = getComposePath();
    const psOutput = await execPromise(
      `"${DOCKER_BIN}" compose -f "${composePath}" ps --format json`
    );

    if (!psOutput) {
      return { installed: true, running: true, containersUp: false, healthy: false };
    }

    const containers = psOutput
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);

    const expectedCount = getExpectedServiceCount(composePath);
    const allUp = containers.length >= expectedCount && containers.every((c: any) => c.State === 'running');
    const allHealthy = containers.every((c: any) => !c.Health || c.Health === 'healthy');

    return { installed: true, running: true, containersUp: allUp, healthy: allUp && allHealthy };
  } catch (error) {
    return {
      installed: true,
      running: true,
      containersUp: false,
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Check if all three trh containers are running and healthy by container name,
// independent of the compose project label. Handles the case where containers
// were started via `make up` outside the Electron app.
export async function isTrhStackRunning(): Promise<boolean> {
  try {
    const output = await execPromise(
      `"${DOCKER_BIN}" ps --filter "name=trh-postgres" --filter "name=trh-backend" --filter "name=trh-platform-ui" --format "{{.Names}}\\t{{.State}}\\t{{.Status}}"`,
      10000
    );
    if (!output) return false;

    const lines = output.split('\n').filter(Boolean);
    const found: Record<string, { running: boolean; healthy: boolean }> = {};

    for (const line of lines) {
      const [name, state, status] = line.split('\t');
      if (!name || !state) continue;
      const matchedName = TRH_CONTAINER_NAMES.find(n => name.trim() === n);
      if (!matchedName) continue;
      const running = state.trim() === 'running';
      // healthy = no healthcheck defined OR healthcheck passed
      const healthy = !status.includes('(') || status.includes('(healthy)');
      found[matchedName] = { running, healthy };
    }

    return TRH_CONTAINER_NAMES.every(n => found[n]?.running && found[n]?.healthy);
  } catch {
    return false;
  }
}

function getServiceImages(composePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = fs.readFileSync(composePath, 'utf-8');
    let currentService = '';
    let inServices = false;

    for (const line of content.split('\n')) {
      if (line.match(/^services:\s*$/)) { inServices = true; continue; }
      if (inServices && line.match(/^\S/) && !line.startsWith('#')) { inServices = false; continue; }
      if (!inServices) continue;

      const svcMatch = line.match(/^  (\w[\w-]*):\s*$/);
      if (svcMatch) { currentService = svcMatch[1]; continue; }

      const imgMatch = line.match(/^\s+image:\s*(.+)/);
      if (imgMatch && currentService) {
        result[currentService] = imgMatch[1].trim();
        currentService = '';
      }
    }
  } catch { /* ignore */ }
  return result;
}

function getExpectedServiceCount(composePath: string): number {
  try {
    const content = fs.readFileSync(composePath, 'utf-8');
    let count = 0;
    let inServices = false;

    for (const line of content.split('\n')) {
      if (line.match(/^services:\s*$/)) { inServices = true; continue; }
      if (inServices && line.match(/^\S/) && !line.startsWith('#')) { inServices = false; continue; }
      if (!inServices) continue;
      if (line.match(/^  [\w][\w-]*:\s*$/)) { count++; }
    }
    return count > 0 ? count : 3;
  } catch {
    return 3;
  }
}

function imageExistsLocally(image: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`"${DOCKER_BIN}" image inspect "${image}" --format ok`, {
      timeout: 10000,
      env: { ...process.env, PATH: EXTENDED_PATH },
    }, (err) => resolve(!err));
  });
}

export async function pullImages(onProgress: (progress: PullProgress) => void): Promise<void> {
  if (process.env.SKIP_PULL === 'true') {
    emitLog('SKIP_PULL=true: skipping image pull, using local images');
    onProgress({ service: '', status: 'Skipped (SKIP_PULL=true)' });
    return;
  }

  const composePath = getComposePath();

  return new Promise((resolve, reject) => {
    const pull = spawn(DOCKER_BIN, ['compose', '-f', composePath, 'pull', '--ignore-buildable'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: EXTENDED_PATH }
    });

    activeProcesses.add(pull);

    const timeout = setTimeout(() => {
      pull.kill('SIGTERM');
      reject(new Error('Image pull timed out after 10 minutes. Check your internet connection.'));
    }, PULL_TIMEOUT);

    const parseOutput = (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        emitLog(line);
        const match = line.match(/^(\w+[-\w]*)\s+(.+)$/);
        if (match) {
          onProgress({ service: match[1], status: match[2] });
        } else {
          onProgress({ service: 'docker', status: line.trim() });
        }
      }
    };

    pull.stdout.on('data', parseOutput);
    pull.stderr.on('data', parseOutput);

    pull.on('close', async code => {
      clearTimeout(timeout);
      activeProcesses.delete(pull);
      if (code === 0) {
        resolve();
        return;
      }

      // Pull failed — check if all images exist locally anyway
      const serviceImages = getServiceImages(composePath);
      const images = Object.values(serviceImages);
      const checks = await Promise.all(images.map(img => imageExistsLocally(img)));
      const missing = images.filter((_, i) => !checks[i]);

      if (missing.length === 0) {
        emitLog('Pull had errors, but all images are available locally.');
        resolve();
      } else {
        reject(new Error(`Missing images: ${missing.join(', ')}. Pull failed with code ${code}.`));
      }
    });

    pull.on('error', (err) => {
      clearTimeout(timeout);
      activeProcesses.delete(pull);
      reject(err);
    });
  });
}

const UPDATE_IMAGES = [
  'tokamaknetwork/trh-backend:latest',
  'tokamaknetwork/trh-platform-ui:latest',
];

// Fetch the remote manifest digest from Docker Hub without downloading any layers.
// Returns the Docker-Content-Digest header value (e.g. "sha256:abc...").
async function getRemoteDigest(image: string): Promise<string> {
  return new Promise((resolve) => {
    const colonIdx = image.lastIndexOf(':');
    const tag = colonIdx !== -1 ? image.slice(colonIdx + 1) : 'latest';
    const name = colonIdx !== -1 ? image.slice(0, colonIdx) : image;
    const slashIdx = name.indexOf('/');
    const namespace = slashIdx !== -1 ? name.slice(0, slashIdx) : 'library';
    const repo = slashIdx !== -1 ? name.slice(slashIdx + 1) : name;

    https.get(
      `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${namespace}/${repo}:pull`,
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const { token } = JSON.parse(data) as { token: string };
            const options: https.RequestOptions = {
              hostname: 'registry-1.docker.io',
              path: `/v2/${namespace}/${repo}/manifests/${tag}`,
              method: 'HEAD',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: [
                  'application/vnd.docker.distribution.manifest.list.v2+json',
                  'application/vnd.docker.distribution.manifest.v2+json',
                ].join(','),
              },
            };
            const req = https.request(options, (res2) => {
              resolve((res2.headers['docker-content-digest'] as string) || '');
            });
            req.on('error', () => resolve(''));
            req.end();
          } catch {
            resolve('');
          }
        });
      }
    ).on('error', () => resolve(''));
  });
}

// Get the local image's RepoDigest (manifest digest stored after pull).
async function getLocalDigest(image: string): Promise<string> {
  try {
    const output = await execPromise(
      `"${DOCKER_BIN}" image inspect "${image}" --format "{{index .RepoDigests 0}}"`,
      10000
    );
    const match = output.match(/@(sha256:[a-f0-9]+)/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

// Check for updates by comparing remote manifest digests against local RepoDigests.
// Does NOT download any image layers — pure registry metadata query.
export async function checkForUpdates(): Promise<boolean> {
  emitLog('Checking for image updates...');
  for (const image of UPDATE_IMAGES) {
    try {
      const [remote, local] = await Promise.all([getRemoteDigest(image), getLocalDigest(image)]);
      if (remote && local && remote !== local) {
        emitLog(`Update available for ${image}`);
        return true;
      }
    } catch {
      // Network or Docker unavailable — skip silently
    }
  }
  emitLog('All images up to date');
  return false;
}

export async function restartWithUpdates(config?: ContainerConfig): Promise<void> {
  const composePath = getComposePath();
  emitLog('Pulling latest images...');

  await new Promise<void>((resolve, reject) => {
    const pull = spawn(DOCKER_BIN, ['compose', '-f', composePath, 'pull', '-q', '--ignore-buildable'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: EXTENDED_PATH },
    });
    activeProcesses.add(pull);
    const timeout = setTimeout(() => {
      pull.kill('SIGTERM');
      reject(new Error('Image pull timed out'));
    }, PULL_TIMEOUT);
    pull.stderr.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach((l: string) => emitLog(l));
    });
    pull.on('close', (code) => {
      clearTimeout(timeout);
      activeProcesses.delete(pull);
      if (code === 0) resolve();
      else reject(new Error(`Pull failed with code ${code}`));
    });
    pull.on('error', (err) => {
      clearTimeout(timeout);
      activeProcesses.delete(pull);
      reject(err);
    });
  });

  emitLog('Restarting containers with updated images...');
  await stopContainers();
  await startContainers(config);
  emitLog('Containers restarted with latest images');
}

export async function startContainers(config?: ContainerConfig): Promise<void> {
  const composePath = getComposePath();

  const credentials = validateCredentials(config);

  const env: NodeJS.ProcessEnv = { ...process.env, PATH: EXTENDED_PATH };
  if (credentials.email) env.ADMIN_EMAIL = credentials.email;
  if (credentials.password) env.ADMIN_PASSWORD = credentials.password;

  return new Promise((resolve, reject) => {
    const up = spawn(DOCKER_BIN, ['compose', '-f', composePath, 'up', '-d'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    });

    activeProcesses.add(up);

    const timeout = setTimeout(() => {
      up.kill('SIGTERM');
      reject(new Error('Container startup timed out. Docker may be unresponsive.'));
    }, COMPOSE_TIMEOUT);

    let allOutput = '';
    up.stdout.on('data', (data) => {
      const text = data.toString();
      allOutput += text;
      text.split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });
    up.stderr.on('data', (data) => {
      const text = data.toString();
      allOutput += text;
      text.split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });

    up.on('close', code => {
      clearTimeout(timeout);
      activeProcesses.delete(up);
      if (code === 0) {
        resolve();
      } else {
        const lower = allOutput.toLowerCase();
        let errorMsg = `Docker compose up failed with code ${code}.`;
        let errorType = 'unknown';

        if (lower.includes('port is already allocated') || lower.includes('address already in use') || lower.includes('bind: address already in use') || lower.includes('failed to bind') || lower.includes('port') && lower.includes('already in use')) {
          errorMsg = 'Port conflict detected. Another process is using required ports.';
          errorType = 'port';
        } else if (lower.includes('no such image')) {
          errorMsg = 'Required Docker images not found. Please pull images first.';
          errorType = 'image';
        } else if (lower.includes('cannot connect') || lower.includes('is the docker daemon running')) {
          errorMsg = 'Cannot connect to Docker daemon. Is Docker Desktop running?';
          errorType = 'daemon';
        } else if (lower.includes('is already in use by container') || lower.includes('name is already in use')) {
          errorMsg = 'Stale containers found. Cleaning up will fix this.';
          errorType = 'stale';
        } else if (lower.includes('network') && lower.includes('already exists')) {
          errorMsg = 'Docker network conflict. Cleaning up will fix this.';
          errorType = 'stale';
        } else if (lower.includes('volume') && (lower.includes('in use') || lower.includes('already exists'))) {
          errorMsg = 'Docker volume conflict. Cleaning up will fix this.';
          errorType = 'stale';
        } else if (lower.includes('no space left on device') || lower.includes('disk space')) {
          errorMsg = 'Not enough disk space. Free up space and retry.';
          errorType = 'disk';
        } else if (lower.includes('permission denied')) {
          errorMsg = 'Permission denied. Check Docker permissions.';
          errorType = 'permission';
        }

        const err = new Error(errorMsg);
        (err as any).errorType = errorType;
        (err as any).output = allOutput;
        reject(err);
      }
    });

    up.on('error', (err) => {
      clearTimeout(timeout);
      activeProcesses.delete(up);
      reject(err);
    });
  });
}

export async function stopContainers(): Promise<void> {
  const composePath = getComposePath();

  return new Promise((resolve, reject) => {
    const down = spawn(DOCKER_BIN, ['compose', '-f', composePath, 'down'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: EXTENDED_PATH }
    });

    activeProcesses.add(down);

    const timeout = setTimeout(() => {
      down.kill('SIGTERM');
      reject(new Error('Container shutdown timed out. Try force-stopping Docker containers manually.'));
    }, COMPOSE_TIMEOUT);

    down.stdout.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });
    down.stderr.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });

    down.on('close', code => {
      clearTimeout(timeout);
      activeProcesses.delete(down);
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Docker compose down failed with code ${code}`));
      }
    });

    down.on('error', (err) => {
      clearTimeout(timeout);
      activeProcesses.delete(down);
      reject(err);
    });
  });
}

export async function cleanupStaleContainers(): Promise<void> {
  const composePath = getComposePath();

  emitLog('Cleaning up stale containers, networks, and volumes...');

  // docker compose down --remove-orphans --volumes to nuke everything
  await new Promise<void>((resolve, reject) => {
    const down = spawn(DOCKER_BIN, ['compose', '-f', composePath, 'down', '--remove-orphans', '--volumes'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: EXTENDED_PATH }
    });

    activeProcesses.add(down);
    const timeout = setTimeout(() => { down.kill('SIGTERM'); resolve(); }, 30000);

    down.stdout.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });
    down.stderr.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });

    down.on('close', () => { clearTimeout(timeout); activeProcesses.delete(down); resolve(); });
    down.on('error', () => { clearTimeout(timeout); activeProcesses.delete(down); resolve(); });
  });

  // Also force-remove the specific containers if they're stuck
  const containers = ['trh-postgres', 'trh-backend', 'trh-platform-ui'];
  for (const name of containers) {
    try {
      await execPromise(`"${DOCKER_BIN}" rm -f ${name}`, 10000);
      emitLog(`Removed stale container: ${name}`);
    } catch {
      // Container doesn't exist, that's fine
    }
  }

  emitLog('Cleanup complete');
}

export async function waitForHealthy(
  timeoutMs = HEALTH_CHECK_TIMEOUT,
  onStatus?: (status: string) => void
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await getDockerStatus();

    if (status.healthy) {
      onStatus?.('All services healthy');
      return true;
    }

    if (status.containersUp) {
      onStatus?.('Waiting for services to become healthy...');
    } else if (status.running) {
      onStatus?.('Starting containers...');
    } else {
      onStatus?.('Waiting for Docker...');
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  return false;
}

export function getDockerInstallUrl(): string {
  switch (process.platform) {
    case 'darwin': return 'https://docs.docker.com/desktop/install/mac-install/';
    case 'win32': return 'https://docs.docker.com/desktop/install/windows-install/';
    default: return 'https://docs.docker.com/desktop/install/linux-install/';
  }
}

export async function checkBackendDependencies(): Promise<BackendDependencies> {
  const checkCommand = async (cmd: string): Promise<boolean> => {
    try {
      await execPromise(`"${DOCKER_BIN}" exec trh-backend which ${cmd}`);
      return true;
    } catch {
      return false;
    }
  };

  const ensureRuntimeDir = async (): Promise<boolean> => {
    try {
      await execPromise(
        `"${DOCKER_BIN}" exec trh-backend sh -lc "mkdir -p /root/.trh/bin && test -d /root/.trh/bin"`
      );
      return true;
    } catch (error) {
      emitLog(`Failed to prepare backend runtime dir: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  };

  const [pnpm, node, forge] = await Promise.all([
    checkCommand('pnpm'),
    checkCommand('node'),
    checkCommand('forge'),
  ]);
  const runtimeDir = await ensureRuntimeDir();

  return { pnpm, node, forge, runtimeDir, allInstalled: pnpm && node && forge && runtimeDir };
}

export async function installBackendDependencies(onProgress?: (status: string) => void): Promise<void> {
  onProgress?.('Downloading dependency installer...');

  try {
    await execPromise(
      `"${DOCKER_BIN}" exec trh-backend bash -c "wget -q https://raw.githubusercontent.com/tokamak-network/trh-backend/refs/heads/main/docker_install_dependencies_script.sh -O /tmp/install_deps.sh && chmod +x /tmp/install_deps.sh"`
    );
  } catch {
    throw new Error('Failed to download dependency installer');
  }

  onProgress?.('Installing dependencies...');

  return new Promise((resolve, reject) => {
    const install = spawn(DOCKER_BIN, [
      'exec', 'trh-backend', 'bash', '-c',
      'DEBIAN_FRONTEND=noninteractive TZ=UTC /tmp/install_deps.sh'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: EXTENDED_PATH }
    });

    install.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        emitLog(line);
        if (line.includes('Installing') || line.includes('Setting up') || line.includes('STEP')) {
          onProgress?.(line.trim().substring(0, 50));
        }
      }
    });

    install.stderr.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });

    install.on('close', async (code) => {
      if (code === 0 || code === null) {
        onProgress?.('Finalizing setup...');
        try {
          await execPromise(
            `"${DOCKER_BIN}" exec trh-backend bash -c "mkdir -p /root/.trh/bin; ln -sf /root/.local/share/pnpm/pnpm /usr/local/bin/pnpm 2>/dev/null || true; ln -sf /root/.nvm/versions/node/*/bin/node /usr/local/bin/node 2>/dev/null || true; ln -sf /root/.nvm/versions/node/*/bin/npm /usr/local/bin/npm 2>/dev/null || true; ln -sf /root/.nvm/versions/node/*/bin/npx /usr/local/bin/npx 2>/dev/null || true; ln -sf /root/.foundry/bin/forge /usr/local/bin/forge 2>/dev/null || true; ln -sf /root/.foundry/bin/cast /usr/local/bin/cast 2>/dev/null || true; ln -sf /root/.foundry/bin/anvil /usr/local/bin/anvil 2>/dev/null || true"`
          );
        } catch { /* ignore symlink errors */ }
        resolve();
      } else {
        reject(new Error(`Dependency installation failed with code ${code}`));
      }
    });

    install.on('error', reject);
  });
}

export async function getImageVersions(): Promise<ImageVersion[]> {
  const targets = [
    { name: 'trh-backend', service: 'backend' },
    { name: 'trh-platform-ui', service: 'platform-ui' },
  ];

  const results: ImageVersion[] = [];
  for (const { name, service } of targets) {
    try {
      const [rawId, image] = await Promise.all([
        execPromise(`"${DOCKER_BIN}" inspect ${name} --format "{{.Image}}"`, 5000),
        execPromise(`"${DOCKER_BIN}" inspect ${name} --format "{{.Config.Image}}"`, 5000),
      ]);
      const shortId = rawId.replace('sha256:', '').substring(0, 12);
      results.push({ service, image: image.trim(), shortId });
    } catch {
      results.push({ service, image: 'unknown', shortId: 'unknown' });
    }
  }
  return results;
}

export async function cleanPlatform(): Promise<void> {
  const composePath = getComposePath();

  emitLog('Removing all platform containers, volumes, and networks...');

  await new Promise<void>((resolve) => {
    const down = spawn(DOCKER_BIN, [
      'compose', '-f', composePath, 'down',
      '--volumes', '--remove-orphans'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: EXTENDED_PATH }
    });

    activeProcesses.add(down);
    const timeout = setTimeout(() => {
      down.kill('SIGTERM');
      resolve();
    }, 60000);

    down.stdout.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });
    down.stderr.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach((line: string) => emitLog(line));
    });

    down.on('close', () => {
      clearTimeout(timeout);
      activeProcesses.delete(down);
      resolve();
    });
    down.on('error', () => {
      clearTimeout(timeout);
      activeProcesses.delete(down);
      resolve();
    });
  });

  emitLog('Platform cleanup complete');
}
