# Lazy Tool Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install AWS infrastructure tools (Terraform, AWS CLI, kubectl, Helm) in parallel goroutines during L2 deployment, eliminating manual pre-installation and user-perceived delay.

**Architecture:** Four goroutines launched at deployment start download pinned binary versions. Phase 1 work runs concurrently. Each subsequent phase blocks only on its required tools via buffered channels. State files enable resume after failure.

**Tech Stack:** Go (goroutines, sync.Once, atomic.Value, channels), bash (binary downloads), TypeScript (Electron IPC cleanup)

**Spec:** `docs/superpowers/specs/2026-03-24-lazy-tool-installation-design.md`

---

## File Map

### New Files (trh-sdk)

| File | Responsibility |
|------|---------------|
| `pkg/dependencies/versions.go` | Pinned tool version constants + download URL builders |
| `pkg/dependencies/installer.go` | Per-tool install functions + state file management |
| `pkg/stacks/thanos/tool_readiness.go` | Parallel install orchestrator (goroutines, channels, WaitFor) |

### Modified Files (trh-sdk)

| File | Change |
|------|--------|
| `pkg/stacks/thanos/deploy_chain.go:147-165` | Replace 4x `Check*` block with `ToolReadiness` phase-gate |

Note: `dependencies.go` does NOT need modification — version checking is handled entirely by `installer.go`'s `checkBinaryVersion()` + `isToolReady()`. The spec's `CheckWithVersion()` mention is superseded by the installer's internal logic. `ResumableError` is deferred to a follow-up — this plan uses standard `fmt.Errorf` errors. State files already enable resume by skipping installed tools on re-deploy.

### Modified Files (trh-backend)

| File | Change |
|------|--------|
| `docker_install_dependencies_script.sh` | Remove steps 4-7 (Terraform, AWS CLI, Helm, kubectl) |

### Modified Files (trh-platform)

| File | Change |
|------|--------|
| `src/main/docker.ts:65-71` | Remove `aws` field from `BackendDependencies` |
| `src/main/docker.ts:700-718` | Remove `aws` check from `checkBackendDependencies()` |
| `src/main/preload.ts:28-34` | Remove `aws` field from `BackendDependencies` |
| `src/renderer/types.ts:15-21` | Remove `aws` field from `BackendDependencies` |
| `src/renderer/mock/electronAPI.ts:158-164` | Remove `aws` from mock responses |

---

## Task 1: Version Constants and URL Builders

**Repo:** trh-sdk
**Files:**
- Create: `pkg/dependencies/versions.go`

- [ ] **Step 1: Create versions.go with constants and URL functions**

```go
// pkg/dependencies/versions.go
package dependencies

import "fmt"

const (
	TerraformVersion = "1.9.8"
	AwsCLIVersion    = "2.22.0"
	KubectlVersion   = "1.31.4"
	HelmVersion      = "3.16.3"

	InstallTimeoutSeconds = 300 // 5 minutes per tool
	MinDiskSpaceMB        = 700
)

func TerraformDownloadURL(arch string) string {
	return fmt.Sprintf("https://releases.hashicorp.com/terraform/%s/terraform_%s_linux_%s.zip", TerraformVersion, TerraformVersion, arch)
}

func AwsCLIDownloadURL(arch string) string {
	a := "x86_64"
	if arch == "arm64" {
		a = "aarch64"
	}
	return fmt.Sprintf("https://awscli.amazonaws.com/awscli-exe-linux-%s-%s.zip", a, AwsCLIVersion)
}

func KubectlDownloadURL(arch string) string {
	return fmt.Sprintf("https://dl.k8s.io/release/v%s/bin/linux/%s/kubectl", KubectlVersion, arch)
}

func KubectlSha256URL(arch string) string {
	return fmt.Sprintf("https://dl.k8s.io/release/v%s/bin/linux/%s/kubectl.sha256", KubectlVersion, arch)
}

func HelmDownloadURL(arch string) string {
	return fmt.Sprintf("https://get.helm.sh/helm-v%s-linux-%s.tar.gz", HelmVersion, arch)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/theo/workspace_tokamak/trh-sdk && go build ./pkg/dependencies/...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-sdk
git add pkg/dependencies/versions.go
git commit -m "feat: add pinned tool version constants and download URL builders"
```

---

## Task 2: State File Management and Install Functions

