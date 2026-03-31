// TRH Platform — Real Deployment Screenshot Capture
//
// Captures screenshots across five phases:
//   Phase A (A01-A05): Electron UI via Vite mock server (port 5174)
//   Phase B (B01-B06): Real deployment wizard via live backend
//   Phase C (C01-C02): Deployment in progress (logs, polling)
//   Phase D (D01-D03): Deployment complete — Integration / Account Abstraction tabs
//   Phase E (E01-E06): Post-deployment — Bridge, Blockscout, Grafana, AA, Termination
//
// Prerequisites for Phase B-E:
//   - Backend running at http://localhost:8000  (make setup)
//   - Platform UI running at http://localhost:3000
//
// Usage:
//   npx tsx scripts/capture-real-deployment.ts            # Full run (new deployment)
//   EXISTING_STACK_ID=<id> npx tsx ...                    # Skip B+C, use existing stack
//   npm run capture-real
//   EXISTING_STACK_ID=5336b14a-5c54-4be2-9d05-a44d02e8c8be npm run capture-real

import { chromium, type BrowserContext, type Page, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Configuration constants (hardcoded for demo reproducibility)
// ---------------------------------------------------------------------------

const L1_RPC = 'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';
const SEED_PHRASE = 'age video flag decade alert potato one shallow neglect labor destroy high';
const CHAIN_NAME = 'tokamak-l2';
const FEE_TOKEN = 'USDT';
const PRESET = 'Full Suite';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots-demo');
const PLATFORM_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:8000';
const VITE_URL = 'http://localhost:5174';
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin';

// External service URLs (populated from stack metadata or defaults)
const BRIDGE_URL = 'http://localhost:3001';
const EXPLORER_URL = 'http://localhost:4001';    // Blockscout gateway
const GRAFANA_URL = 'http://localhost:3002';
const UPTIME_URL = 'http://localhost:3003';      // Uptime Kuma

// Set EXISTING_STACK_ID env var to skip Phase B+C and use an already-deployed stack
const EXISTING_STACK_ID = process.env.EXISTING_STACK_ID ?? '';

// Set WIZARD_ONLY=1 to capture only Phase B wizard screenshots (no actual deploy)
const WIZARD_ONLY = process.env.WIZARD_ONLY === '1';

// Deployment polling configuration
const POLL_INTERVAL_MS = 30 * 1000;             // 30 seconds
const MAX_DEPLOY_WAIT_MS = 90 * 60 * 1000;      // 90 minutes

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok || resp.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server not ready: ${url}`);
}

async function loginAndInjectToken(context: BrowserContext): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: HTTP ${response.status}`);
  }

  const body = await response.json() as { token?: string; data?: { token?: string } };
  const token: string = body.token ?? body.data?.token ?? '';

  if (!token) {
    throw new Error(`Login failed: no token in response ${JSON.stringify(body)}`);
  }

  await context.addCookies([{
    name: 'auth-token',
    value: token,
    url: PLATFORM_URL,
    httpOnly: false,
    secure: false,
  }]);

  await context.addInitScript((t: string) => {
    localStorage.setItem('accessToken', t);
  }, token);

  return token;
}

async function saveScreenshot(page: Page, filename: string): Promise<void> {
  const outputPath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`  -> Saved: ${filename}`);
}

