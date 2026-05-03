/**
 * Deployment Wizard UI helpers for Electron E2E tests.
 *
 * Drives the TRH Platform rollup deployment wizard (Step 1 preset selection →
 * Step 2 basic info → Step 3 review → Deploy) via Playwright on the platform
 * WebContentsView (localhost:3000).
 *
 * Logic is adapted from tests/e2e/deployment-wizard.spec.ts local helpers.
 * That MSW-mode spec is NOT modified — this module is Electron-only.
 *
 * Default credentials come from persistent E2E test memory:
 *   - Seed phrase: notable famous industry antique either story escape squeeze
 *                  also session priority fresh
 *   - L1 RPC: Alchemy Sepolia (configurable via LIVE_L1_RPC_URL env var)
 */

import type { Page } from 'playwright';
import { loginBackend } from './stack-resolver';
import { pollUntil } from './poll';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SEED =
  process.env.LIVE_SEED_PHRASE ??
  'notable famous industry antique either story escape squeeze also session priority fresh';

const DEFAULT_L1_RPC =
  process.env.LIVE_L1_RPC_URL ??
  'https://eth-sepolia.g.alchemy.com/v2/x4EOshikyKeyJci-23VSqFnwKIddeS7f';

const PLATFORM_BASE = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PRESET_LABELS = {
  general: 'General Purpose',
  defi: 'DeFi',
  gaming: 'Gaming',
  full: 'Full Suite',
} as const;

const AWS_REGION_LABELS: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'eu-west-1': 'Europe (Ireland)',
  'eu-central-1': 'Europe (Frankfurt)',
};

export type PresetKey = keyof typeof PRESET_LABELS;

