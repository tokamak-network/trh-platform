---
phase: quick
plan: 260331-le1
subsystem: renderer/mock, scripts
tags: [playwright, screenshots, mock, ui]
dependency_graph:
  requires: []
  provides: [screenshot-capture-script, screenshot-mock-scenarios]
  affects: [src/renderer/mock/electronAPI.ts, src/renderer/types.ts]
tech_stack:
  added: []
  patterns: [scenario-based-mock, playwright-standalone-script]
key_files:
  created:
    - scripts/capture-screenshots.ts
  modified:
    - src/renderer/mock/electronAPI.ts
    - src/renderer/types.ts
decisions:
  - Used standalone chromium.launch() instead of Playwright test runner for script flexibility
  - 10ms delays in screenshot-mode scenarios for fast capture
  - Added cleanPlatform to ElectronAPI type to fix App.tsx compilation
metrics:
  duration: 3min
  completed: 2026-03-31
---

# Quick Task 260331-le1: Playwright Screenshot Capture Script Summary

Playwright standalone script capturing 12 TRH Platform UI states via mock electronAPI scenarios at 2x retina quality

## What Was Done

### Task 1: Enhanced mock electronAPI with screenshot scenarios
- Added `keysetup-input` scenario: setup steps succeed fast, keystore form shows with empty seed input
- Added `keysetup-stored` scenario: setup steps succeed fast, stored addresses table shows
- Added `healthy-update` scenario: healthy Docker + triggers onUpdateAvailable callback after 500ms
- Added `cleanPlatform` method to docker mock (required by App.tsx uninstall flow)
- Added missing SSO methods to awsAuth mock for type completeness
- Added `cleanPlatform` to ElectronAPI interface in types.ts
- Screenshot-mode scenarios use 10ms delays instead of normal delays

### Task 2: Created Playwright screenshot capture script
- 12 screenshots covering all major UI states:
  1. Setup wizard (initial Docker check)
  2. Setup progress (mixed step states)
  3. Keystore input form (empty)
  4. Keys stored (address table)
  5. HD wallet derivation (test mnemonic filled)
  6. Webapp view (version badge)
  7. Update notification banner
  8. Notifications (webapp placeholder)
  9. Uninstall confirmation modal
  10. Port conflict dialog
  11. Setup complete (all steps success)
  12. Gear dropdown menu
- Viewport: 1440x900, deviceScaleFactor: 2 (2880x1800 output)
- Each screenshot independently captured with try/catch
- Console progress reporting with success/failure summary
- Output to `docs/screenshots/`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 17571cb | Add screenshot scenarios to mock electronAPI |
| 2 | 498e1bc | Create Playwright screenshot capture script |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added cleanPlatform to ElectronAPI type**
- **Found during:** Task 1
- **Issue:** App.tsx calls `api.docker.cleanPlatform()` but method was missing from both mock and type definition
- **Fix:** Added to mock and ElectronAPI interface
- **Files modified:** src/renderer/mock/electronAPI.ts, src/renderer/types.ts

**2. [Rule 1 - Bug] Added missing SSO methods to awsAuth mock**
- **Found during:** Task 1
- **Issue:** AwsAuthAPI interface had ssoLoginDirect, ssoListAccounts, ssoListRoles, ssoAssumeRole but mock was missing them
- **Fix:** Added stub implementations to mock
- **Files modified:** src/renderer/mock/electronAPI.ts

## Known Stubs

None - all screenshots capture real UI states via mock scenarios.

## How to Run

```bash
# Terminal 1: Start Vite dev server with mock mode
VITE_MOCK_ELECTRON=true npx vite --port 5174

# Terminal 2: Run screenshot capture
npx tsx scripts/capture-screenshots.ts

# Or one-liner:
VITE_MOCK_ELECTRON=true npx vite --port 5174 & sleep 3 && npx tsx scripts/capture-screenshots.ts; kill %1
```

Output: `docs/screenshots/*.png` (12 files, each 2880x1800 pixels)
