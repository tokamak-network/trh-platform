/**
 * Matrix Health Check — Monitoring (Tier 2)
 *
 * SKIPS for General preset (monitoring not in module list).
 * Verifies Grafana health and Prometheus active targets.
 *
 * Usage:
 *   LIVE_PRESET=defi LIVE_FEE_TOKEN=ETH npx playwright test \
 *     --config playwright.live.config.ts tests/e2e/matrix/monitoring-health.live.spec.ts
 */

import { test, expect } from '@playwright/test';
import { getStackConfig, isModuleEnabled } from '../helpers/matrix-config';
import { resolveStackUrls, StackUrls } from '../helpers/stack-resolver';

const config = getStackConfig();
let urls: StackUrls;

test.describe(`Monitoring Health [${config.preset}/${config.feeToken}]`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.skip(!isModuleEnabled(config.preset, 'monitoring'), 'Monitoring not in preset');
    urls = await resolveStackUrls(config.chainName);
  });

  test('Grafana health check', async () => {
    const resp = await fetch(`${urls.grafanaUrl}/api/health`);
    expect(resp.status).toBe(200);

    const body = await resp.json() as Record<string, unknown>;
    expect(body.database).toBe('ok');
  });

  test('Prometheus has active targets', async () => {
    const resp = await fetch(`${urls.prometheusUrl}/api/v1/targets`);
    expect(resp.status).toBe(200);

    const body = await resp.json() as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;
    const activeTargets = data.activeTargets as unknown[];
    expect(activeTargets.length).toBeGreaterThan(0);
  });
});