export interface WizardOptions {
  preset: PresetKey;
  feeToken: 'ETH' | 'USDT' | 'USDC';
  chainName: string;
  l1RpcUrl?: string;
  l1BeaconUrl?: string;
  seedPhrase?: string;
  infraProvider?: 'local' | 'aws';
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to /rollup/create and select a preset card, then click Next.
 */
export async function selectPreset(page: Page, preset: PresetKey): Promise<void> {
  await page.goto(`${PLATFORM_BASE}/rollup/create`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForSelector('text=Choose a Deployment Preset', { timeout: 15_000 });
  await page.getByText(PRESET_LABELS[preset], { exact: false }).first().click();
  await page.waitForSelector('text=Preset selected', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

/**
 * Fill Step 2: infrastructure provider, chain name, fee token, L1 RPC, seed phrase.
 * Supports both Local Docker and AWS Cloud (Electron DesktopAwsKeyInput form).
 */
export async function fillStep2(
  page: Page,
  opts: {
    chainName: string;
    feeToken: 'ETH' | 'USDT' | 'USDC';
    l1RpcUrl?: string;
    l1BeaconUrl?: string;
    seedPhrase?: string;
    infraProvider?: 'local' | 'aws';
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsRegion?: string;
  },
): Promise<void> {
  await page.waitForSelector('text=Infrastructure Provider', { timeout: 10_000 });

  const provider = opts.infraProvider ?? 'local';

  if (provider === 'aws') {
    // Select AWS Cloud provider
    await page.getByText('AWS Cloud', { exact: true }).click();

    // DesktopAwsKeyInput has no id attrs — target by placeholder
    await page.getByPlaceholder('AKIA...').fill(
      opts.awsAccessKey ?? process.env.E2E_AWS_ACCESS_KEY ?? '',
    );
    await page.getByPlaceholder('Enter secret key').fill(
      opts.awsSecretKey ?? process.env.E2E_AWS_SECRET_KEY ?? '',
    );

    // Region select — combobox is ambiguous (3 on page), filter by text; option uses display name not code
    const targetRegion = opts.awsRegion ?? process.env.E2E_AWS_REGION ?? 'ap-northeast-2';
    const regionLabel = AWS_REGION_LABELS[targetRegion] ?? targetRegion;
    await page.getByRole('combobox').filter({ hasText: /Select AWS region/i }).click();
    await page.getByRole('option', { name: regionLabel, exact: true }).click();

    console.log(`[deploy-wizard] AWS credentials entered (region: ${regionLabel})`);
  } else {
    // Select Local Docker provider
    await page.getByRole('button', { name: /Local Docker/ }).click();
  }

  // Chain name
  await page.locator('#chainName').fill(opts.chainName);

  // Fee token — open select, wait for options, click match
  await page.locator('#feeToken').click();
  await page.waitForSelector('[role="option"]', { timeout: 5_000 });
  await page.getByRole('option', { name: new RegExp(`^${opts.feeToken}`) }).click();

  // L1 RPC URL
  await page.locator('#l1RpcUrl').fill(opts.l1RpcUrl ?? DEFAULT_L1_RPC);

  // L1 Beacon URL (required for AWS deployments)
  if (opts.l1BeaconUrl) {
    const beaconInput = page.locator('#l1BeaconUrl');
    if (await beaconInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await beaconInput.fill(opts.l1BeaconUrl);
    }
  }

  // Seed phrase — paste full mnemonic into first slot (UI auto-splits to 12 inputs)
  const seedInputs = page.locator('input[placeholder="•••••"]');
  await seedInputs.first().waitFor({ state: 'visible', timeout: 10_000 });
  await seedInputs.first().fill(opts.seedPhrase ?? DEFAULT_SEED);

  // Confirm seed phrase checkbox
  await page.locator('#seedPhraseConfirm').click();
}

/**
 * Click Next to advance from Step 2 to the Step 3 Review screen.
 */
export async function proceedToReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForSelector('text=Preset Configuration Review', { timeout: 15_000 });
}

/**
 * Click "Deploy Rollup" and wait for the wizard to navigate back to /rollup list.
 * The wizard shows a "Deployment initiated!" toast and redirects to the stack list.
 */
export async function clickDeployAndAssertInitiated(page: Page): Promise<void> {
  console.log(`[deploy-wizard] Clicking Deploy Rollup (current URL: ${page.url()})`);

  // Intercept preset-deploy API response to diagnose failures
  const deployApiLog = page.waitForResponse(
    (resp) => resp.url().includes('preset-deploy') && resp.request().method() === 'POST',
    { timeout: 30_000 },
  ).then(async (resp) => {
    const body = await resp.text().catch(() => '(body read failed)');
    console.log(`[deploy-wizard] preset-deploy API: ${resp.status()} ${body.substring(0, 500)}`);
  }).catch((err: unknown) => {
    console.warn(`[deploy-wizard] preset-deploy API not observed: ${err instanceof Error ? err.message : String(err)}`);
  });

  await page.getByRole('button', { name: 'Deploy Rollup', exact: true }).click();
  console.log('[deploy-wizard] Deploy Rollup clicked — waiting for preset-deploy API response...');
  await deployApiLog;

  // Wizard navigates to /rollup (list) after initiating — not directly to stack detail.
  console.log('[deploy-wizard] Waiting for /rollup navigation...');
  try {
    await page.waitForURL(`${PLATFORM_BASE}/rollup`, { timeout: 120_000 });
  } catch (err) {
    console.error(`[deploy-wizard] Navigation timeout — still at: ${page.url()}`);
    throw err;
  }
  console.log('[deploy-wizard] Deployment initiated — navigated to /rollup list');
}

// ---------------------------------------------------------------------------
// Composite helper
// ---------------------------------------------------------------------------

/**
 * Run the full wizard flow: select preset → fill step 2 → review → deploy.
 *
 * @param page - Platform WebContentsView from getPlatformView()
 * @param opts - Wizard options (preset, feeToken, chainName, optional l1RpcUrl/seedPhrase)
 */
export async function deployPresetViaUI(page: Page, opts: WizardOptions): Promise<void> {
  console.log(
    `[deploy-wizard] Starting wizard: preset=${opts.preset}, feeToken=${opts.feeToken}, chainName=${opts.chainName}`,
  );
  await selectPreset(page, opts.preset);
  await fillStep2(page, {
    chainName: opts.chainName,
    feeToken: opts.feeToken,
    l1RpcUrl: opts.l1RpcUrl,
    l1BeaconUrl: opts.l1BeaconUrl,
    seedPhrase: opts.seedPhrase,
    infraProvider: opts.infraProvider,
    awsAccessKey: opts.awsAccessKey,
    awsSecretKey: opts.awsSecretKey,
    awsRegion: opts.awsRegion,
  });
  await proceedToReview(page);
  await clickDeployAndAssertInitiated(page);
  console.log('[deploy-wizard] Wizard complete');
}

// ---------------------------------------------------------------------------
// Stack ID resolution
// ---------------------------------------------------------------------------

/**
 * Poll the backend stacks list until a non-Terminated stack with the given
 * chainName appears, then return its ID.
 *
 * Call this immediately after clickDeployAndAssertInitiated() to capture the
 * stack ID created by the wizard (the wizard navigates to /rollup list, not
 * to the stack detail page, so the ID must be resolved via the API).
 *
 * @param chainName  - Chain name used during wizard Step 2
 * @param backendUrl - Override backend base URL
 * @param timeoutMs  - Maximum wait time (default 60 s)
 */
export async function resolveStackIdByChainName(
  chainName: string,
  backendUrl = process.env.LIVE_BACKEND_URL ?? 'http://localhost:8000',
  timeoutMs = 60_000,
): Promise<string> {
  console.log(`[deploy-wizard] Resolving stackId for chainName="${chainName}"...`);
  const token = await loginBackend(backendUrl);

  return pollUntil<string>(
    async () => {
      const resp = await fetch(`${backendUrl}/api/v1/stacks/thanos`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;

      const body = await resp.json() as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const stacks = (data.stacks as Record<string, unknown>[]) ?? [];

      const TERMINAL_STATUSES = new Set(['Terminated', 'FailedToDeploy']);
      const active = stacks
        .filter(
          (s) =>
            ((s.config as Record<string, unknown>)?.chainName as string) === chainName &&
            !TERMINAL_STATUSES.has(s.status as string),
        )
        .sort((a, b) => {
          const ta = new Date((a.createdAt ?? a.created_at ?? 0) as string).getTime();
          const tb = new Date((b.createdAt ?? b.created_at ?? 0) as string).getTime();
          return tb - ta;
        });
      const match = active[0];

      if (match) {
        console.log(`[deploy-wizard] Found stackId=${match.id as string}`);
      }
      return match ? (match.id as string) : null;
    },
    `stack with chainName="${chainName}"`,
    timeoutMs,
    5_000,
  );
}
