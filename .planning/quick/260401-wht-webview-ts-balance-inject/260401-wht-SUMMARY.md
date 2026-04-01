---
phase: quick-260401-wht
plan: 01
subsystem: electron-main
tags: [webview, balance-inject, cleanup]
dependency_graph:
  requires: []
  provides: [clean-webview-injection]
  affects: [src/main/webview.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - src/main/webview.ts
decisions:
  - Removed entire balance inject executeJavaScript block (lines 250-348) while preserving account injection and fetchBalance helper
metrics:
  duration: "<1min"
  completed: "2026-04-01"
  tasks_completed: 1
  tasks_total: 1
---

# Quick 260401-wht: Remove Balance Inject from webview.ts

Removed DOM-manipulating balance inject code block that caused floating ETH balance text artifacts on detail pages.

## One-liner

Remove aggressive DOM-querying balance inject (MutationObserver + hookRefreshButton + trh-balance-display) from webview.ts while preserving account injection and IPC balance fetch.

## What Changed

### Task 1: Remove balance inject executeJavaScript block

Removed the entire balance inject block (100 lines) from `injectKeystoreAccounts()` function in `src/main/webview.ts`. This block:
- Installed a `MutationObserver` on `document.body` that persisted across SPA navigation
- Queried all `input`, `span`, `td`, `div`, `p` elements for address matching
- Created `.trh-balance-display` spans with inline styles
- Hooked refresh buttons via DOM traversal

The functionality is already handled natively by trh-platform-ui's AccountSetup.tsx via `window.__TRH_DESKTOP_BALANCES__` and `window.__TRH_DESKTOP__.fetchBalances()`.

**Preserved:**
- `window.__TRH_DESKTOP_ACCOUNTS__` injection (account data for platform UI)
- `fetchBalance` helper function (used by `desktop:fetch-balances` IPC handler at line 508)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 204ed23 | Remove balance inject executeJavaScript block |

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| `TRH_BALANCE_HOOK_INSTALLED` count | 0 | 0 |
| `hookRefreshButton` count | 0 | 0 |
| `trh-balance-display` count | 0 | 0 |
| `MutationObserver` count | 0 | 0 |
| `__TRH_DESKTOP_ACCOUNTS__` count | 1 | 1 |
| `fetchBalance` count | 2 | 2 |
| TypeScript compilation | pass | pass |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
