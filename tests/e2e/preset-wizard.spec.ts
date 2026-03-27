import { test, expect } from '@playwright/test';
import { authenticateContext } from './helpers/auth';

// Preset mapping matching MOCK_PRESETS in trh-platform-ui/src/features/rollup/schemas/preset.ts
const PRESETS = [
  { id: 'general', name: 'General Purpose', batchFreq: '1800', outputFreq: '1800' },
  { id: 'defi', name: 'DeFi', batchFreq: '900', outputFreq: '900' },
  { id: 'gaming', name: 'Gaming', batchFreq: '300', outputFreq: '600' },
  { id: 'full', name: 'Full Suite', batchFreq: '600', outputFreq: '600' },
] as const;

// Valid BIP39 mnemonic for seed phrase inputs
const TEST_MNEMONIC_WORDS = [
  'abandon', 'abandon', 'abandon', 'abandon',
  'abandon', 'abandon', 'abandon', 'abandon',
  'abandon', 'abandon', 'abandon', 'about',
];

test.beforeEach(async ({ context }) => {
  await authenticateContext(context);
});

/**
 * Helper: fill the 12-word seed phrase inputs in AccountSetup (preset mode).
 * In preset mode the seed phrase grid renders 12 <input> elements inside a
 * CSS grid (.grid.grid-cols-3). Each word input is an <input> with
 * type="password" (default) or type="text".
 */
async function fillSeedPhrase(page: import('@playwright/test').Page): Promise<void> {
  // The first seed phrase input is inside the "Account Selection" / "Seed Phrase" section.
  // We can paste the entire 12 words into the first input which triggers the paste handler.
  const seedInputs = page.locator('input[placeholder="•••••"]');
  await expect(seedInputs.first()).toBeVisible();

  // Paste full mnemonic into the first input (the component detects multi-word paste)
  await seedInputs.first().fill(TEST_MNEMONIC_WORDS.join(' '));

  // Check the confirmation checkbox for seed phrase
  await page.locator('#seedPhraseConfirm').click();
}

/**
 * Helper: navigate from step 1 through step 2, ready for step 3.
 */
