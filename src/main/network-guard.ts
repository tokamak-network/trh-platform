import type { Session } from 'electron';

export interface BlockedRequest {
  url: string;
  timestamp: number;
  method: string;
  source: 'renderer' | 'webview';
}

const STATIC_ALLOWED: string[] = [
  'localhost',
  '127.0.0.1',
];

const STATIC_PATTERNS: RegExp[] = [
  /\.docker\.io$/,
  /\.docker\.com$/,
  /^github\.com$/,
  /^api\.github\.com$/,
  /\.githubusercontent\.com$/,
];

const dynamicHosts = new Set<string>();
const blockedRequests: BlockedRequest[] = [];
const MAX_BLOCKED_LOG = 100;
let mainWindowWebContentsId: number | null = null;

function isAllowed(hostname: string): boolean {
  if (STATIC_ALLOWED.includes(hostname)) return true;
  if (dynamicHosts.has(hostname)) return true;
  return STATIC_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function setMainWindowId(id: number): void {
  mainWindowWebContentsId = id;
}

export function addAllowedHost(hostname: string): void {
  dynamicHosts.add(hostname);
}

export function getBlockedRequests(): BlockedRequest[] {
  return [...blockedRequests];
}

export function initNetworkGuard(session: Session): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('data:') || details.url.startsWith('file:')) {
      callback({});
      return;
    }

    if (details.url.startsWith('devtools:') || details.url.startsWith('chrome-extension:')) {
      callback({});
      return;
    }

    try {
      const url = new URL(details.url);

      if (isAllowed(url.hostname)) {
        callback({});
        return;
      }

      const blocked: BlockedRequest = {
        url: details.url,
        timestamp: Date.now(),
        method: details.method || 'GET',
        source: (mainWindowWebContentsId !== null && details.webContentsId === mainWindowWebContentsId)
          ? 'renderer' : 'webview',
      };

      blockedRequests.push(blocked);
      if (blockedRequests.length > MAX_BLOCKED_LOG) {
        blockedRequests.shift();
      }

      console.warn(`[NetworkGuard] BLOCKED: ${details.method} ${url.hostname}${url.pathname}`);
      callback({ cancel: true });
    } catch {
      callback({});
    }
  });

  console.log('[NetworkGuard] Initialized with whitelist');
}
