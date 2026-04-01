---
phase: quick
plan: 260401-mb9
subsystem: electron-main
tags: [webview, macos, titlebar, ui-fix]
dependency_graph:
  requires: []
  provides: [macos-titlebar-aware-webview-bounds]
  affects: [src/main/webview.ts]
tech_stack:
  added: []
  patterns: [platform-conditional-layout]
key_files:
  created: []
  modified:
    - src/main/webview.ts
decisions:
  - 52px offset chosen to match hiddenInset titlebar with trafficLightPosition y:16 + button size + padding
metrics:
  duration: 45s
  completed: 2026-04-01
---

# Quick Task 260401-mb9: WebContentsView Title Bar Overlap Fix Summary

Platform-aware getViewBounds with 52px macOS title bar offset to prevent WebContentsView from rendering behind hiddenInset traffic lights.

## What Changed

### Task 1: Add macOS title bar offset to getViewBounds

**Commit:** 3416824

Added `MACOS_TITLEBAR_HEIGHT = 52` constant and updated `getViewBounds()` to conditionally apply a y-offset on macOS (`process.platform === 'darwin'`). The height is reduced by the same amount to prevent the view from extending beyond the window bottom. Non-macOS platforms retain the original behavior (y: 0, full height).

**Files modified:**
- `src/main/webview.ts` - Added constant + platform check in getViewBounds()

## Verification

- TypeScript compilation: PASSED (`npx tsc --noEmit --project tsconfig.electron.json`)
- All existing `setBounds` call sites (`showPlatformView`, `attachResizeHandler`) use `getViewBounds()` -- no additional changes needed
- `hidePlatformView` uses zero-size rect for hiding -- unaffected

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.
