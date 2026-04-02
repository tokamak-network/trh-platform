---
phase: quick
plan: 260402-hwa
subsystem: release
tags: [release, ci, electron, v1.1.12]
dependency_graph:
  requires: []
  provides: ["v1.1.12 release with latest binaries"]
  affects: ["GitHub Releases"]
tech_stack:
  added: []
  patterns: ["workflow_dispatch release rebuild"]
key_files:
  created: []
  modified: []
decisions:
  - "Delete and recreate release rather than patching existing"
metrics:
  duration: "5min"
  completed: "2026-04-02"
---

# Quick Task 260402-hwa: Rebuild v1.1.12 Release Summary

Deleted stale v1.1.12 GitHub release and triggered CI rebuild from latest main branch HEAD, delivering 3 merged changes (Restart App button, webview balance inject removal, account copy button) as updated platform binaries.

## What Was Done

### Task 1: Delete existing v1.1.12 release and trigger rebuild (auto)

- Deleted existing GitHub release v1.1.12 and its remote/local git tags
- Triggered release.yml workflow via `gh workflow run` with version=v1.1.12
- Confirmed workflow was queued (Run ID: 23882993745)

### Task 2: Verify CI completion and binary uploads (checkpoint:human-verify)

- User approved after CI completed successfully
- Verified release via `gh release view v1.1.12`:
  - TRH.Desktop-1.1.12-arm64.dmg (macOS Apple Silicon)
  - TRH.Desktop-1.1.12.dmg (macOS Intel x64)
  - TRH.Desktop.Setup.1.1.12.exe (Windows x64)
  - TRH.Desktop-1.1.12-x86_64.AppImage (Linux x64)
- Published: 2026-04-02T03:58:01Z

## Changes Included in Rebuilt Release

1. **feat**: Restart App button with container-preserving Electron relaunch (isRelaunching flag)
2. **fix**: Remove balance inject executeJavaScript block from webview.ts
3. **feat**: Account copy button in account selection

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- No source files were modified (release-only task)
- GitHub release v1.1.12 confirmed with 4 assets via `gh release view`