**Repo:** trh-sdk
**Files:**
- Create: `pkg/dependencies/installer.go`

- [ ] **Step 1: Create installer.go with state file types and helpers**

```go
// pkg/dependencies/installer.go
package dependencies

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

const stateDir = "/app/storage/.tool-install-state"

type InstallState struct {
	Version   string `json:"version"`
	Status    string `json:"status"` // "installed" or "failed"
	Timestamp string `json:"timestamp"`
}

// readState reads the install state file for a tool. Returns nil if not found or corrupt.
func readState(tool string) *InstallState {
	data, err := os.ReadFile(filepath.Join(stateDir, tool+".json"))
	if err != nil {
		return nil
	}
	var state InstallState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil
	}
	return &state
}

// writeState writes the install state atomically (temp file + rename).
func writeState(tool string, state *InstallState) error {
	if err := os.MkdirAll(stateDir, 0755); err != nil {
		return fmt.Errorf("failed to create state dir: %w", err)
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	tmpFile := filepath.Join(stateDir, tool+".json.tmp")
	finalFile := filepath.Join(stateDir, tool+".json")
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, finalFile)
}

// checkBinaryVersion checks if the binary exists and matches the expected version prefix.
// versionArgs can contain multiple arguments (e.g., "version --client").
func checkBinaryVersion(ctx context.Context, binary, expectedVersion string, versionArgs ...string) bool {
	cmd := exec.CommandContext(ctx, binary, versionArgs...)
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), expectedVersion)
}

// CheckDiskSpace verifies at least minMB of free space is available.
func CheckDiskSpace(path string, minMB int) error {
	cmd := exec.Command("df", "-m", path)
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to check disk space: %w", err)
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return fmt.Errorf("unexpected df output")
	}
	fields := strings.Fields(lines[1])
	if len(fields) < 4 {
		return fmt.Errorf("unexpected df output format")
	}
	available, err := strconv.Atoi(fields[3])
	if err != nil {
		return fmt.Errorf("failed to parse available space: %w", err)
	}
	if available < minMB {
		return fmt.Errorf("insufficient disk space: %dMB available, %dMB required", available, minMB)
	}
	return nil
}

// runShell executes a shell command string, returning combined output.
func runShell(ctx context.Context, script string) (string, error) {
	cmd := exec.CommandContext(ctx, "bash", "-c", script)
	out, err := cmd.CombinedOutput()
	return string(out), err
}
```

- [ ] **Step 2: Add per-tool install functions**

Append to `installer.go`:

