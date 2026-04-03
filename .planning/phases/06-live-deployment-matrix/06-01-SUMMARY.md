---
phase: 06-live-deployment-matrix
plan: 01
subsystem: testing
tags: [typescript, e2e, ethers, polling, matrix-testing, health-check]

requires:
  - phase: 04-preset-e2e
    provides: existing auth.ts helper pattern and live spec structure
provides:
  - StackConfig type and preset-module mapping for conditional test execution
  - Backend auth and stack URL resolution with Docker fallbacks
  - L2 RPC health check functions via ethers JsonRpcProvider
  - Generic pollUntil async polling utility
affects: [06-02-PLAN, 06-03-PLAN]

tech-stack:
  added: []
  patterns: [preset-module-matrix, environment-driven-stack-config, docker-fallback-urls]

key-files:
  created:
    - tests/e2e/helpers/matrix-config.ts
    - tests/e2e/helpers/poll.ts
    - tests/e2e/helpers/stack-resolver.ts
    - tests/e2e/helpers/health-checks.ts
  modified: []

key-decisions:
  - "Used Record<string, unknown> cast pattern from bridge-usdc.live.spec.ts for untyped API responses"
  - "Default stack config: gaming preset with USDC fee token matches existing usdc-gaming test stack"
  - "Local Docker fallback URLs defined as constants for all 9 service endpoints"

patterns-established:
  - "getStackConfig() reads LIVE_PRESET/LIVE_FEE_TOKEN/LIVE_CHAIN_NAME with validation and sensible defaults"
  - "resolveStackUrls() authenticates then resolves URLs, falling back to localhost for missing metadata"
  - "pollUntil<T> generic polling with attempt logging for async convergence checks"

requirements-completed: []

duration: 2min
completed: 2026-04-03
---

# Phase 06 Plan 01: Shared Matrix Helpers Summary

**Preset-aware stack config, backend URL resolver with Docker fallbacks, L2 health checks via ethers, and generic pollUntil utility**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T14:44:24Z
- **Completed:** 2026-04-03T14:46:01Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- matrix-config.ts: 4 types, PRESET_MODULES map, isModuleEnabled, needsAASetup, getStackConfig with env validation
- stack-resolver.ts: loginBackend and resolveStackUrls with 9 local Docker fallback URLs
- health-checks.ts: checkL2Rpc, checkL2ChainId, checkOpNodeSync, checkBlockProduction
- poll.ts: Generic pollUntil<T> extracted from bridge-tx pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Create matrix-config and poll helpers** - `315e4e1` (feat)
2. **Task 2: Create stack-resolver and health-checks helpers** - `26c2469` (feat)

## Files Created/Modified
- `tests/e2e/helpers/matrix-config.ts` - Preset/module mapping, stack config from env vars (8 exports)
- `tests/e2e/helpers/poll.ts` - Generic async polling with timeout and logging (1 export)
- `tests/e2e/helpers/stack-resolver.ts` - Backend auth + stack URL resolution (3 exports)
- `tests/e2e/helpers/health-checks.ts` - L2 RPC health verification functions (4 exports)

## Decisions Made
- Used Record<string, unknown> cast pattern consistent with existing bridge-usdc.live.spec.ts
- Default gaming/USDC config matches the existing usdc-gaming test stack
- Local Docker fallbacks cover all 9 service endpoints so tests work without full API metadata

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions contain complete implementations.

## Next Phase Readiness
- All 4 helper modules ready for import by 06-02 (matrix verification specs) and 06-03 (health gate specs)
- 16 exports total covering config, resolution, health, and polling

---
*Phase: 06-live-deployment-matrix*
*Completed: 2026-04-03*
