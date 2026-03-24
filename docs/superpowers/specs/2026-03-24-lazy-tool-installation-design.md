# Lazy Tool Installation for AWS L2 Deployment

**Date**: 2026-03-24
**Status**: Draft
**Scope**: trh-sdk (core), trh-backend (minor), trh-platform (minor)

## Problem

When deploying L2 to AWS from the Electron app, four infrastructure tools (Terraform, AWS CLI, kubectl, Helm) must be present inside the `trh-backend` Docker container. Currently:

1. `deploy_chain.go` checks all four tools at the start and fails immediately if any is missing
2. `docker_install_dependencies_script.sh` installs all 12 tools at once, including those only needed for AWS
3. Local deployments pay no tool installation cost (tools are in the Docker image), but AWS deployments have no automated installation path — tools must be pre-installed manually

## Solution: Eager Background Install

Start parallel installation of all four AWS tools as goroutines when AWS deployment begins. Phase 1 (validation, repo cloning, config generation) runs concurrently. Each subsequent phase waits only for its required tools before proceeding.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target environment | Container only | Electron app runs trh-sdk inside trh-backend Docker container |
| Failure handling | Preserve progress + resumable | `ResumableError` records failed phase; re-deploy skips completed phases |
| UI treatment | Background, deploy logs only | SDK log stream already surfaces in Electron deploy view |
| Version strategy | Pinned versions | Reproducibility; versions stored in `versions.go` constants |
| Install method | All binary download (no apt-get) | Avoids apt-get lock contention between parallel goroutines |
| Channel type | Buffered (size 1) | Prevents goroutine leak if WaitFor is never called |
| State file path | `/app/storage/.tool-install-state/` | Persists across container recreation via Docker volume |
| Concurrency guard | `sync.Once` per ToolReadiness | Prevents duplicate install goroutines on double-trigger |

## Architecture

### Deployment Flow with Lazy Install

```
deployNetworkToAWS() entry
  |
  +-- StartToolInstallation()  <-- 4 goroutines launched
  |    +-- go InstallTerraform()
  |    +-- go InstallAwsCLI()
  |    +-- go InstallKubectl()
  |    +-- go InstallHelm()
  |
  +-- Phase 1: input validation, repo clone, config generation (parallel with install)
  |
  +-- WaitFor("terraform")  <-- blocks until ready
  +-- Phase 2-3: Terraform infrastructure provisioning
  |
  +-- WaitFor("aws-cli", "kubectl")  <-- blocks until ready
  +-- Phase 4: EKS configuration
  |
  +-- WaitFor("helm")  <-- blocks until ready
  +-- Phase 5+: Helm deployment
```

### ToolReadiness Orchestrator

```go
// pkg/stacks/thanos/tool_readiness.go

type InstallStatus int

const (
    InstallPending   InstallStatus = iota
    InstallRunning
    InstallCompleted
    InstallFailed
)

type ToolReadiness struct {
    results  map[string]chan error  // per-tool completion channel (buffered, size 1)
    statuses map[string]*atomic.Value // per-tool InstallStatus
    once     sync.Once
    logger   *zap.SugaredLogger
}

func NewToolReadiness(ctx context.Context, logger *zap.SugaredLogger) *ToolReadiness
func (tr *ToolReadiness) Start(ctx context.Context)         // launch 4 goroutines (idempotent via sync.Once)
func (tr *ToolReadiness) WaitFor(tools ...string) error     // block until tools ready (with ctx + 5min timeout)
func (tr *ToolReadiness) Status() map[string]InstallStatus  // current state query
```

### Per-Tool Install Logic

Each goroutine follows the same pattern:

1. Check state file (`/app/storage/.tool-install-state/<tool>.json`) — already installed? skip
2. Check binary (`which <tool>`) + version match — already present? record state, skip
3. Execute installation (binary download — no apt-get to avoid lock contention)
4. Verify installation (`<tool> --version`)
5. Write state file atomically (write to temp file, then `os.Rename`)
6. Send result to channel via `defer` — guarantees channel always receives (prevents goroutine leak)

Each goroutine respects context cancellation and has a 5-minute individual timeout.
`WaitFor` uses `select` on both the result channel and `ctx.Done()` to avoid indefinite blocking.

### ResumableError

```go
type ResumableError struct {
    Phase int
    Cause error
}
```

On failure, records which phase stopped. On re-deploy, completed phases are skipped based on deploy config state + tool install state files.

## Tool Versions and Installation

### Pinned Versions

```go
// pkg/dependencies/versions.go
const (
    TerraformVersion = "1.9.8"
    AwsCLIVersion    = "2.22.0"
    KubectlVersion   = "1.31.4"
    HelmVersion      = "3.16.3"
)
```

### Installation Methods (Ubuntu container)

All tools use direct binary download (no apt-get) to enable true parallel installation without lock contention.

