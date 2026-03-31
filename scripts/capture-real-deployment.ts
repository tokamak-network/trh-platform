// TRH Platform — Real Deployment Screenshot Capture
//
// Captures 16 screenshots across two phases:
//   Phase A (A01-A05): Electron UI via Vite mock server (port 5174)
//   Phase B (B01-B06, C01-C02, D01-D03): Real deployment wizard via live backend
//
// Prerequisites for Phase B:
//   - Backend running at http://localhost:8000
//   - Platform UI running at http://localhost:3000
//   - Run: make setup
//
// Usage:
//   npx tsx scripts/capture-real-deployment.ts
//   npm run capture-real

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

// Deployment polling configuration
const POLL_INTERVAL_MS = 30 * 1000;   // 30 seconds
const MAX_DEPLOY_WAIT_MS = 90 * 60 * 1000; // 90 minutes

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
    // Allow server process to terminate
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
}

// ---------------------------------------------------------------------------
// Phase B: Real deployment wizard screenshots via live backend
// ---------------------------------------------------------------------------

async function runPhaseB(browser: Browser): Promise<void> {
  // 1. Check backend accessibility
  const healthResp = await fetch(`${BACKEND_URL}/health`).catch(() => null);
  if (!healthResp?.ok) {
    throw new Error(`Backend not accessible at ${BACKEND_URL}. Run: make setup`);
  }

  // 2. Create context and inject auth token
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  try {
    const token = await loginAndInjectToken(context);
    console.log('  Authenticated successfully.\n');

    const page = await context.newPage();

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

          // Check completion via stack status API
          const currentUrl = page.url();
          const stackIdMatch = currentUrl.match(/\/rollup\/([^/?]+)/);
          if (stackIdMatch) {
            const stackId = stackIdMatch[1];
            try {
              const statusResp = await fetch(`${BACKEND_URL}/api/v1/stacks/${stackId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (statusResp.ok) {
                const statusBody = await statusResp.json() as {
                  status?: string;
                  data?: { status?: string };
                };
                const status = statusBody.status ?? statusBody.data?.status;
                console.log(`    Stack status: ${status ?? 'unknown'}`);
                if (status === 'running' || status === 'completed') {
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
      }

      // D01-D03: Stack detail tabs (extract stackId from URL)
      const finalUrl = page.url();
      const stackIdMatch = finalUrl.match(/\/rollup\/([^/?]+)/);
      const stackId = stackIdMatch ? stackIdMatch[1] : '';

      if (stackId) {
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
          await page.evaluate(() => {
            const el = document.querySelector('[data-section="fee-token-oracle"], [id*="oracle"]');
            if (el) el.scrollIntoView();
          });
          await page.waitForTimeout(500);
          await saveScreenshot(page, 'D03-aa-oracle.png');
        }
      } else {
        console.warn('  WARNING: Could not extract stackId from URL — skipping D01-D03');
      }
    } finally {
      await page.close();
    }
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('TRH Platform Screenshot Capture');
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Viewport: ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x\n`);

  const browser = await chromium.launch({ headless: true });

  try {
    console.log('=== Phase A: Electron UI (mock) ===');
    await runPhaseA(browser);

    console.log('\n=== Phase B: Real Deployment Wizard ===');
    await runPhaseB(browser);
  } finally {
    await browser.close();
  }

  console.log(`\nCapture complete. Output: ${OUTPUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
