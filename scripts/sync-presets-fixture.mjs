#!/usr/bin/env node
/**
 * Preset Fixture Sync Script
 *
 * trh-backend에서 실제 Preset 정의를 가져와 tests/fixtures/presets.json을 갱신합니다.
 * 유닛 테스트가 실제 backend 데이터와 동기화되었는지 사전 검증하는 용도로 사용합니다.
 *
 * 사전 조건:
 *   - trh-backend가 실행 중이어야 합니다 (make up 또는 docker compose up -d backend)
 *
 * 사용법:
 *   node scripts/sync-presets-fixture.mjs
 *   node scripts/sync-presets-fixture.mjs --dry-run          # 변경 사항만 출력, 파일 미변경
 *   node scripts/sync-presets-fixture.mjs --url http://host:8000
 *   node scripts/sync-presets-fixture.mjs --email x@x.com --password secret
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};
const DRY_RUN = args.includes('--dry-run');
const BACKEND_URL = (flag('--url') ?? process.env.BACKEND_URL ?? 'http://localhost:8000') + '/api/v1';
const EMAIL = flag('--email') ?? process.env.SYNC_EMAIL ?? 'admin@gmail.com';
const PASSWORD = flag('--password') ?? process.env.SYNC_PASSWORD ?? 'admin';

const PRESET_IDS = ['general', 'defi', 'gaming', 'full'];
const FIXTURE_PATH = join(__dirname, '../tests/fixtures/presets.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function diff(oldObj, newObj, path = '') {
  const changes = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    if (!(key in oldObj)) {
      changes.push(`+ ${fullPath}: ${JSON.stringify(newObj[key])}`);
    } else if (!(key in newObj)) {
      changes.push(`- ${fullPath}: ${JSON.stringify(oldObj[key])}`);
    } else if (
      typeof oldObj[key] === 'object' && oldObj[key] !== null &&
      typeof newObj[key] === 'object' && newObj[key] !== null &&
      !Array.isArray(oldObj[key]) && !Array.isArray(newObj[key])
    ) {
      changes.push(...diff(oldObj[key], newObj[key], fullPath));
    } else if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes.push(`~ ${fullPath}: ${JSON.stringify(oldObj[key])} → ${JSON.stringify(newObj[key])}`);
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Validation (lightweight — full Zod validation runs in unit tests)
// ---------------------------------------------------------------------------
const REQUIRED_CHAIN_DEFAULTS = [
  'l2BlockTime', 'batchSubmissionFrequency', 'outputRootFrequency',
  'challengePeriod', 'registerCandidate', 'backupEnabled',
];
const REQUIRED_MODULES = ['bridge', 'blockExplorer', 'monitoring', 'crossTrade', 'uptimeService'];

function validatePreset(id, preset) {
  const errors = [];
  if (preset.id !== id) errors.push(`id mismatch: expected "${id}", got "${preset.id}"`);
  if (!preset.name) errors.push('missing name');
  if (!preset.description) errors.push('missing description');

  const cd = preset.chainDefaults ?? {};
  for (const f of REQUIRED_CHAIN_DEFAULTS) {
    if (cd[f] === undefined) errors.push(`chainDefaults.${f} missing`);
  }
  const mods = preset.modules ?? {};
  for (const f of REQUIRED_MODULES) {
    if (mods[f] === undefined) errors.push(`modules.${f} missing`);
  }
  if (!Array.isArray(preset.genesisPredeploys) || preset.genesisPredeploys.length === 0) {
    errors.push('genesisPredeploys must be a non-empty array');
  }
  if (!Array.isArray(preset.availableFeeTokens) || preset.availableFeeTokens.length === 0) {
    errors.push('availableFeeTokens must be a non-empty array');
  }
  if (errors.length > 0) throw new Error(`Preset "${id}" validation failed:\n  ${errors.join('\n  ')}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Preset Fixture Sync`);
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Fixture : ${FIXTURE_PATH}`);
  if (DRY_RUN) console.log(`Mode    : dry-run (파일 변경 없음)\n`);
  else console.log('');

  // 1. Auth
  process.stdout.write('Authenticating... ');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  // Login returns { token, user } directly (no entities.Response wrapper)
  const token = loginRes.token;
  if (!token) throw new Error(`Login succeeded but no token in response: ${JSON.stringify(loginRes)}`);
  console.log('✓');

  // 2. Fetch each preset
  const fetched = {};
  for (const id of PRESET_IDS) {
    process.stdout.write(`Fetching preset "${id}"... `);
    const res = await apiFetch(`/stacks/thanos/presets/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Preset endpoints use entities.Response: { status, message, data }
    const preset = res.data;
    validatePreset(id, preset);
    // Normalize: keep only fixture-relevant fields (drop helmValues etc.)
    fetched[id] = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      chainDefaults: preset.chainDefaults,
      modules: preset.modules,
      genesisPredeploys: preset.genesisPredeploys,
      availableFeeTokens: preset.availableFeeTokens,
      estimatedTime: preset.estimatedTime,
      overridableFields: preset.overridableFields,
    };
    console.log('✓');
  }

  // 3. Compare with existing fixture
  console.log('');
  const existing = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  const changes = diff(existing, fetched);

  if (changes.length === 0) {
    console.log('✓ Fixture is already up to date — no changes needed.');
    return;
  }

  // 4. Report diff
  console.log(`Changes detected (${changes.length}):`);
  for (const line of changes) {
    const color = line.startsWith('+') ? '\x1b[32m' : line.startsWith('-') ? '\x1b[31m' : '\x1b[33m';
    console.log(`  ${color}${line}\x1b[0m`);
  }

  if (DRY_RUN) {
    console.log('\n(dry-run) Fixture not updated.');
    process.exit(1); // non-zero so CI can detect drift
  }

  // 5. Write
  writeFileSync(FIXTURE_PATH, JSON.stringify(fetched, null, 2) + '\n');
  console.log(`\n✓ Fixture updated: tests/fixtures/presets.json`);
  console.log('  unit tests가 새 fixture로 실행됩니다 (npm test)');
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