```go
// isToolReady checks state file + binary presence + version match.
func isToolReady(ctx context.Context, tool, binary, expectedVersion string, versionArgs ...string) bool {
	state := readState(tool)
	if state == nil || state.Status != "installed" || state.Version != expectedVersion {
		return false
	}
	return checkBinaryVersion(ctx, binary, expectedVersion, versionArgs...)
}

func InstallTerraform(ctx context.Context, logger *zap.SugaredLogger, arch string) error {
	tool := "terraform"
	if isToolReady(ctx, tool, "terraform", TerraformVersion, "--version") {
		logger.Infof("[tool-install] %s@%s: already installed, skipping", tool, TerraformVersion)
		return nil
	}

	logger.Infof("[tool-install] %s@%s: downloading...", tool, TerraformVersion)
	start := time.Now()

	url := TerraformDownloadURL(arch)
	script := fmt.Sprintf(`
		set -e
		cd /tmp
		curl -fsSL -o terraform.zip "%s"
		unzip -o terraform.zip -d /tmp/terraform-extract
		install -o root -g root -m 0755 /tmp/terraform-extract/terraform /usr/local/bin/terraform
		rm -rf terraform.zip /tmp/terraform-extract
	`, url)

	if _, err := runShell(ctx, script); err != nil {
		writeState(tool, &InstallState{Version: TerraformVersion, Status: "failed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
		return fmt.Errorf("terraform installation failed: %w", err)
	}

	if !checkBinaryVersion(ctx, "terraform", TerraformVersion, "--version") {
		return fmt.Errorf("terraform installed but version verification failed")
	}

	writeState(tool, &InstallState{Version: TerraformVersion, Status: "installed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	logger.Infof("[tool-install] %s@%s: installed successfully (%ds)", tool, TerraformVersion, int(time.Since(start).Seconds()))
	return nil
}

func InstallAwsCLI(ctx context.Context, logger *zap.SugaredLogger, arch string) error {
	tool := "aws-cli"
	if isToolReady(ctx, tool, "aws", AwsCLIVersion, "--version") {
		logger.Infof("[tool-install] %s@%s: already installed, skipping", tool, AwsCLIVersion)
		return nil
	}

	logger.Infof("[tool-install] %s@%s: downloading...", tool, AwsCLIVersion)
	start := time.Now()

	url := AwsCLIDownloadURL(arch)
	script := fmt.Sprintf(`
		set -e
		cd /tmp
		curl -fsSL -o awscliv2.zip "%s"
		unzip -o awscliv2.zip
		./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update
		rm -rf aws awscliv2.zip
	`, url)

	if _, err := runShell(ctx, script); err != nil {
		writeState(tool, &InstallState{Version: AwsCLIVersion, Status: "failed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
		return fmt.Errorf("aws-cli installation failed: %w", err)
	}

	if !checkBinaryVersion(ctx, "aws", "aws-cli/"+AwsCLIVersion, "--version") {
		return fmt.Errorf("aws-cli installed but version verification failed")
	}

	writeState(tool, &InstallState{Version: AwsCLIVersion, Status: "installed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	logger.Infof("[tool-install] %s@%s: installed successfully (%ds)", tool, AwsCLIVersion, int(time.Since(start).Seconds()))
	return nil
}

func InstallKubectl(ctx context.Context, logger *zap.SugaredLogger, arch string) error {
	tool := "kubectl"
	if isToolReady(ctx, tool, "kubectl", KubectlVersion, "version", "--client") {
		logger.Infof("[tool-install] %s@%s: already installed, skipping", tool, KubectlVersion)
		return nil
	}

	logger.Infof("[tool-install] %s@%s: downloading...", tool, KubectlVersion)
	start := time.Now()

	binURL := KubectlDownloadURL(arch)
	shaURL := KubectlSha256URL(arch)
	script := fmt.Sprintf(`
		set -e
		cd /tmp
		curl -fsSL -o kubectl "%s"
		curl -fsSL -o kubectl.sha256 "%s"
		echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
		install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
		rm -f kubectl kubectl.sha256
	`, binURL, shaURL)

	if _, err := runShell(ctx, script); err != nil {
		writeState(tool, &InstallState{Version: KubectlVersion, Status: "failed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
		return fmt.Errorf("kubectl installation failed: %w", err)
	}

	if !checkBinaryVersion(ctx, "kubectl", KubectlVersion, "version", "--client") {
		return fmt.Errorf("kubectl installed but version verification failed")
	}

	writeState(tool, &InstallState{Version: KubectlVersion, Status: "installed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	logger.Infof("[tool-install] %s@%s: installed successfully (%ds)", tool, KubectlVersion, int(time.Since(start).Seconds()))
	return nil
}

func InstallHelm(ctx context.Context, logger *zap.SugaredLogger, arch string) error {
	tool := "helm"
	if isToolReady(ctx, tool, "helm", HelmVersion, "version") {
		logger.Infof("[tool-install] %s@%s: already installed, skipping", tool, HelmVersion)
		return nil
	}

	logger.Infof("[tool-install] %s@%s: downloading...", tool, HelmVersion)
	start := time.Now()

	url := HelmDownloadURL(arch)
	script := fmt.Sprintf(`
		set -e
		cd /tmp
		curl -fsSL -o helm.tar.gz "%s"
		tar -xzf helm.tar.gz
		install -o root -g root -m 0755 linux-%s/helm /usr/local/bin/helm
		rm -rf helm.tar.gz linux-%s
	`, url, arch, arch)

	if _, err := runShell(ctx, script); err != nil {
		writeState(tool, &InstallState{Version: HelmVersion, Status: "failed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
		return fmt.Errorf("helm installation failed: %w", err)
	}

	if !checkBinaryVersion(ctx, "helm", HelmVersion, "version") {
		return fmt.Errorf("helm installed but version verification failed")
	}

	writeState(tool, &InstallState{Version: HelmVersion, Status: "installed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	logger.Infof("[tool-install] %s@%s: installed successfully (%ds)", tool, HelmVersion, int(time.Since(start).Seconds()))
	return nil
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/theo/workspace_tokamak/trh-sdk && go build ./pkg/dependencies/...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-sdk
git add pkg/dependencies/installer.go
git commit -m "feat: add per-tool install functions with state file management"
```

