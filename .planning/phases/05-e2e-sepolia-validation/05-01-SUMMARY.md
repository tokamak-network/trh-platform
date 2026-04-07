---
phase: 05-e2e-sepolia-validation
plan: "01"
subsystem: tests/e2e
tags: [e2e, crosstrade, matrix, tdd, helpers]
dependency_graph:
  requires: []
  provides:
    - "PRESET_MODULES.defi includes crossTrade (bug fix)"
    - "StackUrls.crossTradeUrl field with localhost:3004 default"
    - "crosstrade-health.live.spec.ts with 3 E2E test cases"
    - "unit tests for crossTrade helper correctness"
  affects:
    - "tests/e2e/helpers/matrix-config.ts"
    - "tests/e2e/helpers/stack-resolver.ts"
tech_stack:
  added: []
  patterns:
    - "TDD: RED (unit tests fail) → GREEN (fix bug) → commit"
    - "Playwright live spec follows drb-health.live.spec.ts serial-mode pattern"
    - "pollUntil for HTTP reachability with 60s timeout"
key_files:
  created:
    - tests/e2e/matrix/crosstrade-health.live.spec.ts
    - tests/unit/crosstrade-e2e-helpers.test.ts
  modified:
    - tests/e2e/helpers/matrix-config.ts
    - tests/e2e/helpers/stack-resolver.ts
decisions:
  - "PRESET_MODULES.defi was missing crossTrade — confirmed bug via TDD RED phase, fixed in GREEN"
  - "crossTradeUrl default port 3004 (consistent with Phase 03 decision: avoid Bridge port 3001)"
  - "crossTradeIntegration fetched in beforeAll — shared across 3 serial tests for efficiency"
  - "L1 tx receipt checks gated on SEPOLIA_RPC_URL env var — optional in CI, required for full validation"
metrics:
  duration: "2min"
  completed: "2026-04-07T05:05:30Z"
  tasks: 2
  files: 4
---

# Phase 05 Plan 01: CrossTrade E2E Helper Setup + Live Spec Summary

**One-liner:** DeFi crossTrade bug fixed via TDD, StackUrls extended with crossTradeUrl, and 3-test live Sepolia spec created covering contract deployment, L1 registration, and dApp reachability.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Fix matrix-config.ts + Extend stack-resolver.ts + Unit Tests | `6a6b34b` | matrix-config.ts, stack-resolver.ts, crosstrade-e2e-helpers.test.ts |
| 2 | Write crosstrade-health.live.spec.ts (RED -- no live stack) | `3dfbdd2` | crosstrade-health.live.spec.ts |

## What Was Built

### Bug Fix: DeFi preset missing crossTrade module

`PRESET_MODULES.defi` in `tests/e2e/helpers/matrix-config.ts` was missing `'crossTrade'`. This caused `isModuleEnabled('defi', 'crossTrade')` to return `false`, which would cause the live spec to skip for DeFi stacks.

**Fixed:** Added `'crossTrade'` to the DeFi array at line 37.

### Extension: StackUrls.crossTradeUrl

Added to `tests/e2e/helpers/stack-resolver.ts`:
- `crossTradeUrl: string` field in `StackUrls` interface
- Default `'http://localhost:3004'` in `LOCAL_DEFAULTS`
- Resolution `(meta.crossTradeUrl as string) || LOCAL_DEFAULTS.crossTradeUrl` in `resolveStackUrls()`

### Live Spec: crosstrade-health.live.spec.ts

Three serial test cases gated by `isModuleEnabled(config.preset, 'crossTrade')`:

- **E2E-01** (`L2 CrossTrade contracts deployed`): Checks 4 contract addresses exist in integration metadata AND have bytecode on L2 via `ethers.JsonRpcProvider.getCode()`
- **E2E-02** (`L1 setChainInfo registered`): Checks `l1_registration_tx_hash` and `l1_l2l2_tx_hash` in metadata; optionally verifies receipt status on Sepolia when `SEPOLIA_RPC_URL` is set
- **E2E-03** (`CrossTrade dApp accessible`): Uses `pollUntil` (60s timeout, 5s interval) to verify HTTP reachability of `urls.crossTradeUrl`

### Unit Tests

`tests/unit/crosstrade-e2e-helpers.test.ts` — 8 tests covering:
- PRESET_MODULES membership for all 4 presets
- `isModuleEnabled` return values for crossTrade

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the live spec will skip (not fail) when no live stack is deployed because `beforeAll` calls `test.skip()` if the integration is missing. This is intentional behavior for the RED phase — the spec is infrastructure-ready for GREEN verification in Plan 05-02.

## Verification

```
npx vitest run tests/unit/crosstrade-e2e-helpers.test.ts
# 8/8 tests pass
```

Live spec TypeScript compiles without errors. File has 127 lines, 3 test cases.

## Self-Check: PASSED

- [x] `tests/e2e/helpers/matrix-config.ts` — PRESET_MODULES.defi includes 'crossTrade'
- [x] `tests/e2e/helpers/stack-resolver.ts` — StackUrls.crossTradeUrl exists with localhost:3004 default
- [x] `tests/e2e/matrix/crosstrade-health.live.spec.ts` — 127 lines, 3 test cases
- [x] `tests/unit/crosstrade-e2e-helpers.test.ts` — 8/8 tests pass
- [x] Commit `6a6b34b` — Task 1 fix
- [x] Commit `3dfbdd2` — Task 2 live spec