async function tryCapture(
  page: Page,
  filename: string,
  prepare: () => Promise<void>
): Promise<void> {
  try {
    await prepare();
    await saveScreenshot(page, filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  -> SKIPPED ${filename}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Phase A: Electron UI screenshots via Vite mock server
// ---------------------------------------------------------------------------

async function runPhaseA(browser: Browser): Promise<void> {
  const server = spawn('npx', ['vite', '--port', '5174', '--config', 'vite.config.ts'], {
    env: { ...process.env, VITE_MOCK_ELECTRON: 'true' },
    stdio: 'ignore',
    detached: false,
  });

  try {
    console.log('  Waiting for Vite server at ' + VITE_URL + '...');
    await waitForServer(VITE_URL, 30000);
    console.log('  Vite server ready.\n');

    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });

    try {
      // A01: Initial launch — setup wizard with Docker check
      {
        const page = await context.newPage();
        try {
          console.log('  [A01] Initial launch...');
          await page.goto(`${VITE_URL}?scenario=fresh`, { waitUntil: 'networkidle', timeout: 10000 });
          await page.waitForSelector('.setup-page', { timeout: 5000 });
          await page.waitForTimeout(300);
          await saveScreenshot(page, 'A01-initial-launch.png');
        } finally {
          await page.close();
        }
      }

      // A02: Image download — setup with loading step visible
      {
        const page = await context.newPage();
        try {
          console.log('  [A02] Image download...');
          await page.goto(`${VITE_URL}?scenario=fresh`, { waitUntil: 'networkidle', timeout: 10000 });
          await page.waitForSelector('.setup-page', { timeout: 5000 });
          await page.waitForSelector('.step.loading', { timeout: 15000 });
          await saveScreenshot(page, 'A02-image-download.png');
        } finally {
          await page.close();
        }
      }

      // A03: Key setup empty — seed phrase input form
      {
        const page = await context.newPage();
        try {
          console.log('  [A03] Key setup empty...');
          await page.goto(`${VITE_URL}?scenario=keysetup-input`, { waitUntil: 'networkidle', timeout: 10000 });
          await page.waitForSelector('.seed-input', { timeout: 15000 });
          await page.waitForTimeout(300);
          await saveScreenshot(page, 'A03-key-setup-empty.png');
        } finally {
          await page.close();
        }
      }

      // A04: BIP44 derivation — seed phrase filled with derived addresses
      {
        const page = await context.newPage();
        try {
          console.log('  [A04] BIP44 derivation...');
          await page.goto(`${VITE_URL}?scenario=keysetup-input`, { waitUntil: 'networkidle', timeout: 10000 });
          await page.waitForSelector('.seed-input', { timeout: 15000 });
          await page.fill('.seed-input', SEED_PHRASE);
          await page.waitForSelector('.seed-addresses', { timeout: 5000 });
          await page.waitForTimeout(300);
          await saveScreenshot(page, 'A04-bip44-derivation.png');
        } finally {
          await page.close();
        }
      }

      // A05: Platform ready — webapp overlay with version badge
      {
        const page = await context.newPage();
        try {
          console.log('  [A05] Platform ready...');
          await page.goto(`${VITE_URL}?scenario=healthy`, { waitUntil: 'networkidle', timeout: 10000 });
          await page.waitForSelector('.version', { timeout: 5000 });
          await page.waitForTimeout(500);
          await saveScreenshot(page, 'A05-platform-ready.png');
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  } finally {
    server.kill();
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
}

// ---------------------------------------------------------------------------
// Phase B: Real deployment wizard screenshots via live backend
// Returns the deployed stack ID
// ---------------------------------------------------------------------------

async function runPhaseB(browser: Browser, token: string, context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  let stackId = '';

  try {
    // B01: Step 1 — preset list
    {
      console.log('  [B01] Preset list...');
      await page.goto(`${PLATFORM_URL}/rollup/create`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.getByText('Choose a Deployment Preset').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'B01-step1-preset-list.png');
    }

    // B02: Step 1 — preset selected
    {
      console.log('  [B02] Preset selected...');
      await page.getByText(PRESET, { exact: false }).first().click();
      await page.getByText('Preset selected').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'B02-step1-selected.png');
    }

    // B03: Step 2 — infrastructure selection
    {
      console.log('  [B03] Infrastructure provider...');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('Infrastructure Provider').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByRole('button', { name: /Local Docker/ }).click();
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'B03-step2-infra.png');
    }

    // B04: Step 2 — fee token configured
    {
      console.log('  [B04] Fee token configuration...');
      await page.locator('#chainName').fill(CHAIN_NAME);
      await page.locator('#feeToken').click();
      await page.waitForSelector('[role="option"]', { timeout: 5000 });
      await page.getByRole('option', { name: new RegExp(`^${FEE_TOKEN}`) }).click();
      await page.locator('#l1RpcUrl').fill(L1_RPC);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'B04-step2-fee-token.png');
    }

    // B05: Step 2 — operator balance section (after seed phrase)
    {
      console.log('  [B05] Operator balance...');
      const seedInputs = page.locator('input[placeholder="•••••"]');
      await seedInputs.first().fill(SEED_PHRASE);
      await page.locator('#seedPhraseConfirm').click();
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'B05-step2-operator-balance.png');
    }

    // B06: Step 3 — configuration review
    {
      console.log('  [B06] Configuration review...');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('Preset Configuration Review').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'B06-step3-review.png');
    }

    // WIZARD_ONLY mode: stop before deploying
    if (WIZARD_ONLY) {
      console.log('  [wizard-only] Stopping after B06 (no deploy).');
      return stackId;
    }

    // C01: Deployment started
    {
      console.log('  [C01] Deploy started...');
      await page.getByRole('button', { name: /Deploy Rollup/ }).click();
      await page.waitForURL('**/rollup/**', { timeout: 30000 });
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'C01-deploy-started.png');
    }

    // C02: Deployment logs (polling loop, 30s intervals, max 90min)
    {
      console.log('  [C02] Deployment logs (polling every 30s, max 90min)...');
      const startTime = Date.now();
      let c02Captured = false;

      while (Date.now() - startTime < MAX_DEPLOY_WAIT_MS) {
        await page.waitForTimeout(POLL_INTERVAL_MS);
        await saveScreenshot(page, 'C02-deploy-logs.png');
        c02Captured = true;

        const currentUrl = page.url();
        const stackIdMatch = currentUrl.match(/\/rollup\/([^/?]+)/);
        if (stackIdMatch) {
          stackId = stackIdMatch[1];
          try {
            const statusResp = await fetch(`${BACKEND_URL}/api/v1/stacks/thanos/${stackId}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (statusResp.ok) {
              const statusBody = await statusResp.json() as {
                status?: string;
                data?: { status?: string; stack?: { status?: string } };
              };
              const status = statusBody.status ?? statusBody.data?.status ?? statusBody.data?.stack?.status;
              console.log(`    Stack status: ${status ?? 'unknown'}`);
              if (status === 'Deployed' || status === 'running' || status === 'completed') {
                console.log('    Deployment complete.');
                break;
              }
            }
          } catch {
            // ignore polling errors, continue waiting
          }
        }
      }

      if (!c02Captured) {
        await saveScreenshot(page, 'C02-deploy-logs.png');
      }

      // Extract final stackId from URL
      const finalUrl = page.url();
      const match = finalUrl.match(/\/rollup\/([^/?]+)/);
      if (match) stackId = match[1];
    }
  } finally {
    await page.close();
  }

  return stackId;
}

// ---------------------------------------------------------------------------
// Phase D: Stack detail — Integration and Account Abstraction tabs
// ---------------------------------------------------------------------------

async function runPhaseD(browser: Browser, context: BrowserContext, stackId: string): Promise<void> {
  const page = await context.newPage();

  try {
    // D01: Integration/components tab
    {
      console.log(`  [D01] Integration tab (stack: ${stackId})...`);
      await page.goto(`${PLATFORM_URL}/rollup/${stackId}?tab=components`, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'D01-integration-tab.png');
    }

    // D02: Account abstraction overview tab
    {
      console.log(`  [D02] AA overview tab...`);
      await page.goto(`${PLATFORM_URL}/rollup/${stackId}?tab=account-abstraction`, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'D02-aa-overview.png');
    }

    // D03: AA oracle section (scroll to oracle element)
    {
      console.log(`  [D03] AA oracle section...`);
      await tryCapture(page, 'D03-aa-oracle.png', async () => {
        await page.evaluate(() => {
          const headings = Array.from(document.querySelectorAll('h2, h3, h4, [class*="oracle"], [class*="Oracle"]'));
          const oracleEl = headings.find((el) => el.textContent?.includes('Oracle') || el.textContent?.includes('Fee Token'));
          if (oracleEl) oracleEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        });
        await page.waitForTimeout(500);
      });
    }
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Phase E: Post-deployment — Bridge, Blockscout, Grafana, Uptime Kuma,
//           AA status, Termination screen
// ---------------------------------------------------------------------------

async function runPhaseE(browser: Browser, context: BrowserContext, stackId: string): Promise<void> {
  // E01: Bridge UI (L1 ↔ L2 bridge at localhost:3001)
  {
    const page = await context.newPage();
    try {
      console.log('  [E01] Bridge UI...');
      await tryCapture(page, 'E01-bridge-ui.png', async () => {
        await page.goto(BRIDGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
      });
    } finally {
      await page.close();
    }
  }

  // E02: Bridge deposit form (connect wallet / deposit tab)
  {
    const page = await context.newPage();
    try {
      console.log('  [E02] Bridge deposit form...');
      await tryCapture(page, 'E02-bridge-deposit.png', async () => {
        await page.goto(BRIDGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        // Try clicking Deposit tab if present
        const depositTab = page.getByRole('tab', { name: /Deposit/i }).or(
          page.getByRole('button', { name: /Deposit/i })
        );
        if (await depositTab.count() > 0) {
          await depositTab.first().click();
          await page.waitForTimeout(500);
        }
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(300);
      });
    } finally {
      await page.close();
    }
  }

  // E03: Blockscout explorer — latest blocks
  {
    const page = await context.newPage();
    try {
      console.log('  [E03] Blockscout explorer...');
      await tryCapture(page, 'E03-blockscout-blocks.png', async () => {
        await page.goto(EXPLORER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(3000);
      });
    } finally {
      await page.close();
    }
  }

  // E04: Grafana — monitoring dashboard
  {
    const page = await context.newPage();
    try {
      console.log('  [E04] Grafana monitoring...');
      await tryCapture(page, 'E04-grafana-dashboard.png', async () => {
        // Grafana anonymous access or login
        await page.goto(`${GRAFANA_URL}/dashboards`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        // If login page, try default credentials
        const loginBtn = page.getByRole('button', { name: /Log in|Sign in/i });
        if (await loginBtn.count() > 0) {
          await page.fill('input[name="user"]', 'admin').catch(() => {});
          await page.fill('input[name="password"]', 'admin').catch(() => {});
          await loginBtn.first().click().catch(() => {});
          await page.waitForTimeout(2000);
        }
        await page.waitForTimeout(1000);
      });
    } finally {
      await page.close();
    }
  }

  // E04b: Grafana — open first available dashboard
  {
    const page = await context.newPage();
    try {
      console.log('  [E04b] Grafana L2 dashboard...');
      await tryCapture(page, 'E04b-grafana-l2-dashboard.png', async () => {
        await page.goto(`${GRAFANA_URL}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        // Try to open the first dashboard link
        const dashLink = page.locator('a[href*="/d/"]').first();
        if (await dashLink.count() > 0) {
          await dashLink.click();
          await page.waitForTimeout(3000);
        }
      });
    } finally {
      await page.close();
    }
  }

  // E05: Uptime Kuma — system pulse monitoring
  {
    const page = await context.newPage();
    try {
      console.log('  [E05] Uptime Kuma (System Pulse)...');
      await tryCapture(page, 'E05-uptime-kuma.png', async () => {
        await page.goto(`${UPTIME_URL}/status/default`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
      });
    } finally {
      await page.close();
    }
  }

  // E06: AA status in Platform UI
  {
    const page = await context.newPage();
    try {
      console.log('  [E06] AA status in platform...');
      await tryCapture(page, 'E06-aa-status.png', async () => {
        await page.goto(`${PLATFORM_URL}/rollup/${stackId}?tab=account-abstraction`, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });
        await page.waitForTimeout(1000);
        // Scroll to EntryPoint Auto-Refill section
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('h2, h3, h4, [class*="refill"], [class*="Refill"]'));
          const el = els.find((e) => e.textContent?.includes('Refill') || e.textContent?.includes('EntryPoint'));
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
        });
        await page.waitForTimeout(500);
      });
    } finally {
      await page.close();
    }
  }

  // E07: Stack termination screen
  {
    const page = await context.newPage();
    try {
      console.log('  [E07] Termination screen...');
      await tryCapture(page, 'E07-termination.png', async () => {
        await page.goto(`${PLATFORM_URL}/rollup/${stackId}`, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });
        await page.waitForTimeout(500);
        // Navigate to settings tab which usually has terminate option
        const settingsTab = page.getByRole('tab', { name: /Settings|Danger/i });
        if (await settingsTab.count() > 0) {
          await settingsTab.first().click();
          await page.waitForTimeout(500);
        } else {
          // Try scrolling to bottom to find terminate button
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(300);
        }
      });
    } finally {
      await page.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const usingExisting = EXISTING_STACK_ID !== '';

  console.log('TRH Platform Screenshot Capture');
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Viewport: ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x`);
  if (usingExisting) {
    console.log(`  Mode: Existing stack (${EXISTING_STACK_ID}) — skipping Phase B+C`);
  } else if (WIZARD_ONLY) {
    console.log(`  Mode: Wizard-only — capturing B01-B06 without deploying`);
  } else {
    console.log(`  Mode: New deployment`);
  }
  console.log('');

  const browser = await chromium.launch({ headless: true });

  try {
    // Phase A: Mock Electron UI (always runs)
    console.log('=== Phase A: Electron UI (mock) ===');
    await runPhaseA(browser);

    // Check backend for Phase B-E
    const healthResp = await fetch(`${BACKEND_URL}/api/v1/health`).catch(() => null);
    if (!healthResp?.ok) {
      console.warn('\nWARNING: Backend not accessible. Skipping Phase B-E.');
      console.warn('  Run: make setup');
      return;
    }

    // Create context and authenticate (shared across Phase B-E)
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });

    try {
      const token = await loginAndInjectToken(context);
      console.log('\nAuthenticated.\n');

      let stackId = EXISTING_STACK_ID;

      if (!usingExisting) {
        // Phase B+C: New deployment wizard (or wizard-only preview)
        const label = WIZARD_ONLY ? '=== Phase B: Deployment Wizard (wizard-only) ===' : '=== Phase B+C: Deployment Wizard + Logs ===';
        console.log(label);
        stackId = await runPhaseB(browser, token, context);
        if (WIZARD_ONLY) return;
      }

      if (!stackId) {
        console.warn('WARNING: No stack ID — cannot run Phase D+E');
        return;
      }

      // Phase D: Stack detail tabs
      console.log(`\n=== Phase D: Stack Detail (${stackId}) ===`);
      await runPhaseD(browser, context, stackId);

      // Phase E: Post-deployment services
      console.log('\n=== Phase E: Bridge / Explorer / Grafana / Monitoring / Termination ===');
      await runPhaseE(browser, context, stackId);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Summary
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.png'));
  console.log(`\nCapture complete.`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Files: ${files.length}`);
  files.sort().forEach((f) => console.log(`    ${f}`));
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