---

## Task 3: ToolReadiness Orchestrator

**Repo:** trh-sdk
**Files:**
- Create: `pkg/stacks/thanos/tool_readiness.go`

- [ ] **Step 1: Create tool_readiness.go**

```go
// pkg/stacks/thanos/tool_readiness.go
package thanos

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"

	"github.com/tokamak-network/trh-sdk/pkg/dependencies"
)

type InstallStatus int32

const (
	InstallPending   InstallStatus = iota
	InstallRunning
	InstallCompleted
	InstallFailed
)

type ToolReadiness struct {
	results  map[string]chan error
	statuses map[string]*atomic.Int32
	once     sync.Once
	logger   *zap.SugaredLogger
	arch     string
}

func NewToolReadiness(logger *zap.SugaredLogger, arch string) *ToolReadiness {
	tools := []string{"terraform", "aws-cli", "kubectl", "helm"}
	results := make(map[string]chan error, len(tools))
	statuses := make(map[string]*atomic.Int32, len(tools))
	for _, t := range tools {
		results[t] = make(chan error, 1)
		statuses[t] = &atomic.Int32{}
	}
	return &ToolReadiness{
		results:  results,
		statuses: statuses,
		logger:   logger,
		arch:     arch,
	}
}

func (tr *ToolReadiness) Start(ctx context.Context) {
	tr.once.Do(func() {
		if err := dependencies.CheckDiskSpace("/app/storage", dependencies.MinDiskSpaceMB); err != nil {
			tr.logger.Errorf("[tool-install] %v", err)
			for _, ch := range tr.results {
				ch <- err
			}
			return
		}

		tr.logger.Infof("[tool-install] Starting parallel installation: terraform@%s, aws-cli@%s, kubectl@%s, helm@%s",
			dependencies.TerraformVersion, dependencies.AwsCLIVersion, dependencies.KubectlVersion, dependencies.HelmVersion)

		type toolEntry struct {
			name    string
			install func(context.Context, *zap.SugaredLogger, string) error
		}
		tools := []toolEntry{
			{"terraform", dependencies.InstallTerraform},
			{"aws-cli", dependencies.InstallAwsCLI},
			{"kubectl", dependencies.InstallKubectl},
			{"helm", dependencies.InstallHelm},
		}

		for _, t := range tools {
			go func(name string, install func(context.Context, *zap.SugaredLogger, string) error) {
				tr.statuses[name].Store(int32(InstallRunning))
				installCtx, cancel := context.WithTimeout(ctx, time.Duration(dependencies.InstallTimeoutSeconds)*time.Second)
				defer cancel()

				var err error
				defer func() {
					if err != nil {
						tr.statuses[name].Store(int32(InstallFailed))
					} else {
						tr.statuses[name].Store(int32(InstallCompleted))
					}
					tr.results[name] <- err
				}()

				err = install(installCtx, tr.logger, tr.arch)
			}(t.name, t.install)
		}
	})
}

func (tr *ToolReadiness) WaitFor(ctx context.Context, tools ...string) error {
	for _, tool := range tools {
		ch, ok := tr.results[tool]
		if !ok {
			return fmt.Errorf("unknown tool: %s", tool)
		}
		select {
		case err := <-ch:
			// Put result back so future WaitFor calls for the same tool also work
			ch <- err
			if err != nil {
				return fmt.Errorf("%s: %w", tool, err)
			}
		case <-ctx.Done():
			return fmt.Errorf("context canceled while waiting for %s: %w", tool, ctx.Err())
		}
	}
	tr.logger.Infof("[tool-install] All requested tools ready: %v", tools)
	return nil
}

func (tr *ToolReadiness) Status() map[string]InstallStatus {
	result := make(map[string]InstallStatus, len(tr.statuses))
	for name, v := range tr.statuses {
		result[name] = InstallStatus(v.Load())
	}
	return result
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/theo/workspace_tokamak/trh-sdk && go build ./pkg/stacks/thanos/...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-sdk
git add pkg/stacks/thanos/tool_readiness.go
git commit -m "feat: add ToolReadiness parallel install orchestrator"
```

---

## Task 4: Integrate ToolReadiness into deploy_chain.go

