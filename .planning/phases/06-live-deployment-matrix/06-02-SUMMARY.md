---
phase: 06-live-deployment-matrix
plan: 02
subsystem: testing
tags: [playwright, health-checks, matrix, live-e2e, blockscout, grafana, drb, aa-paymaster]

requires:
  - phase: 06-live-deployment-matrix/01
    provides: matrix-config, stack-resolver, health-checks, poll helpers
provides:
  - 7 matrix health check spec files covering Tier 1 and Tier 2 modules
  - Conditional test execution based on preset and fee token
affects: [06-live-deployment-matrix/03]

tech-stack:
  added: []
  patterns: [conditional-test-skip-via-beforeAll, preset-aware-test-describe-naming]

key-files:
  created:
    - tests/e2e/matrix/core-chain.live.spec.ts
    - tests/e2e/matrix/bridge-health.live.spec.ts
    - tests/e2e/matrix/explorer-health.live.spec.ts
    - tests/e2e/matrix/monitoring-health.live.spec.ts
    - tests/e2e/matrix/uptime-health.live.spec.ts
    - tests/e2e/matrix/drb-health.live.spec.ts
    - tests/e2e/matrix/aa-health.live.spec.ts
  modified: []

key-decisions:
  - "test.skip() in test.beforeAll to skip entire describe blocks for disabled modules"
  - "Preset/feeToken shown in describe name for clear matrix reporting"

patterns-established:
  - "Matrix spec pattern: getStackConfig() at module level, resolveStackUrls() in beforeAll, isModuleEnabled()/needsAASetup() for conditional skip"
  - "Screenshot path convention: /tmp/pw-screenshots/matrix-{module}-{preset}.png"

requirements-completed: []

duration: 3min
completed: 2026-04-03
---

# Phase 06 Plan 02: Matrix Health Check Specs Summary

**7 Playwright spec files covering Tier 1 (core-chain, bridge, explorer) and Tier 2 (monitoring, uptime, DRB, AA) health checks with preset-conditional execution**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T14:47:43Z
- **Completed:** 2026-04-03T14:51:06Z
- **Tasks:** 3
- **Files created:** 7

## Accomplishments
- Tier 1 specs: core-chain (5 tests), bridge-health (2 tests), explorer-health (2 tests) run for ALL presets
- Tier 2 specs: monitoring (2 tests), uptime (1 test), DRB (2 tests) conditionally skip based on preset module map
- AA health spec (3 tests) skips when feeToken is TON (native token, no paymaster needed)
- All 7 files compile with strict TypeScript, import Plan 01 helpers, and follow *.live.spec.ts naming

## Task Commits

Each task was committed atomically:

1. **Task 1: Core chain, bridge, explorer health specs** - `be3d4bb` (feat)
2. **Task 2: Monitoring, uptime, DRB health specs** - `cdf84e4` (feat)
3. **Task 3: AA paymaster health spec** - `b1d611f` (feat)

## Files Created/Modified
- `tests/e2e/matrix/core-chain.live.spec.ts` - L2 RPC alive, chain ID, block production, op-node sync, ETH transfer
- `tests/e2e/matrix/bridge-health.live.spec.ts` - Bridge UI loads, correct fee token displayed
- `tests/e2e/matrix/explorer-health.live.spec.ts` - Blockscout API responds, explorer frontend loads
- `tests/e2e/matrix/monitoring-health.live.spec.ts` - Grafana health, Prometheus active targets (skips General)
- `tests/e2e/matrix/uptime-health.live.spec.ts` - Uptime Kuma page loads (skips General)
- `tests/e2e/matrix/drb-health.live.spec.ts` - DRB leader responds, contract bytecode exists (skips General/DeFi)
- `tests/e2e/matrix/aa-health.live.spec.ts` - Paymaster bytecode, EntryPoint bytecode, bundler alive (skips TON)

## Decisions Made
- Used `test.skip()` inside `test.beforeAll` to skip entire describe blocks for disabled modules (Playwright pattern)
- Included preset/feeToken in describe name for clear matrix CI reporting
- Used hardcoded test key as fallback for ADMIN_KEY in core-chain ETH transfer test

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all specs are complete with real assertions.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 7 matrix spec files ready for Plan 03 (matrix runner / CI configuration)
- Test suite supports any of the 16 preset x feeToken combinations via environment variables

## Self-Check: PASSED

All 8 files found (7 spec files + 1 SUMMARY). All 3 task commits verified.

---
*Phase: 06-live-deployment-matrix*
*Completed: 2026-04-03*
