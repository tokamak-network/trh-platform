---
phase: quick
plan: 260401-q1j
subsystem: trh-sdk/thanos-stack
tags: [docker-compose, aa-bundler, race-condition, profile-gating]
dependency_graph:
  requires: []
  provides: [alto-bundler-profile-gating]
  affects: [local-l2-deployment, aa-paymaster-flow]
tech_stack:
  added: []
  patterns: [docker-compose-profiles-for-service-ordering]
key_files:
  created: []
  modified:
    - /Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/templates/local-compose.yml.tmpl
    - /Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/local_network.go
decisions:
  - "Use Docker Compose profiles (not depends_on healthcheck) to gate alto-bundler startup timing"
metrics:
  duration: 1min
  completed: 2026-04-01
---

# Quick Task 260401-q1j: Fix alto-bundler Starting Before Admin Has L2 Funds

Gate alto-bundler behind Docker Compose `aa` profile so it only starts after AA setup (TON bridge + paymaster config) completes, preventing "insufficient funds" errors on PimlicoSimulations deployment.

## Changes

### Task 1: Add `aa` profile to alto-bundler in compose template (1dd3c80)

Added `profiles: [aa]` to the alto-bundler service in `local-compose.yml.tmpl`. This prevents the bundler from starting during `docker compose up -d --profile proposer` (core services). It will only start when explicitly invoked with `--profile aa`.

### Task 2: Start bundler after AA setup and manage aa profile lifecycle (b9bba3e)

Four changes in `local_network.go`:

- **Change A**: After successful `setupAAPaymaster`, explicitly start alto-bundler with `docker compose --profile aa up -d alto-bundler`. Failure logs a warning but does not block the deployment.
- **Change B**: `startLocalModules` includes `--profile aa` when `NeedsAASetup()` is true, so module restarts also bring up the bundler.
- **Change C**: `destroyLocalNetwork` includes `"aa"` in `allProfiles` slice so teardown stops the bundler.
- **Change D**: `writeComposeEnvFile` includes `"aa"` in COMPOSE_PROFILES when `NeedsAASetup()` is true, ensuring Docker Compose auto-restart picks up the bundler.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `go build ./...` passes with no errors
- `grep` confirms `profiles:` present under alto-bundler service
- `grep` confirms `"aa"` appears in all 4 required locations in local_network.go

## Known Stubs

None.

## Self-Check: PASSED
