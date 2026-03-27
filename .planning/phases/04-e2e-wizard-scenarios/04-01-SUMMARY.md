---
phase: 04-e2e-wizard-scenarios
plan: 01
subsystem: testing
tags: [playwright, msw, e2e, next.js, mock-service-worker]

# Dependency graph
requires:
  - phase: 01-foundation-preset-logic
    provides: preset fixture data and API contract schemas
provides:
  - Playwright configuration with webServer pointing to trh-platform-ui
  - MSW mock handlers for 6 wizard API endpoints
  - Auth cookie injection helper for middleware bypass
  - MSWProvider for conditional MSW loading in Next.js App Router
affects: [04-e2e-wizard-scenarios-plan-02]

# Tech tracking
tech-stack:
  added: ["@playwright/test 1.58.2", "msw 2.x (in trh-platform-ui)"]
  patterns: ["MSW browser integration with Next.js App Router", "Playwright auth cookie injection"]

key-files:
  created:
    - playwright.config.ts
    - tests/e2e/helpers/auth.ts
    - ../trh-platform-ui/src/mocks/browser.ts
    - ../trh-platform-ui/src/mocks/handlers.ts
    - ../trh-platform-ui/src/providers/msw-provider.tsx
    - ../trh-platform-ui/public/mockServiceWorker.js
  modified:
    - package.json
    - ../trh-platform-ui/package.json
    - ../trh-platform-ui/src/app/layout.tsx

key-decisions:
  - "MSW handlers use MOCK_PRESETS from trh-platform-ui for data consistency"
  - "MSWProvider wraps entire app before QueryProvider/AuthProvider to prevent race conditions"
  - "fundingScenario mutable flag enables E2E test control of funding status responses"

patterns-established:
  - "Pattern: MSW conditional loading via NEXT_PUBLIC_MSW env var with dynamic import"
  - "Pattern: Auth bypass via Playwright context cookie + localStorage injection"
  - "Pattern: All MSW responses use { data: T, success: true } wrapper"

requirements-completed: [E2E-01, E2E-02, E2E-03, E2E-04]

# Metrics
duration: 4min
completed: 2026-03-27
---

# Phase 04 Plan 01: E2E Infrastructure Summary

**Playwright + MSW E2E test infrastructure with auth bypass, 6 API mock handlers, and conditional MSWProvider in Next.js App Router**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T04:18:32Z
- **Completed:** 2026-03-27T04:22:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Playwright installed with Chromium, configured to auto-start trh-platform-ui dev server via webServer
- MSW service worker + 6 API handlers covering all wizard endpoints (presets, deploy, funding, auth)
- MSWProvider conditionally loads MSW only when NEXT_PUBLIC_MSW=true, zero production impact
- Auth helper injects cookie + localStorage for middleware and axios interceptor bypass

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Playwright + create config and auth helper** - `59c3ce9` (feat)
2. **Task 2: Install MSW in trh-platform-ui and create mock handlers + provider** - `7f32f1b` (feat, in trh-platform-ui repo)

## Files Created/Modified
- `playwright.config.ts` - Playwright config with webServer pointing to ../trh-platform-ui
- `tests/e2e/helpers/auth.ts` - Auth cookie + localStorage injection for Playwright context
- `package.json` - Added @playwright/test devDependency and test:e2e script
- `../trh-platform-ui/src/mocks/handlers.ts` - MSW handlers for 6 wizard API endpoints
- `../trh-platform-ui/src/mocks/browser.ts` - MSW browser worker setup
- `../trh-platform-ui/src/providers/msw-provider.tsx` - Conditional MSW initialization provider
- `../trh-platform-ui/src/app/layout.tsx` - Wrapped children with MSWProvider
- `../trh-platform-ui/public/mockServiceWorker.js` - Auto-generated MSW service worker
- `../trh-platform-ui/package.json` - Added msw devDependency

## Decisions Made
- Used MOCK_PRESETS from trh-platform-ui/src/features/rollup/schemas/preset.ts for MSW handler responses (single source of truth for test data)
- MSWProvider placed as outermost wrapper before QueryProvider/AuthProvider to ensure MSW intercepts all requests before React Query fires
- Exported mutable fundingScenario flag from handlers.ts to enable E2E tests to toggle funding status via page.evaluate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npx msw init requires direct binary execution**
- **Found during:** Task 2 (MSW service worker generation)
- **Issue:** `npx msw init public/ --save` failed with "Missing script: msw" error
- **Fix:** Used `./node_modules/.bin/msw init public/ --save` directly
- **Files modified:** None (tooling issue only)
- **Verification:** public/mockServiceWorker.js generated successfully

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor tooling workaround, no scope change.

## Issues Encountered
None beyond the npx msw init workaround noted above.

## Known Stubs
None - all handlers return complete mock data, MSWProvider is fully wired.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- E2E infrastructure is ready for Plan 02 to write actual wizard flow test scenarios
- Auth bypass helper is available for all E2E tests
- MSW handlers cover all 6 endpoints needed by the 3-step wizard flow
- fundingScenario toggle is ready for E2E-03 funding status verification

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 04-e2e-wizard-scenarios*
*Completed: 2026-03-27*
