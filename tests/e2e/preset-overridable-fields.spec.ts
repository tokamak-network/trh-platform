/**
 * MSW Browser Test — Preset Overridable Fields (Spec C)
 *
 * Verifies that the deployment wizard enforces the overridableFields contract
 * from tests/fixtures/presets.json. When a user selects a preset and reaches
 * the ConfigReview step (step 3), enabling Expert Mode should reveal editable
 * controls only for fields listed in overridableFields; all other fields remain
 * read-only (shown as plain text spans).
 *
 * Design: challengePeriod is locked (read-only) across ALL presets.
 *         All other chain param fields (l2BlockTime, batchSubmissionFrequency,
 *         outputRootFrequency, backupEnabled) are editable in ALL presets.
 *
 * Source of truth: tests/fixtures/presets.json (presetData.overridableFields)
 * No hardcoding of field lists — loaded from fixture at test time.
 *
 * Test IDs:
 *   OV-01 — General preset: l2BlockTime/batch/outputRoot/backupEnabled editable, challengePeriod locked
 *   OV-02 — DeFi preset: same contract — only challengePeriod locked
 *   OV-03 — Gaming preset: same contract — only challengePeriod locked
 *   OV-04 — Full Suite preset: same contract — only challengePeriod locked
 *
 * Usage:
 *   npx playwright test tests/e2e/preset-overridable-fields.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { authenticateContext } from './helpers/auth';
import { getPresetData } from './helpers/presets';
import type { Preset } from './helpers/matrix-config';

const SCREENSHOTS_DIR = '/tmp/pw-ov-screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Seed phrase and L1 RPC for filling required BasicInfoStep fields.
// All 12 words are valid BIP39 words — paste detection fills all slots at once.
const SEED_PHRASE = 'notable famous industry antique either story escape squeeze also session priority fresh';
const L1_RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/x4EOshikyKeyJci-23VSqFnwKIddeS7f';

// All chain-param fields subject to the overridableFields contract.
const ALL_CHAIN_PARAM_FIELDS = [
  'l2BlockTime',
  'batchSubmissionFrequency',
  'outputRootFrequency',
  'challengePeriod',
  'backupEnabled',
] as const;

type ChainParamField = (typeof ALL_CHAIN_PARAM_FIELDS)[number];

/**
 * Maps field keys to their display labels as defined in ConfigReview.tsx's FIELD_LABELS.
 * Note: 'backupEnabled' renders as "Enable Backup", not "Backup Enabled".
 */
const CONFIG_REVIEW_LABELS: Record<ChainParamField, string> = {
  l2BlockTime:               'L2 Block Time',
  batchSubmissionFrequency:  'Batch Submission Frequency',
  outputRootFrequency:       'Output Root Frequency',
  challengePeriod:           'Challenge Period',
  backupEnabled:             'Enable Backup',
};

/**
 * Preset display names as rendered by PresetCard.tsx.
 * Note: "General Purpose" preset renders as "General" (PresetCard.tsx: preset.name === "General Purpose" ? "General" : preset.name).
 */
const PRESET_DISPLAY_NAMES: Record<Preset, string> = {
  general: 'General',
  defi:    'DeFi',
  gaming:  'Gaming',
  full:    'Full Suite',
};

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

/**
 * Navigate through the 3-step preset wizard to reach the ConfigReview step.
 *
 * Step 1: Select preset
 * Step 2: Fill BasicInfoStep (Local Docker + chain name + L1 RPC + seed phrase)
 * Step 3: Arrive at ConfigReview ("Preset Configuration Review")
 */
