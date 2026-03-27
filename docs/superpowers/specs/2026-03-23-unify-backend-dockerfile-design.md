# Unify Backend Dockerfile — Build Tools Integration

**Date**: 2026-03-23
**Status**: Approved

## Problem

The TRH backend has two separate Docker images:
- `trh-backend:latest` — minimal API server (no build tools)
- `trh-backend-desktop:latest` — extends base with pnpm, Node.js, Foundry, AWS CLI

During local L2 deployment testing, `trh-backend-desktop` was missing the Go compiler, causing `op-program` build failure (error 127). The workaround was manual installation + `docker commit`, which is not reproducible.

Maintaining two images adds CI complexity and creates gaps (missing Go proved this).

## Solution

Merge all L2 deployment build tools into the base `trh-backend/Dockerfile`. Eliminate the separate desktop image.

### Tools added to base image

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.24.11 (from builder stage) | op-program build |
| Node.js | v20.16.0 (via nvm) | L1 contract JS dependencies |
| pnpm | latest | Package manager for JS |
| Foundry (forge/cast/anvil) | latest | Contract compilation/deployment |

### Tools NOT included (on-demand)

| Tool | Reason |
|------|--------|
| AWS CLI | Only needed for AWS deployments, installed at runtime |
| Terraform | Only needed for AWS deployments, installed at runtime |

## Changes

### 1. `trh-backend/Dockerfile`

Add build tools to the final Ubuntu stage:
- Copy Go binary from builder stage (`COPY --from=builder /usr/local/go /usr/local/go`)
- Install Node.js v20.16.0 via nvm
- Install pnpm
- Install Foundry via foundryup
- Create symlinks in `/usr/local/bin` for all tools
- Update PATH

### 2. `trh-platform/resources/Dockerfile.backend`

Delete this file. No longer needed.

### 3. `trh-backend/.github/workflows/docker-build-push.yml`

Remove the `build-and-push-desktop` job entirely.

### 4. Electron app references

Any code referencing `trh-backend-desktop` image should be updated to use `trh-backend:latest`.

## Architecture

```
Before:
  trh-backend:latest (API only)
    └── trh-backend-desktop:latest (API + tools)

After:
  trh-backend:latest (API + L2 deployment tools)
  AWS CLI/Terraform → installed on-demand when user selects AWS deployment
```
