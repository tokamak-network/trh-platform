# Unify Backend Dockerfile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge L2 deployment build tools (Go, Node.js, pnpm, Foundry) into the base `trh-backend` Dockerfile and eliminate the separate `trh-backend-desktop` image.

**Architecture:** The base Dockerfile's final Ubuntu stage gets additional RUN layers for Go (copied from builder), Node.js (nvm), pnpm, and Foundry. AWS CLI/Terraform are excluded — installed on-demand at runtime. The CI workflow's desktop job is removed, and Electron app references update from `trh-backend-desktop` to `trh-backend`.

**Tech Stack:** Docker, Go 1.24.11, Node.js v20.16.0, pnpm, Foundry

**Spec:** `docs/superpowers/specs/2026-03-23-unify-backend-dockerfile-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `../../trh-backend/Dockerfile` | Modify | Add Go, Node.js, pnpm, Foundry to final stage |
| `resources/Dockerfile.backend` | Delete | No longer needed |
| `../../trh-backend/.github/workflows/docker-build-push.yml` | Modify | Remove `build-and-push-desktop` job |
| `src/main/docker.ts` | Modify | Change `trh-backend-desktop` → `trh-backend` |

---

### Task 1: Add build tools to trh-backend Dockerfile

**Files:**
- Modify: `/Users/theo/workspace_tokamak/trh-backend/Dockerfile`

- [ ] **Step 1: Add build tools to final stage**

Insert the following blocks **between** the existing ENV/PATH block (line 40) and `WORKDIR /app` (line 42). This places tool installation before the app binary copy, so tool layers are cached and only rebuilt when tool versions change.

Note: `NVM_DIR` and `PNPM_HOME` are already set at lines 38-39 of the existing Dockerfile. The PATH at line 40 already includes all tool paths.

```dockerfile
# Copy Go SDK from builder stage (needed for op-program build during L2 deployment)
COPY --from=builder /usr/local/go /usr/local/go

# Install Node.js v20.16.0 via nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install 20.16.0 \
    && nvm use 20.16.0 \
    && nvm alias default 20.16.0

# Install pnpm via npm (installs to nvm node bin directory)
RUN . "$NVM_DIR/nvm.sh" \
    && npm install -g pnpm

# Install Foundry (forge, cast, anvil)
RUN curl -L https://foundry.paradigm.xyz | bash \
    && /root/.foundry/bin/foundryup

# Create symlinks for tools in /usr/local/bin
RUN ln -sf /root/.nvm/versions/node/v20.16.0/bin/node /usr/local/bin/node \
    && ln -sf /root/.nvm/versions/node/v20.16.0/bin/npm /usr/local/bin/npm \
    && ln -sf /root/.nvm/versions/node/v20.16.0/bin/npx /usr/local/bin/npx \
    && ln -sf /root/.nvm/versions/node/v20.16.0/bin/pnpm /usr/local/bin/pnpm \
    && ln -sf /root/.foundry/bin/forge /usr/local/bin/forge \
    && ln -sf /root/.foundry/bin/cast /usr/local/bin/cast \
    && ln -sf /root/.foundry/bin/anvil /usr/local/bin/anvil

# Verify installations
RUN go version \
    && node --version \
    && pnpm --version \
    && forge --version \
    && cast --version \
    && anvil --version
```

- [ ] **Step 2: Build image locally to verify**

Run:
```bash
cd /Users/theo/workspace_tokamak/trh-backend
docker build -t tokamaknetwork/trh-backend:test .
```

Expected: Build completes successfully, verification step shows all tool versions.

- [ ] **Step 3: Verify tools work inside container**

Run:
```bash
docker run --rm tokamaknetwork/trh-backend:test sh -c "go version && node --version && pnpm --version && forge --version"
```

Expected: All four tools print their versions.

- [ ] **Step 4: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-backend
git add Dockerfile
git commit -m "feat: add Go, Node.js, pnpm, Foundry to base Dockerfile

Integrates L2 deployment build tools directly into the base image,
eliminating the need for a separate trh-backend-desktop image."
```

---

### Task 2: Delete Dockerfile.backend

**Files:**
- Delete: `/Users/theo/workspace_tokamak/trh-platform/resources/Dockerfile.backend`

- [ ] **Step 1: Delete the file**

```bash
cd /Users/theo/workspace_tokamak/trh-platform
rm resources/Dockerfile.backend
```

- [ ] **Step 2: Commit**

```bash
git add resources/Dockerfile.backend
git commit -m "chore: remove Dockerfile.backend

No longer needed — build tools are now in the base trh-backend image."
```

---

### Task 3: Remove desktop image CI job

**Files:**
- Modify: `/Users/theo/workspace_tokamak/trh-backend/.github/workflows/docker-build-push.yml`

- [ ] **Step 1: Remove build-and-push-desktop job**

Delete the entire `build-and-push-desktop` job block from the workflow file (everything from `build-and-push-desktop:` to the end of the file). Only the `build-and-push` job should remain.

- [ ] **Step 2: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-backend
git add .github/workflows/docker-build-push.yml
git commit -m "ci: remove desktop image build job

The base trh-backend image now includes all build tools,
so a separate desktop image is no longer needed."
```

---

### Task 4: Update Electron app image reference

**Files:**
- Modify: `/Users/theo/workspace_tokamak/trh-platform/src/main/docker.ts:420`

- [ ] **Step 1: Change image name**

In `src/main/docker.ts`, line 420, change:
```typescript
// Before
'tokamaknetwork/trh-backend-desktop:latest',
// After
'tokamaknetwork/trh-backend:latest',
```

- [ ] **Step 2: Verify no other references remain**

Run:
```bash
grep -r "backend-desktop" /Users/theo/workspace_tokamak/trh-platform/src/
```

Expected: No matches.

- [ ] **Step 3: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-platform
git add src/main/docker.ts
git commit -m "chore: use trh-backend instead of trh-backend-desktop image

The base image now includes all deployment tools."
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Build the unified image**

```bash
cd /Users/theo/workspace_tokamak/trh-backend
docker build -t tokamaknetwork/trh-backend:latest .
```

- [ ] **Step 2: Start services with docker-compose**

```bash
cd /Users/theo/workspace_tokamak/trh-platform
docker compose up -d
```

- [ ] **Step 3: Verify backend is healthy**

```bash
curl -s http://localhost:8000/api/v1/health
```

Expected: Health check response (200 OK).

- [ ] **Step 4: Verify build tools are available inside running container**

```bash
docker exec trh-backend sh -c "go version && node --version && pnpm --version && forge --version"
```

Expected: All tools print versions.
