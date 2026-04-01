---
phase: quick
plan: 260402-1yh
subsystem: trh-backend-routes, trh-sdk-local-network
tags: [bugfix, route-auth, aa-profile, compose-profiles]
dependency_graph:
  requires: []
  provides: [authenticated-metadata-dao-read, deferred-aa-profile]
  affects: [trh-backend-api, trh-sdk-local-deploy]
tech_stack:
  added: []
  patterns: [deferred-profile-persistence]
key_files:
  created: []
  modified:
    - /Users/theo/workspace_tokamak/trh-backend/pkg/api/routes/route.go
    - /Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/local_network.go
decisions:
  - "persistAAProfile uses line-based COMPOSE_PROFILES= parsing instead of naive string append"
metrics:
  duration: 85s
  completed: 2026-04-02
---

# Quick Task 260402-1yh: trh-backend Route and trh-sdk AA Profile Fix

Two cross-repo bugfixes: moved GET register-metadata-dao to authenticatedRoutes for non-admin access, and deferred "aa" COMPOSE_PROFILES inclusion until alto-bundler setup actually succeeds to prevent crash loops on restart.

## Commits

| # | Hash | Repo | Message |
|---|------|------|---------|
| 1 | `5958e16` | trh-backend | fix(quick-260402-1yh): move GetRegisterMetadataDAO GET to authenticatedRoutes |
| 2 | `2c5a274` | trh-sdk | fix(quick-260402-1yh): defer aa profile in COMPOSE_PROFILES until setup succeeds |

## Task Results

### Task 1: Move GetRegisterMetadataDAO GET to authenticatedRoutes

- Removed GET route from adminRoutes block (line 200)
- Added to authenticatedRoutes block before wildcard `/:id/integrations/:integrationId`
- POST register-metadata-dao remains admin-only

### Task 2: Defer AA profile in COMPOSE_PROFILES until setup succeeds

- **Change A**: Removed "aa" profile from `writeComposeEnvFile` -- .env no longer includes "aa" at generation time
- **Change B**: Removed "aa" profile from `startLocalModules` -- no `--profile aa` flag on initial module startup
- **Change C**: Added `persistAAProfile` helper called after alto-bundler starts successfully -- rewrites COMPOSE_PROFILES line in .env to append ",aa"
- Flow: Initial deploy has no "aa" in .env -> AA setup runs -> bundler started explicitly -> .env updated with "aa" -> future restarts include alto-bundler

## Deviations from Plan

### Implementation Adjustment

**persistAAProfile**: Plan suggested a naive single-line approach (`strings.Replace(content, "\n", "", -1)` + append). Implemented line-based COMPOSE_PROFILES parsing instead, which correctly handles multi-line .env files and finds the specific `COMPOSE_PROFILES=` line to append to. This is more robust for real .env files that may contain other variables in the future.

## Verification

- `grep -n "register-metadata-dao" route.go`: POST on adminRoutes (line 199), GET on authenticatedRoutes (line 248)
- `grep -n '"aa"' local_network.go`: only in destroyLocalNetwork (cleanup), explicit bundler start, and persistAAProfile
- Both repos compile: `go build ./...` passes

## Known Stubs

None.