**Repo:** trh-sdk
**Files:**
- Modify: `pkg/stacks/thanos/deploy_chain.go:134-165`

- [ ] **Step 1: Replace bulk dependency check with ToolReadiness startup**

In `deployNetworkToAWS()`, replace lines 145-165 (the 4x `Check*` block):

```go
// BEFORE (lines 145-165):
// Check dependencies
// STEP 1. Verify required dependencies
if !dependencies.CheckTerraformInstallation(ctx) { ... }
if !dependencies.CheckHelmInstallation(ctx) { ... }
if !dependencies.CheckAwsCLIInstallation(ctx) { ... }
if !dependencies.CheckK8sInstallation(ctx) { ... }

// AFTER:
// Start parallel tool installation (non-blocking)
arch, err := dependencies.GetArchitecture(ctx)
if err != nil {
    return fmt.Errorf("failed to detect architecture: %w", err)
}
toolReadiness := NewToolReadiness(t.logger, arch)
toolReadiness.Start(ctx)
```

- [ ] **Step 2: Add WaitFor("terraform") before Phase 2 (Terraform operations)**

Find the line where Terraform operations begin (after repo clone + AWS auth + clearTerraformState). Insert before the first `terraform init`:

```go
// Wait for terraform to be installed before infrastructure provisioning
if err := toolReadiness.WaitFor(ctx, "terraform"); err != nil {
    return fmt.Errorf("tool installation failed before infrastructure provisioning: %w", err)
}
```

This goes after `t.clearTerraformState(ctx)` returns and before the Terraform backend init block.

- [ ] **Step 3: Add WaitFor("aws-cli", "kubectl") before Phase 4 (EKS configuration)**

Find where `aws eks update-kubeconfig` is called. Insert before it:

```go
// Wait for AWS CLI and kubectl before EKS configuration
if err := toolReadiness.WaitFor(ctx, "aws-cli", "kubectl"); err != nil {
    return fmt.Errorf("tool installation failed before EKS configuration: %w", err)
}
```

- [ ] **Step 4: Add WaitFor("helm") before Phase 5 (Helm deployment)**

Find where `helm repo add` or Helm install begins. Insert before it:

```go
// Wait for helm before chart deployment
if err := toolReadiness.WaitFor(ctx, "helm"); err != nil {
    return fmt.Errorf("tool installation failed before Helm deployment: %w", err)
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/theo/workspace_tokamak/trh-sdk && go build ./...`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-sdk
git add pkg/stacks/thanos/deploy_chain.go
git commit -m "feat: replace bulk dependency check with phase-gated ToolReadiness"
```

---

## Task 5: Remove AWS Tools from docker_install_dependencies_script.sh

**Repo:** trh-backend
**Files:**
- Modify: `docker_install_dependencies_script.sh`

- [ ] **Step 1: Remove steps 4-7 (Terraform, AWS CLI, Helm, kubectl)**

Remove the following sections from the script:
- Step 4: Install Terraform (lines 104-116)
- Step 5: Install AWS CLI (lines 118-136)
- Step 6: Install Helm (lines 139-150)
- Step 7: Install kubectl (lines 153-175)

Update `TOTAL_STEPS` from 12 to 8. Renumber remaining steps accordingly.

Also remove from the verification section at the end:
```bash
# Remove these lines:
check_command_version terraform "" "terraform --version"
check_command_version aws "" "aws --version"
check_command_version helm "" "helm version"
check_command_version kubectl "" "kubectl version --client"
```

- [ ] **Step 2: Verify the script is syntactically valid**

Run: `bash -n /Users/theo/workspace_tokamak/trh-backend/docker_install_dependencies_script.sh`
Expected: no syntax errors

- [ ] **Step 3: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-backend
git add docker_install_dependencies_script.sh
git commit -m "refactor: remove AWS tools from dependency script (now handled by trh-sdk lazy install)"
```

---

## Task 6: Remove aws Field from BackendDependencies (trh-platform)

**Repo:** trh-platform
**Files:**
- Modify: `src/main/docker.ts:65-71, 700-718`
- Modify: `src/main/preload.ts:28-34`
- Modify: `src/renderer/types.ts:15-21`
- Modify: `src/renderer/mock/electronAPI.ts:158-164`

- [ ] **Step 1: Update docker.ts interface and checkBackendDependencies()**