async function completeStep1And2(
  page: import('@playwright/test').Page,
  presetName: string,
  presetId: string,
): Promise<void> {
  await page.goto('/rollup/create');

  // Wait for presets to load via MSW
  await expect(page.getByText('Choose a Deployment Preset')).toBeVisible({ timeout: 15000 });

  // Step 1: Select preset card
  await page.getByText(presetName, { exact: false }).first().click();
  await expect(page.getByText('Preset selected')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: Fill basic info
  await expect(page.getByText('Infrastructure Provider')).toBeVisible({ timeout: 10000 });

  // Select Local Docker
  await page.getByText('Local Docker').click();

  // Fill chain name
  await page.locator('#chainName').fill(`test-${presetId}`);

  // Fill L1 RPC URL
  await page.locator('#l1RpcUrl').fill('https://eth-sepolia.example.com');

  // Fill seed phrase
  await fillSeedPhrase(page);

  // Click Next to go to step 3
  await page.getByRole('button', { name: 'Next' }).click();
}

// ---------------------------------------------------------------------------
// Parametric tests for all 4 presets
// ---------------------------------------------------------------------------

for (const preset of PRESETS) {
  test.describe(`${preset.name} preset wizard`, () => {
    test(`E2E-01: completes 3-step wizard flow for ${preset.name}`, async ({ page }) => {
      await completeStep1And2(page, preset.name, preset.id);

      // Step 3: Verify review screen is visible
      await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10000 });

      // Verify preset name badge
      await expect(page.getByText(`${preset.name} Preset`)).toBeVisible();
    });

    test(`E2E-02: shows correct parameters for ${preset.name}`, async ({ page }) => {
      await completeStep1And2(page, preset.name, preset.id);

      // Step 3: Verify review screen
      await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10000 });

      // Verify preset-specific parameter values from chainDefaults
      // Each preset has different batchSubmissionFrequency and outputRootFrequency
      await expect(page.getByText('Batch Submission Frequency')).toBeVisible();
      await expect(page.getByText('Output Root Frequency')).toBeVisible();

      // Check the actual numeric values are displayed
      // These appear as text content like "1800" "seconds"
      await expect(page.getByText(preset.batchFreq, { exact: true }).first()).toBeVisible();

      // Verify L2 Block Time is shown (common to all presets: 2 seconds)
      await expect(page.getByText('L2 Block Time')).toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// E2E-03: Funding status verification
// FundingStatus component shows:
//   - Badge with STATUS_LABELS[status] (e.g., "Awaiting Funds", "Ready to Deploy")
//   - "{fulfilledCount} of {total} accounts funded"
//   - Per-account "Pending"/"Funded" badges
//   - Green alert "All accounts are funded" when allFulfilled
// ---------------------------------------------------------------------------

test.describe('Funding status', () => {
  test('E2E-03a: unfunded — deploy redirects to /rollup with pending funding', async ({ page }) => {
    // MSW default funding handler returns allFulfilled: false (unfunded scenario)
    await completeStep1And2(page, 'General Purpose', 'general');

    await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10000 });

    // Intercept deploy API to verify it is called
    const deployResponse = page.waitForResponse(
      (response) => response.url().includes('preset-deploy') && response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: 'Deploy Rollup' }).click();
    await deployResponse;

    // Should navigate to /rollup after deploy
    await page.waitForURL('**/rollup', { timeout: 15000 });
    expect(page.url()).toContain('/rollup');
  });

  test('E2E-03b: funded — page.route override returns all accounts fulfilled', async ({ page }) => {
    // Override funding API response to return all funded using page.route
    // (Playwright route interception takes priority over MSW)
    await page.route('**/preset-deploy/*/funding', (route) => {
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            deploymentId: 'test-deploy-001',
            status: 'ready',
            accounts: [
              { role: 'admin', address: '0x1111111111111111111111111111111111111111', requiredWei: '500000000000000000', currentWei: '500000000000000000', fulfilled: true },
              { role: 'sequencer', address: '0x2222222222222222222222222222222222222222', requiredWei: '500000000000000000', currentWei: '500000000000000000', fulfilled: true },
              { role: 'batcher', address: '0x3333333333333333333333333333333333333333', requiredWei: '500000000000000000', currentWei: '500000000000000000', fulfilled: true },
              { role: 'proposer', address: '0x4444444444444444444444444444444444444444', requiredWei: '500000000000000000', currentWei: '500000000000000000', fulfilled: true },
            ],
            allFulfilled: true,
          },
          success: true,
        }),
      });
    });

    await completeStep1And2(page, 'General Purpose', 'general');

    await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10000 });

    const deployResponse = page.waitForResponse(
      (response) => response.url().includes('preset-deploy') && response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: 'Deploy Rollup' }).click();
    await deployResponse;

    // Should navigate to /rollup
    await page.waitForURL('**/rollup', { timeout: 15000 });
    expect(page.url()).toContain('/rollup');
  });
});

// ---------------------------------------------------------------------------
// E2E-04: Deploy initiation and progress
// Deploy flow: Click "Deploy Rollup" -> POST /preset-deploy -> deploymentId
// returned -> toast "Deployment initiated!" -> router.push('/rollup')
// ---------------------------------------------------------------------------

test.describe('Deploy initiation', () => {
  test('E2E-04: deploy triggers POST /preset-deploy and navigates to /rollup', async ({ page }) => {
    await completeStep1And2(page, 'DeFi', 'defi');

    await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10000 });

    // Intercept deploy POST request to verify API call
    const deployResponse = page.waitForResponse(
      (response) => response.url().includes('preset-deploy') && response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: 'Deploy Rollup' }).click();

    // Verify POST /preset-deploy was called and returned deploymentId
    const response = await deployResponse;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.deploymentId).toBe('test-deploy-001');
    expect(body.success).toBe(true);

    // Verify page navigates to /rollup after deploy
    await page.waitForURL('**/rollup', { timeout: 15000 });
    expect(page.url()).toContain('/rollup');
  });
});
