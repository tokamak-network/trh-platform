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
  'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';

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

export type PresetKey = keyof typeof PRESET_LABELS;

export interface WizardOptions {
  preset: PresetKey;
  feeToken: 'ETH' | 'USDT' | 'USDC';
  chainName: string;
  l1RpcUrl?: string;
  seedPhrase?: string;
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
 */
export async function fillStep2(
  page: Page,
  opts: {
    chainName: string;
    feeToken: 'ETH' | 'USDT' | 'USDC';
    l1RpcUrl?: string;
    seedPhrase?: string;
  },
): Promise<void> {
  await page.waitForSelector('text=Infrastructure Provider', { timeout: 10_000 });

  // Select Local Docker provider
  await page.getByRole('button', { name: /Local Docker/ }).click();

  // Chain name
  await page.locator('#chainName').fill(opts.chainName);

  // Fee token — open select, wait for options, click match
  await page.locator('#feeToken').click();
  await page.waitForSelector('[role="option"]', { timeout: 5_000 });
  await page.getByRole('option', { name: new RegExp(`^${opts.feeToken}`) }).click();

  // L1 RPC URL
  await page.locator('#l1RpcUrl').fill(opts.l1RpcUrl ?? DEFAULT_L1_RPC);

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
  await page.getByRole('button', { name: 'Deploy Rollup', exact: true }).click();
  // Wizard navigates to /rollup (list) after initiating — not directly to stack detail
  await page.waitForURL(`${PLATFORM_BASE}/rollup`, { timeout: 30_000 });
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
  await fillStep2(page, opts);
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

      const match = stacks.find(
        (s) =>
          ((s.config as Record<string, unknown>)?.chainName as string) === chainName &&
          (s.status as string) !== 'Terminated',
      );

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