In `src/main/docker.ts`, remove `aws` from the interface (line 69):

```typescript
// BEFORE:
export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  aws: boolean;
  allInstalled: boolean;
}

// AFTER:
export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  allInstalled: boolean;
}
```

In `checkBackendDependencies()` (lines 700-718), remove the `aws` check:

```typescript
// BEFORE:
const [pnpm, node, forge, aws] = await Promise.all([
  checkCommand('pnpm'),
  checkCommand('node'),
  checkCommand('forge'),
  checkCommand('aws')
]);
return { pnpm, node, forge, aws, allInstalled: pnpm && node && forge };

// AFTER:
const [pnpm, node, forge] = await Promise.all([
  checkCommand('pnpm'),
  checkCommand('node'),
  checkCommand('forge'),
]);
return { pnpm, node, forge, allInstalled: pnpm && node && forge };
```

- [ ] **Step 2: Update preload.ts interface**

In `src/main/preload.ts` (lines 28-34), remove `aws`:

```typescript
// AFTER:
export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  allInstalled: boolean;
}
```

- [ ] **Step 3: Update renderer/types.ts interface**

In `src/renderer/types.ts` (lines 15-21), remove `aws`:

```typescript
// AFTER:
export interface BackendDependencies {
  pnpm: boolean;
  node: boolean;
  forge: boolean;
  allInstalled: boolean;
}
```

- [ ] **Step 4: Update mock/electronAPI.ts**

In `src/renderer/mock/electronAPI.ts` (lines 158-164), remove `aws`:

```typescript
// BEFORE:
checkBackendDeps: async (): Promise<BackendDependencies> => {
  await delay(400);
  if (SCENARIO === 'dep-missing') {
    return { pnpm: true, node: true, forge: false, aws: false, allInstalled: false };
  }
  return { pnpm: true, node: true, forge: true, aws: true, allInstalled: true };
},

// AFTER:
checkBackendDeps: async (): Promise<BackendDependencies> => {
  await delay(400);
  if (SCENARIO === 'dep-missing') {
    return { pnpm: true, node: true, forge: false, allInstalled: false };
  }
  return { pnpm: true, node: true, forge: true, allInstalled: true };
},
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/theo/workspace_tokamak/trh-platform && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 6: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-platform
git add src/main/docker.ts src/main/preload.ts src/renderer/types.ts src/renderer/mock/electronAPI.ts
git commit -m "refactor: remove aws field from BackendDependencies (now handled by trh-sdk lazy install)"
```

---

## Task 7: Add unzip to trh-backend Dockerfile (if missing)

**Repo:** trh-backend
**Files:**
- Modify: `Dockerfile:23-31`

- [ ] **Step 1: Check if unzip is already in Dockerfile**

Look at the `apt-get install` line in Dockerfile. Current packages: `sudo git build-essential curl wget ca-certificates tzdata`.

`unzip` is needed for Terraform and AWS CLI zip extraction. Add it:

```dockerfile
# BEFORE:
RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo \
    git \
    build-essential \
    curl \
    wget \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# AFTER:
RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo \
    git \
    build-essential \
    curl \
    wget \
    unzip \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 2: Verify Dockerfile builds**

Run: `cd /Users/theo/workspace_tokamak/trh-backend && docker build --target builder -t trh-backend-test .`
Expected: build succeeds (full build not needed, just syntax check via first stage)

- [ ] **Step 3: Commit**

```bash
cd /Users/theo/workspace_tokamak/trh-backend
git add Dockerfile
git commit -m "chore: add unzip to Dockerfile for lazy tool installation"
```

---

## Task 8: Integration Verification

- [ ] **Step 1: Verify trh-sdk builds cleanly**

Run: `cd /Users/theo/workspace_tokamak/trh-sdk && go build ./...`
Expected: no errors

- [ ] **Step 2: Verify trh-platform TypeScript compiles**

Run: `cd /Users/theo/workspace_tokamak/trh-platform && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify docker_install_dependencies_script.sh syntax**

Run: `bash -n /Users/theo/workspace_tokamak/trh-backend/docker_install_dependencies_script.sh`
Expected: no syntax errors

- [ ] **Step 4: Commit final state across all repos**

Ensure all changes are committed in:
- `trh-sdk` (Tasks 1-4)
- `trh-backend` (Tasks 5, 7)
- `trh-platform` (Task 6)
