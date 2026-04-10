/**
 * Stack URL Resolver — Authenticates to backend API and resolves service URLs
 * for a given chainName. Falls back to local Docker defaults for missing URLs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StackUrls {
  stackId: string;
  l2Rpc: string;
  l2ChainId: number;
  bridgeUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  grafanaUrl: string;
  prometheusUrl: string;
  uptimeUrl: string;
  drbUrl: string;
  bundlerUrl: string;
  crossTradeUrl: string;
}

// ---------------------------------------------------------------------------
// Defaults (local Docker stack)
// ---------------------------------------------------------------------------

const LOCAL_DEFAULTS: Omit<StackUrls, 'stackId' | 'l2ChainId'> = {
  l2Rpc: 'http://localhost:8545',
  bridgeUrl: 'http://localhost:3001',
  explorerUrl: 'http://localhost:4001',
  explorerApiUrl: 'http://localhost:4000/api/v2',
  grafanaUrl: 'http://localhost:3002',
  prometheusUrl: 'http://localhost:9090',
  uptimeUrl: 'http://localhost:3003',
  drbUrl: 'http://localhost:9600',
  bundlerUrl: 'http://localhost:4337',
  crossTradeUrl: 'http://localhost:3004',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackendUrl(): string {
  return process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Login to the backend API and return a JWT token.
 *
 * @param backendUrl - Override backend base URL (default: LIVE_BACKEND_URL or localhost:8000)
 */
export async function loginBackend(backendUrl?: string): Promise<string> {
  const base = backendUrl ?? getBackendUrl();
  const resp = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin' }),
  });

  if (!resp.ok) {
    throw new Error(`Backend login failed: ${resp.status} ${resp.statusText}`);
  }

  const body = await resp.json() as Record<string, unknown>;
  const token =
    (body.token as string | undefined) ??
    ((body.data as Record<string, unknown> | undefined)?.token as string | undefined) ??
    '';

  if (!token) {
    throw new Error(`Backend login returned no token: ${JSON.stringify(body)}`);
  }

  return token;
}

/**
 * Read L1 contract addresses from the deployment JSON inside the backend container.
 * Falls back to stack config if docker exec is not available.
 */
export async function resolveContractAddresses(stackId: string, token?: string): Promise<{
  l1StandardBridgeProxy: string;
  systemConfigProxy: string;
  optimismPortalProxy: string;
  disputeGameFactoryProxy: string;
  l1UsdcBridgeProxy: string;
}> {
  const backendUrl = getBackendUrl();
  const jwt = token ?? await loginBackend(backendUrl);

  // Get deployment path from stack config
  const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos/${stackId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) throw new Error(`Failed to fetch stack: ${resp.status}`);

  const body = await resp.json() as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const stack = (data.stack ?? data) as Record<string, unknown>;
  const config = (stack.config ?? {}) as Record<string, unknown>;
  const deploymentPath = config.deploymentPath as string;

  if (!deploymentPath) {
    throw new Error('No deploymentPath in stack config');
  }

  // Read deployment JSON via docker exec on backend container
  const { execSync } = await import('child_process');
  const deployJsonPath = `${deploymentPath}/tokamak-thanos/packages/tokamak/contracts-bedrock/deployments/11155111-deploy.json`;

  try {
    const raw = execSync(
      `docker exec trh-platform-backend-1 cat "${deployJsonPath}"`,
      { encoding: 'utf-8', timeout: 10_000 }
    );
    const deployJson = JSON.parse(raw) as Record<string, string>;
    return {
      l1StandardBridgeProxy: deployJson.L1StandardBridgeProxy ?? '',
      systemConfigProxy: deployJson.SystemConfigProxy ?? '',
      optimismPortalProxy: deployJson.OptimismPortalProxy ?? '',
      disputeGameFactoryProxy: deployJson.DisputeGameFactoryProxy ?? '',
      l1UsdcBridgeProxy: deployJson.L1UsdcBridgeProxy ?? '',
    };
  } catch (err) {
    throw new Error(
      `Failed to read deployment JSON from backend container: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Resolve all service URLs for a stack identified by `chainName`.
 *
 * Authenticates to the backend API (or uses a provided token), fetches the
 * stacks list, finds the matching stack, and extracts URLs from metadata.
 * Missing URLs fall back to local Docker defaults.
 *
 * @param chainName - The chain name to look for (e.g. 'usdc-gaming')
 * @param token     - Optional pre-existing JWT token (will login if omitted)
 */
export async function resolveStackUrls(
  chainName: string,
  token?: string
): Promise<StackUrls> {
  const backendUrl = getBackendUrl();
  const jwt = token ?? await loginBackend(backendUrl);

  const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch stacks: ${resp.status} ${resp.statusText}`);
  }

  const body = await resp.json() as Record<string, unknown>;
  const data = body.data as Record<string, unknown> | undefined;
  const stacks = (data?.stacks as Record<string, unknown>[]) ?? [];

  const stack = stacks.find(
    (s) => (s.config as Record<string, unknown> | undefined)?.chainName === chainName
  );

  if (!stack) {
    const available = stacks
      .map((s) => (s.config as Record<string, unknown> | undefined)?.chainName)
      .filter(Boolean);
    throw new Error(
      `Stack not found for chainName="${chainName}". ` +
      `Available stacks: [${available.join(', ')}]`
    );
  }

  const meta = (stack.metadata ?? {}) as Record<string, unknown>;

  return {
    stackId: stack.id as string,
    l2ChainId: (meta.l2ChainId as number) ?? 0,
    l2Rpc: (meta.l2Rpc as string) || LOCAL_DEFAULTS.l2Rpc,
    bridgeUrl: (meta.bridgeUrl as string) || LOCAL_DEFAULTS.bridgeUrl,
    explorerUrl: (meta.explorerUrl as string) || LOCAL_DEFAULTS.explorerUrl,
    explorerApiUrl: (meta.explorerApiUrl as string) || LOCAL_DEFAULTS.explorerApiUrl,
    grafanaUrl: (meta.grafanaUrl as string) || LOCAL_DEFAULTS.grafanaUrl,
    prometheusUrl: (meta.prometheusUrl as string) || LOCAL_DEFAULTS.prometheusUrl,
    uptimeUrl: (meta.uptimeUrl as string) || LOCAL_DEFAULTS.uptimeUrl,
    drbUrl: (meta.drbUrl as string) || LOCAL_DEFAULTS.drbUrl,
    bundlerUrl: (meta.bundlerUrl as string) || LOCAL_DEFAULTS.bundlerUrl,
    crossTradeUrl: (meta.crossTradeUrl as string) || LOCAL_DEFAULTS.crossTradeUrl,
  };
}