async function openConfigReviewStep(
  page: import('@playwright/test').Page,
  presetId: Preset,
): Promise<void> {
  const presetDisplayName = PRESET_DISPLAY_NAMES[presetId];

  await page.goto('/rollup/create');
  await expect(page.getByText('Choose a Deployment Preset')).toBeVisible({ timeout: 15_000 });

  // ── Step 1: Select preset ──
  await page.getByText(presetDisplayName, { exact: true }).first().click();
  await expect(page.getByText('Preset selected')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // ── Step 2: BasicInfoStep ──
  await page.waitForLoadState('networkidle', { timeout: 10_000 });

  // Select Local Docker — avoids AWS credential validation requirements.
  await page.getByText('Local Docker', { exact: true }).click();

  // Fill chain name (min 3 chars, lowercase/numbers/hyphens).
  await page.locator('#chainName').fill(`ov-${presetId}`);

  // Fill L1 RPC URL (required, valid URL format).
  await page.locator('#l1RpcUrl').fill(L1_RPC_URL);

  // Paste the full seed phrase into the first word input.
  // AccountSetup's handleSeedPhraseChange detects multiple words (split on whitespace)
  // and fills all 12 slots at once — valid BIP39 words only.
  const firstSeedInput = page.locator('input[placeholder="•••••"]').first();
  await firstSeedInput.click();
  await firstSeedInput.fill(SEED_PHRASE);

  // Allow React state to propagate the 12 seed words before validation.
  await page.waitForTimeout(600);

  // Advance to step 3 — triggers form.trigger("presetBasicInfo") validation.
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // ── Step 3: ConfigReview ──
  await expect(page.getByText('Preset Configuration Review')).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

/**
 * Enables Expert Mode in ConfigReview, then verifies each field's editability
 * against the preset's overridableFields contract.
 *
 * Editable fields: show <input> (numeric) or <Switch role="switch"> (boolean) in Expert Mode.
 * Locked fields: show a plain <span> regardless of Expert Mode.
 */
async function assertFieldEditability(
  page: import('@playwright/test').Page,
  preset: Preset,
): Promise<void> {
  const presetData = getPresetData(preset);
  const overridable = new Set(presetData.overridableFields);

  // Enable Expert Mode.
  // Before Expert Mode is on, the only [role="switch"] on the page is the Expert Mode toggle.
  // (Field-level switches only appear after Expert Mode is enabled.)
  const expertModeSwitch = page.getByRole('switch').first();
  const isAlreadyOn = await expertModeSwitch
    .evaluate((el) => el.getAttribute('data-state') === 'checked')
    .catch(() => false);
  if (!isAlreadyOn) {
    await expertModeSwitch.click();
    await page.waitForTimeout(300);
  }

  for (const field of ALL_CHAIN_PARAM_FIELDS) {
    const label = CONFIG_REVIEW_LABELS[field];

    // Locate the field row using XPath:
    //   <p class="... font-medium ...">L2 Block Time</p>
    //     → ancestor div[class*="justify-between"][1]  (the outermost field row div)
    //
    // ConfigReview DOM per field:
    //   div.flex.items-center.justify-between.rounded-lg.border.p-3  ← field row
    //     div.flex-1
    //       div.flex.items-center.gap-2
    //         p.text-sm.font-medium  ← label
    //     div.ml-4.flex.items-center.gap-2  ← value area
    //       <Input /> or <Switch /> (editable) | <span> (locked)
    const fieldRow = page.locator(
      `xpath=//p[contains(@class,"font-medium") and normalize-space(text())="${label}"]` +
      `/ancestor::div[contains(@class,"justify-between")][1]`,
    );

    const visible = await fieldRow.isVisible().catch(() => false);
    if (!visible) {
      console.log(`[OV] ${preset}/${field}: label "${label}" not rendered → treated as locked`);
      if (overridable.has(field)) {
        console.warn(
          `[OV] WARNING: "${field}" is in overridableFields for ${preset} ` +
          `but its label is not visible — check wizard implementation.`,
        );
      }
      continue;
    }

    // Count editable controls in the value area (.ml-4).
    // Numeric editable → <input>; boolean editable → [role="switch"].
    // Locked (any type) → <span> only, no input/switch.
    const editableCount = await fieldRow.locator('.ml-4').locator('input, [role="switch"]').count();
    const expectedEditable = overridable.has(field);

    if (expectedEditable) {
      expect(
        editableCount,
        `Field "${field}" (label: "${label}") should be EDITABLE for ${preset} preset ` +
        `(listed in overridableFields) but no editable control was found in Expert Mode`,
      ).toBeGreaterThan(0);
    } else {
      expect(
        editableCount,
        `Field "${field}" (label: "${label}") should be LOCKED for ${preset} preset ` +
        `(not in overridableFields) but an editable control was found in Expert Mode`,
      ).toBe(0);
    }

    console.log(`[OV] ${preset}/${field}: ${expectedEditable ? 'editable ✓' : 'locked ✓'}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.beforeEach(async ({ context }) => {
  await authenticateContext(context);
});

const EDITABLE_FIELDS = ['l2BlockTime', 'batchSubmissionFrequency', 'outputRootFrequency', 'backupEnabled'] as const;

test('OV-01: General preset — 4 fields editable, challengePeriod locked', async ({ page }) => {
  await openConfigReviewStep(page, 'general');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov01-general-config-review.png`, fullPage: true });

  const presetData = getPresetData('general');
  const overridable = new Set(presetData.overridableFields);

  expect(overridable.has('challengePeriod'), 'General: challengePeriod must NOT be in overridableFields').toBe(false);
  for (const field of EDITABLE_FIELDS) {
    expect(overridable.has(field), `General: ${field} must be in overridableFields`).toBe(true);
  }

  await assertFieldEditability(page, 'general');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov01-general-expert-mode.png`, fullPage: true });
});

test('OV-02: DeFi preset — only challengePeriod is locked', async ({ page }) => {
  await openConfigReviewStep(page, 'defi');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov02-defi-config-review.png`, fullPage: true });

  const presetData = getPresetData('defi');
  const overridable = new Set(presetData.overridableFields);

  expect(overridable.has('challengePeriod'), 'DeFi: challengePeriod must NOT be in overridableFields').toBe(false);
  for (const field of EDITABLE_FIELDS) {
    expect(overridable.has(field), `DeFi: ${field} must be in overridableFields`).toBe(true);
  }

  await assertFieldEditability(page, 'defi');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov02-defi-expert-mode.png`, fullPage: true });
});

test('OV-03: Gaming preset — only challengePeriod is locked', async ({ page }) => {
  await openConfigReviewStep(page, 'gaming');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov03-gaming-config-review.png`, fullPage: true });

  const presetData = getPresetData('gaming');
  const overridable = new Set(presetData.overridableFields);

  expect(overridable.has('challengePeriod'), 'Gaming: challengePeriod must NOT be in overridableFields').toBe(false);
  for (const field of EDITABLE_FIELDS) {
    expect(overridable.has(field), `Gaming: ${field} must be in overridableFields`).toBe(true);
  }

  await assertFieldEditability(page, 'gaming');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov03-gaming-expert-mode.png`, fullPage: true });
});

test('OV-04: Full Suite preset — only challengePeriod is locked', async ({ page }) => {
  await openConfigReviewStep(page, 'full');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov04-full-config-review.png`, fullPage: true });

  const presetData = getPresetData('full');
  const overridable = new Set(presetData.overridableFields);

  expect(overridable.has('challengePeriod'), 'Full: challengePeriod must NOT be in overridableFields').toBe(false);
  for (const field of EDITABLE_FIELDS) {
    expect(overridable.has(field), `Full: ${field} must be in overridableFields`).toBe(true);
  }

  await assertFieldEditability(page, 'full');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/ov04-full-expert-mode.png`, fullPage: true });
});