| Tool | Method | URL Pattern | Time | Size |
|------|--------|-------------|------|------|
| Terraform 1.9.8 | Zip download + unzip | `releases.hashicorp.com/terraform/{ver}/terraform_{ver}_linux_{arch}.zip` | ~15s | ~80MB |
| AWS CLI 2.22.0 | Zip download + install script | `awscli.amazonaws.com/awscli-exe-linux-{arch}.zip` | ~40s | ~120MB |
| kubectl 1.31.4 | Binary download + sha256 verify | `dl.k8s.io/release/v{ver}/bin/linux/{arch}/kubectl` | ~10s | ~50MB |
| Helm 3.16.3 | Tarball download + extract | `get.helm.sh/helm-v{ver}-linux-{arch}.tar.gz` | ~10s | ~50MB |

Prerequisites: `curl` and `unzip` must be available in the container. Both are already installed in the `trh-backend` Dockerfile (`curl` via apt-get, `unzip` to be added if missing).

### Install State Files

```
/app/storage/.tool-install-state/
  terraform.json    {"version": "1.9.8", "status": "installed", "timestamp": "..."}
  aws-cli.json      {"version": "2.22.0", "status": "installed", "timestamp": "..."}
  kubectl.json      {"version": "1.31.4", "status": "installed", "timestamp": "..."}
  helm.json         {"version": "3.16.3", "status": "installed", "timestamp": "..."}
```

Path is under `/app/storage/` (Docker volume `trh_backend_storage`) so state persists across container recreation. Note: state file persistence + binary absence (after container recreate) is handled correctly — resume logic always re-verifies with `which` + version check.

State files are written atomically (temp file + `os.Rename`) to prevent corruption on process interruption.

Resume logic: file exists + version matches + `which` succeeds = skip. Any mismatch = reinstall.

## Error Handling

| Scenario | Handling | User Message |
|----------|----------|-------------|
| Network failure (download) | `ResumableError{Phase: N}`, state file `"status": "failed"` | `"Terraform installation failed: network error. Re-run deploy to resume from Phase N"` |
| Insufficient disk | Pre-check via `df` (minimum 700MB for peak usage), skip install if insufficient | `"Insufficient disk space for AWS tools (~700MB required during installation)"` |
| Install succeeds, verification fails | No state file written, reinstall on retry | `"Terraform installed but version verification failed"` |
| Terraform crash during Phase 2-3 | Existing Terraform error handling (unchanged) | Existing error messages |
| Context canceled (user abort) | Goroutines exit via ctx.Done(), partial install preserved | `"Deployment canceled"` |
| Individual tool timeout (5min) | Goroutine returns timeout error, other tools unaffected | `"Terraform installation timed out after 5 minutes"` |
| Duplicate deploy trigger | `sync.Once` prevents second goroutine set; reuses existing channels | No additional message (transparent) |

## Log Format

```
[tool-install] Starting parallel installation: terraform@1.9.8, aws-cli@2.22.0, kubectl@1.31.4, helm@3.16.3
[tool-install] terraform@1.9.8: downloading...
[tool-install] kubectl@1.31.4: already installed, skipping
[tool-install] helm@3.16.3: installing...
[tool-install] terraform@1.9.8: installed successfully (32s)
[tool-install] aws-cli@2.22.0: installed successfully (41s)
[tool-install] helm@3.16.3: installed successfully (8s)
[tool-install] All tools ready
```

## Changed Files

### trh-sdk (core changes)

| File | Type | Content |
|------|------|---------|
| `pkg/dependencies/versions.go` | New | Tool version constants |
| `pkg/dependencies/installer.go` | New | `InstallTerraform()`, `InstallAwsCLI()`, `InstallKubectl()`, `InstallHelm()` + state file management |
| `pkg/dependencies/dependencies.go` | Modified | Add version comparison to existing `Check*` functions |
| `pkg/stacks/thanos/tool_readiness.go` | New | `ToolReadiness` orchestrator |
| `pkg/stacks/thanos/deploy_chain.go` | Modified | Replace bulk check (lines 147-165) with `ToolReadiness` phase-gate pattern |
| `pkg/types/errors.go` | Modified | Add `ResumableError` type |

### trh-backend (minor)

| File | Type | Content |
|------|------|---------|
| `docker_install_dependencies_script.sh` | Modified | Remove steps 4-7 (Terraform, AWS CLI, Helm, kubectl) — now handled by trh-sdk lazy install |

### trh-platform (minor)

| File | Type | Content |
|------|------|---------|
| `src/main/docker.ts` | Modified | Remove `aws` field from `checkBackendDeps()` — not needed at setup stage |
| `src/main/preload.ts` | Modified | Remove `aws` from `BackendDependencies` interface |
| `src/renderer/types.ts` | Modified | Remove `aws` from `BackendDependencies` type definition |

### Unchanged Files

| File | Reason |
|------|--------|
| `trh-backend/Dockerfile` | Node.js, pnpm, Go, Foundry already included; AWS tools handled at runtime by SDK |
| `trh-platform/install.sh` | Host machine script, unrelated to container |
| `trh-platform/setup.sh` | Existing dependency verification unchanged |
| SetupPage.tsx | Deploy log streaming sufficient, no UI changes |

### Summary

- New: 3 files
- Modified: 7 files
- Total: 10 files
