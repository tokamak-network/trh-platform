# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TRH Platform** is a Docker Compose-based full-stack application with AWS EC2 cloud deployment capabilities. It consists of a PostgreSQL database, Node.js backend API, and Next.js frontend UI, managed via Terraform for infrastructure provisioning.

## Architecture

### Local Development (Docker Compose)

The application is containerized using `docker-compose.yml` with three core services:

- **Database**: PostgreSQL 15 (port 5432)
  - Uses `config/.env.backend` for database credentials
  - Persistent data stored in `postgres_data` volume
- **Backend**: trh-backend Docker image (port 8000)
  - Node.js API service
  - Environment: `config/.env.backend`
  - Persistent storage in `backend_storage` volume
  - Auto-restarts unless manually stopped
- **Frontend**: trh-platform-ui Docker image (port 3000)
  - Next.js web interface
  - Environment: `config/.env.frontend`
  - Depends on backend service
  - Auto-restarts unless manually stopped

### Cloud Deployment (AWS EC2 + Terraform)

The `ec2/` directory contains Terraform configuration for automated EC2 provisioning:

- **main.tf**: Instance, security group, and key pair definitions
  - Uses Ubuntu 24.04 LTS AMI
  - Provisions EC2 instance with 50GB encrypted root volume
  - Remote provisioning executes `install.sh` (node setup) + `make setup` (service startup)
- **variables.tf**: Input variables for instance type, names, credentials
- **outputs.tf**: Terraform outputs (instance IP, DNS)
- **terraform.tfstate**: State file (auto-generated, tracked in .git)
- **setup.sh**: Generates SSH key pairs and stores configuration in `ec2/.env`

Security group opens:
- SSH (port 22) from 0.0.0.0/0
- Frontend (port 3000) from 0.0.0.0/0
- Backend (port 8000) from 0.0.0.0/0

## Development Workflow

### Initial Setup

```bash
make setup        # Starts containers and runs backend initialization
```

This command:
1. Creates `config/.env.docker` from template if it doesn't exist
2. Runs `docker compose up -d`
3. Executes `setup.sh` to configure backend container

### Configuration Files

All environment variables are managed through templates in `config/`:

- **env.docker.template**: Docker image versions (TRH_BACKEND_VERSION, TRH_PLATFORM_UI_VERSION)
- **env.backend.template**: Backend service config (PostgreSQL connection, JWT secret, default admin)
- **env.frontend.template**: Frontend config (NEXT_PUBLIC_API_BASE_URL)

These are copied to `.env.*` files by `make config` or `make setup`.

### Common Commands

**Service Management**:
```bash
make up          # Start all services (docker compose up -d)
make down        # Stop and remove containers (with confirmation)
make clean       # Stop services and remove volumes
make status      # Show running container status
make logs        # Stream all service logs
make update      # Pull latest Docker images and restart
make config      # Interactive environment configuration
```

**EC2 Deployment**:
```bash
make ec2-setup      # Configure AWS credentials and SSH keys (one-time)
make ec2-deploy     # Full deployment: infrastructure + platform setup
make ec2-update     # Update running instance (git pull + docker pull + restart)
make ec2-status     # Show Terraform state and instance info
make ec2-destroy    # Terminate all resources
make ec2-clean      # Remove Terraform state files
```

## Key Files and Responsibilities

| File | Purpose |
|------|---------|
| Makefile | All operations: dev, docker, EC2 lifecycle, configuration |
| docker-compose.yml | Service orchestration with image digests (pinned for reproducibility) |
| ec2/main.tf | EC2 instance, security group, key pair resources |
| ec2/setup.sh | SSH key generation and AWS credential setup |
| setup.sh | Backend container initialization (installs dependencies) |
| install.sh | EC2 user-data script (installs git, docker, terraform, aws-cli) |
| config/ | Environment templates and config files |

## Critical Patterns

### Image Digests

Docker images use content-based digests (SHA256) instead of tags:
```yaml
image: tokamaknetwork/trh-backend@sha256:fe7cb41cb852cfc955d4ac21bbd5917c7e505affba475a166abd2e43fb2375be
```
This ensures reproducible deployments. Update digests when upgrading service versions.

### EC2 Provisioning Flow

1. **EC2 Setup** (one-time): `make ec2-setup` → AWS credentials + SSH key pair → stored in `ec2/.env`
2. **EC2 Deploy**: `make ec2-deploy` → Terraform init/plan/apply → Remote provisioning:
   - Cloud-init waits for instance readiness
   - `install.sh` installs tools (git, docker, terraform, aws-cli)
   - Repository cloned from GitHub
   - `make config` generates environment files
   - `make setup` starts services in the instance
3. **EC2 Update**: `make ec2-update` → SSH into instance → `git pull` → `docker compose pull` → restart services

### State Management

- **Terraform state**: `ec2/terraform.tfstate` - critical for infrastructure management
- **Environment config**: `ec2/.env` - Terraform variables, regenerated by `make ec2-deploy`
- Destroyed infrastructure cleans up state files automatically

### Error Recovery

**Deployment fails with credentials mismatch**: AWS account in current credentials must match the account that created the resources. Use `make ec2-setup` to reconfigure credentials.

**Partial EC2 failures**: Check `make ec2-status` to verify if instance exists. Can manually SSH in and complete setup, or destroy + retry.

## Configuration Precedence

1. `config/.env.docker` - Docker image versions
2. `config/.env.backend` - Backend & database config (PostgreSQL, JWT, admin)
3. `config/.env.frontend` - Frontend config (API URL)
4. `ec2/.env` - Terraform variables (only during EC2 deployment)

Frontend must know backend IP/URL for API calls. On EC2, this is automatically set by Terraform provisioning.

## Service Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **PostgreSQL**: localhost:5432 (default: postgres/postgres)

Default admin credentials from `config/.env.backend`:
- Email: admin@gmail.com
- Password: admin

## Troubleshooting Checklist

- Services won't start: Check `make logs` for errors, ensure Docker is running
- Database connection fails: Verify `config/.env.backend` has correct PostgreSQL credentials
- Frontend can't reach backend: Check `NEXT_PUBLIC_API_BASE_URL` in `config/.env.frontend`
- EC2 deployment times out: SSH provisioning may be slow, check `make ec2-status` for instance health
- Terraform state corrupted: Run `make ec2-clean` and retry deployment (will destroy existing resources)

## Daily Report Generation

Supports Anthropic Claude API and OpenAI-compatible APIs (Qwen, vLLM, Ollama, etc.). Auto-detects provider based on which API key is set.

### Quick Command

```bash
# Anthropic Claude
export ANTHROPIC_API_KEY="sk-ant-..."
export CLAUDE_MODEL="claude-3-5-sonnet-20241022"  # (Optional, defaults to claude-opus-4-6)
make daily-report

# OpenAI-compatible (Qwen example)
export OPENAI_API_KEY="sk-..."
export API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode"
export OPENAI_MODEL="qwen-plus"
make daily-report
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (priority 1) | - |
| `OPENAI_API_KEY` | OpenAI-compatible API key (priority 2) | - |
| `API_BASE_URL` / `OPENAI_BASE_URL` | Custom API server URL | Anthropic: `https://api.anthropic.com`, OpenAI: `https://api.openai.com` |
| `CLAUDE_MODEL` | Anthropic model name | `claude-opus-4-6` |
| `OPENAI_MODEL` | OpenAI-compatible model name | `gpt-4o` |

**Output**: `docs/daily-reports/YYYY-MM-DD.md`

**Note**: Daily reports contain sensitive information (IPs, costs) and are excluded from git (.gitignore).

## Git Workflow

The repository uses Conventional Commits format. All branches should follow the pattern:
- `test/mainnet-phase1` - test/feature branches
- `main` - production release branch

Terraform state files (terraform.tfstate*) are committed to git for infrastructure version tracking. Do not remove from .gitignore.

## Project

**TRH Preset Deployment Test Harness**

TRH 플랫폼의 4가지 Preset(General, DeFi, Gaming, Full) 배포 흐름을 실제 L1/L2 통신 없이 mock 기반으로 검증하는 테스트 suite. Electron → Platform UI → Backend API → trh-sdk 전 구간의 로직 정합성을 단위/통합/E2E 테스트로 커버한다.

**Core Value:** 각 Preset이 올바른 genesis config, predeploys, 모듈 구성, 체인 파라미터를 생성하는지 자동으로 검증할 수 있어야 한다.

### Constraints

- **Tech stack**: TypeScript/Vitest (unit/integration), Playwright (E2E) — trh-platform이 Electron + TypeScript 기반
- **Mock boundary**: 모든 외부 의존성(L1/L2 RPC, Docker, Helm, AWS)은 mock/stub 처리
- **Location**: 모든 테스트 코드는 `trh-platform/tests/` 디렉토리에 위치
- **Dependencies**: 4개 저장소(trh-platform, trh-sdk, trh-backend, trh-platform-ui)의 코드를 참조하되, 테스트 실행은 trh-platform에서 수행

## Technology Stack

## Languages
- TypeScript 5.9.3 - Full codebase (main process, renderer, tests)
- React 19.2.4 - UI components in renderer process
- JavaScript (auto-generated from TypeScript compilation)
## Runtime
- Node.js 18.0.0+ (specified in `package.json` engines field)
- Electron 33.0.0 - Desktop application framework
- npm (lockfile: `package-lock.json` present)
## Frameworks
- Electron 33.0.0 - Desktop application runtime (`src/main/index.ts` uses electron APIs)
- React 19.2.4 - UI framework (`src/renderer/main.tsx` entry point)
- Vite 7.3.1 - Renderer build tool (config: `vite.config.ts`)
- TypeScript 5.9.3 - Type checking
- Vitest 4.1.0 - Test runner and assertion library
- Testing Library 6.9.1+
- JSDOM 29.0.1 - DOM environment for tests
- Happy DOM 20.8.4 - Lightweight DOM alternative for tests
- electron-builder 25.1.8 - Packaging and distribution
- Concurrently 9.2.1 - Run multiple commands in parallel during development
## Key Dependencies
- ethers 6.13.4 - Blockchain library (`src/main/keystore.ts`)
- @aws-sdk/client-sso-oidc 3.1013.0 - AWS SSO OIDC authentication
- @aws-sdk/client-sso 3.1013.0 - AWS SSO credential retrieval
- React DOM 19.2.4 - React DOM rendering
- Node.js built-ins: fs, path, os, child_process, net, https, http
## Configuration
- Template files in `config/`:
- Vite env prefix: `VITE_` (defined in `vite.config.ts`)
- Mock mode: `VITE_MOCK_ELECTRON=true` bypasses Electron for browser testing
- Vite config: `vite.config.ts`
- TypeScript configs:
- Electron Builder config embedded in `package.json`
## Platform Requirements
- macOS, Windows, or Linux
- Docker and Docker Compose (for backend services)
- Node.js 18+
- npm
- macOS 10.13+ (Intel/Apple Silicon)
- Windows 10+ (x64)
- Linux (x64)
- Backend: Docker containers (PostgreSQL 15, trh-backend, trh-platform-ui)
## Build Outputs
- Main process: `dist/main/index.js` (compiled from TypeScript)
- Renderer: `dist/renderer/` (Vite bundled React app)
- Packaged binaries: `release/` directory (created by electron-builder)

## Conventions

## Naming Patterns
- Electron main process: camelCase (e.g., `docker.ts`, `aws-auth.ts`, `keystore.ts`)
- React components: PascalCase (e.g., `SetupPage.tsx`, `ConfigPage.tsx`, `StepItem.tsx`)
- Type files: PascalCase with types suffix or explicit names (e.g., `types.ts`)
- Test files: match source name with `.test` extension (e.g., `SetupPage.test.tsx`, `aws-auth.test.ts`)
- CSS files: match component/page name (e.g., `SetupPage.css`, `StepItem.css`)
- camelCase for all function names
- Async functions commonly prefixed with action words: `check`, `get`, `load`, `start`, `stop`, `install`, `pull`
- Examples: `checkInstalled()`, `getDockerStatus()`, `startContainers()`, `killPortProcesses()`
- camelCase for all variables
- Boolean variables often prefix with `is`, `has`, `show`, `can` (e.g., `isDockerInstalled`, `hasSeedPhrase`, `showKeySetup`)
- State variables with `set` prefix for React setState functions (e.g., `setViewMode`, `setError`, `setCredentials`)
- Callback handlers prefix with `handle` or `on` (e.g., `handleConfigDone`, `onComplete`)
- PascalCase for all type names (e.g., `DockerStatus`, `StepStatus`, `PortConflict`, `ElectronAPI`)
- Interface names do not use `I` prefix
- Union types use camelCase when stored in variables (e.g., `ViewMode = 'config' | 'setup' | 'webapp' | 'notifications'`)
- Literal string types for discriminant unions (e.g., `StepStatus = 'pending' | 'loading' | 'success' | 'error'`)
- UPPER_SNAKE_CASE for module-level constants (e.g., `UPDATE_CHECK_INTERVAL_MS`, `REQUIRED_PORTS`, `COMMAND_TIMEOUT`)
- camelCase for constants within function scope or descriptive object keys
## Code Style
- No explicit eslint/prettier config files detected
- Consistent 2-space indentation throughout codebase
- Semicolons required (enforced by TypeScript strict mode)
- Quote style: single quotes for strings, backticks for templates
- TypeScript strict mode enabled in both `tsconfig.electron.json` and `tsconfig.renderer.json`
- Compiler options: `strict: true`, `esModuleInterop: true`, `forceConsistentCasingInFileNames: true`
- No separate ESLint configuration files present
- Strict TypeScript everywhere: `strict: true` in all configs
- All function parameters and return types explicitly typed
- No implicit `any` allowed
- Union types preferred over optional fields where semantically appropriate
## Import Organization
- No path aliases configured
- Relative imports used throughout (e.g., `import StepItem from '../components/StepItem'`)
- Explicit relative paths with `../` for parent directory navigation
- Barrel files (`index.ts`) not used; direct imports from source files preferred
- Each module exports specific functions/interfaces without default exports (with exception of React components)
- React components use default export pattern
- Utility modules use named exports
## Error Handling
- Explicit `try-catch` blocks for error-prone operations
- Error messages descriptive and specific to failure context
- Runtime validation before operations (e.g., checking port availability, validating mnemonics)
- Promise rejection handling with proper error propagation
- For React components: error state managed via `useState` with error object containing `{ title, message }`
- Example from `SetupPage.tsx`: `const [error, setError] = useState<{ title: string; message: string } | null>(null)`
- Electron IPC handlers throw specific errors that propagate to renderer process
- BDD-style error assertions in tests: `expect(mockFn).toHaveBeenCalledWith(expectedValue)`
- Early return pattern used extensively (e.g., `if (!installed) { ... return; }`)
- Null/undefined checks before operations
- Type guards used with `instanceof Error` pattern: `error instanceof Error ? error.message : 'Unknown error'`
## Logging
- `console.warn()` for non-critical issues
- `console.error()` for exceptions and failures
- Logging callback pattern in electron: `setLogCallback()` function allows main process to stream logs to renderer
- Example: `setLogCallback((line: string) => { mainWindow?.webContents.send('docker:log', line); })`
- Test logging in `docker.ts`: `emitLog()` internal function trims and filters empty lines before callback
## Comments
- Complex algorithms or non-obvious logic (e.g., Docker port detection with fallback strategy)
- Boundary conditions and timeout constants with rationale
- Section separators for major logical blocks (e.g., `// ---------------------------------------------------------------------------`)
- Type definitions followed by inline documentation in types (not separate comments)
- Very rarely used; code preferred to be self-documenting through naming
- Not used; TypeScript interfaces and type signatures are self-documenting
- Function names and parameters are sufficiently descriptive
## Function Design
- No strict function size limit enforced
- Complex multi-step operations kept together in single function with clear step comments
- Example: `runSetup()` in `SetupPage.tsx` contains 6-step Docker/backend initialization
- Destructuring used for React component props
- Named objects preferred over multiple parameters for option-like arguments
- Example: `function createWindow()` takes no parameters; configuration is hardcoded
- IPC handlers use `(_event, ...args)` pattern where event is unused but TypeScript-required
- Promises extensively used for async operations
- `void` return type for event handlers and callbacks
- Discriminant unions for complex state (e.g., `PortModalState = { open: false } | { open: true; conflicts: PortConflict[]; resolve: ... }`)
- Generic promise resolution: `Promise<T>` where T is clearly typed
## Module Design
- Mix of named and default exports
- React components use default exports: `export default function SetupPage(...)`
- Utility modules use named exports: `export function checkInstalled(): boolean`
- Type-only exports for interfaces: `export interface DockerStatus { ... }`
- Electron module re-exports aggregated from multiple sub-modules (e.g., `index.ts` imports from `docker.ts`, `keystore.ts`, etc.)
- Not used; direct imports from source files preferred throughout codebase
- Main process logic isolated in `src/main/` (Electron, Docker, filesystem operations)
- Renderer process logic isolated in `src/renderer/` (React components, UI state)
- Type definitions centralized in `src/renderer/types.ts` for cross-process contracts
- Test files co-located with source (`.test.tsx` or `.test.ts` extension)

## Architecture

## Pattern Overview
- Two-process isolation: Main process (Node.js) handles system operations, renderer process (React) handles UI
- Preload-based security: Context isolation with exposed ElectronAPI via preload script
- Embedded web view: localhost:3000 platform UI runs in a WebContentsView within the Electron window
- Service-focused main process: Docker operations, key management, AWS authentication are separate modules
- IPC-driven: All renderer-main communication through ipcRenderer/ipcMain with explicit handlers
## Layers
- Purpose: React-based user interface for desktop app configuration, setup, and notifications
- Location: `src/renderer/`
- Contains: React components (pages, reusable components), styles, type definitions, mock APIs
- Depends on: ElectronAPI (via preload), local state management (hooks)
- Used by: Electron window (BrowserWindow)
- Purpose: Manages Docker containers, keystore encryption, AWS authentication, network security
- Location: `src/main/`
- Contains: Modular service files (docker.ts, keystore.ts, aws-auth.ts, network-guard.ts), IPC handlers, preload scripts
- Depends on: Electron APIs, child_process for Docker CLI, @aws-sdk for AWS auth, ethers for key derivation
- Used by: Renderer process via IPC, Tray menu
- Purpose: Securely exposes main process functionality to renderer
- Location: `src/main/preload.ts` (main window), `src/main/webview-preload.ts` (webview)
- Contains: IPC invocation wrappers, event listeners, ElectronAPI type definitions
- Depends on: Electron contextBridge, ipcRenderer
- Used by: Renderer, webview
- Purpose: Displays platform UI (localhost:3000) within the desktop app
- Location: Managed by `src/main/webview.ts`
- Contains: WebContentsView instance, injection logic for keystore/AWS credentials
- Depends on: Main process services, IPC handlers
- Used by: Electron app for platform deployment UI
## Data Flow
- Docker operation mutex: `dockerOperationInProgress` flag prevents concurrent operations
- Update checker: Background interval (60 min) checks for new Docker images
- Keystore cache: Decrypted mnemonic stays in memory, cleared after key derivation
- AWS credentials cache: Kept in module scope (`currentCredentials`), cleared on explicit logout
- Notification store: In-process store notified via IPC events
## Key Abstractions
- Purpose: Abstracts Docker CLI operations (compose, health checks, pulls)
- Exports: isDockerInstalled, isDockerRunning, getDockerStatus, startContainers, stopContainers, pullImages, waitForHealthy, checkBackendDependencies, installBackendDependencies
- Pattern: Async functions that exec Docker commands, parse output, return typed results
- Purpose: Manages encrypted seed phrase storage using OS keychain (Electron safeStorage)
- Exports: storeSeedPhrase, hasSeedPhrase, deleteSeedPhrase, getAddresses, previewAddresses, deriveKeysToEnv
- Pattern: Encrypt/decrypt using safeStorage, derive keys using ethers HDNodeWallet with BIP44 paths
- Purpose: Handles AWS credential management (profiles, SSO login, role assumption)
- Exports: listProfiles, loadProfile, startSsoLogin, assumeSsoRole, getCredentials, clearCredentials
- Pattern: AWS SDK clients for SSO/OIDC flow, INI file parsing for ~/.aws/credentials, in-memory credential cache
- Purpose: Blocks external network requests except from whitelisted domains
- Exports: initNetworkGuard, addAllowedHost, getBlockedRequests, setMainWindowId
- Pattern: Electron session.webRequest hook with regex patterns and dynamic allowlist
- Purpose: Detects and guides Docker Desktop installation on missing Docker
- Exports: installDockerDesktop
- Pattern: Platform-specific download URLs, spawn installer, wait for completion
- Purpose: Manages WebContentsView lifecycle and injection of desktop-specific data
- Exports: showPlatformView, hidePlatformView, destroyPlatformView, registerWebviewIpcHandlers, setAdminCredentials
- Pattern: Create/reuse WebContentsView with preload, inject window.__ globals, track navigation
- Purpose: Manages in-app notifications with persistence
- Pattern: Array store with timestamps, read/dismissed flags, action handlers
## Entry Points
- Location: `src/main/index.ts`
- Triggers: Electron app.whenReady()
- Responsibilities:
- Location: `src/renderer/App.tsx`
- Triggers: React createRoot in `src/renderer/main.tsx`
- Responsibilities:
- `src/main/preload.ts`: Exposes ElectronAPI to renderer (contextBridge)
- `src/main/webview-preload.ts`: Simple marker for webview sandbox
## Error Handling
- Docker operations: Try/catch with stderr capture, emit user-friendly messages via log callback
- Keystore: Validate mnemonic format before storage, catch decryption errors with "data corrupted" message
- AWS auth: INI parsing errors return empty results, SSO login catches URL/network errors
- Network Guard: URL parsing errors silently allow (no blocking on parse failure)
- Async IPC: Errors thrown in main handlers propagate to renderer as IPC errors with .message preserved
- Setup page: Catches step errors, displays in modal, allows retry from any step
## Cross-Cutting Concerns
- Docker: setLogCallback() in main, logs streamed to renderer via `docker:log` IPC event
- Other services: console.log/warn/error in main process (visible in Electron dev tools)
- Renderer: window.electronAPI event listeners log to console
- Mnemonic: validateMnemonic() checks BIP39 format before storage
- URLs: URL constructor throws on invalid URLs in webview load
- Port checks: lsof/netstat parsing with timeout and error fallback
- Renderer: No auth check (assumes user has physical access)
- WebView: Auto-login via backend API after docker start, stored credentials in component state
- AWS: Credentials stored in module scope, cleared on logout or app quit
- Docker operations protected by `dockerOperationInProgress` mutex
- Long operations use Electron event emitters for progress (not blocking)
- Async IPC handlers don't block renderer
- Keystore uses OS safeStorage (encrypted via system keychain)
- Private keys never injected into webview (only addresses)
- Network guard blocks external requests by default (whitelist only)
- Preload uses contextIsolation:true and sandbox:true
- AWS credentials cleared on quit

## Workflow

모든 작업은 **superpowers** 기반 워크플로우를 따릅니다:

- **계획 필요 시**: `/superpowers:brainstorming` — 구현 전 생각 정리
- **버그 수정**: `/superpowers:systematic-debugging` — 근본 원인 분석 및 수정
- **기능 구현**: `/superpowers:test-driven-development` — 테스트 주도 개발
- **완료 전**: `/superpowers:verification-before-completion` — 구현 검증
- **코드 리뷰**: `/superpowers:requesting-code-review` — 리뷰 요청 및 수신
- **배포 준비**: `/superpowers:finishing-a-development-branch` — 브랜치 마무리

**Note**: GSD 오버헤드를 제거했으므로, 선택 부담 없이 작업에 집중할 수 있습니다.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**CrossTrade Integration for TRH Platform**

TRH Platform의 DeFi/Full Preset으로 L2를 배포할 때, CrossTrade 프로토콜이 자동으로 통합되도록 구현하는 프로젝트. L1 Deposit Transaction 기반 L2 컨트랙트 배포, L1 setChainInfo 자동 등록, CrossTrade dApp 컨테이너 배포까지 End-to-End 자동화를 목표로 한다.

**Core Value:** DeFi/Full Preset 선택만으로 CrossTrade가 자동 배포되어, L2 운영자가 추가 설정 없이 7일 출금 대기를 제거한 빠른 크로스체인 토큰 교환을 제공할 수 있어야 한다.

### Constraints

- **코드 공존**: 기존 AWS CrossTrade 코드 수정 금지 — 새 함수/파일로 병존
- **Go import**: Backend → SDK 호출은 Go 패키지 import (HTTP/exec 아님)
- **배포 방식**: L1 Deposit Tx만 사용 (Genesis Predeploy 금지)
- **배포 스코프**: 로컬(Docker Compose) 전용 — AWS/K8s 범위 외
- **키 관리**: Phase 1에서는 deployer 키와 L1 owner 키를 동일 키로 처리 (Sepolia)
- **Conventional Commits**: 모든 커밋은 Conventional Commits 형식
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework (Already in SDK)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| go-ethereum (ethclient) | v1.17.1 | L1 RPC interaction, tx signing, receipt polling | Already pinned in trh-sdk go.mod. Provides ethclient.Client, types.NewTransaction, accounts/abi for calldata encoding |
| go-ethereum (accounts/abi) | v1.17.1 | ABI encoding for OptimismPortal.depositTransaction() calldata | Already used in drb_genesis.go for abi.JSON + Constructor.Inputs.Pack pattern |
| go-ethereum (accounts/abi/bind) | v1.17.1 | bind.WaitMined for tx receipt polling, abigen-generated bindings | Already used in deploy_chain.go, register_candidate.go, aa_bridge.go |
| go-ethereum (crypto) | v1.17.1 | ECDSA key handling, Keccak256 for function selectors | Already used throughout aa_setup.go, deploy_chain.go |
### ABI Binding Generation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| abigen (go-ethereum tool) | matching v1.17.1 | Generate Go bindings for OptimismPortal, L1CrossTrade, L2toL2CrossTradeL1 | SDK already uses abigen pattern (see `trh-sdk/abis/TON.go`, `L1ContractVerification.go`). Type-safe method calls eliminate manual calldata construction errors |
### L1-to-L2 Deposit Receipt Tracking
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| go-ethereum ethclient | v1.17.1 | Poll L2 for deposit tx execution receipt | L2 RPC supports standard eth_getTransactionReceipt for deposit-type txs |
| Custom sourceHash computation | N/A | Map L1 tx log to L2 deposit tx hash | OP Stack spec: `keccak256(bytes32(0), keccak256(l1BlockHash, bytes32(l1LogIndex)))` |
### Docker Compose (Frontend Platform)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker Compose | v3.8 (existing) | Add CrossTrade dApp container | Existing docker-compose.yml pattern. Conditional inclusion via `profiles:` or env-gated entrypoint |
| tokamaknetwork/cross-trade-dapp | latest (digest-pinned) | CrossTrade dApp UI | Already on DockerHub per PRD |
### Supporting Libraries (Already in SDK)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| holiman/uint256 | v1.3.2 | 256-bit math for gas calculations, value encoding | Already in go.mod; use for deposit tx value/gasLimit encoding |
| go.uber.org/zap | v1.27.0 | Structured logging for deployment steps | Already in go.mod; follow existing t.logger.Infof pattern |
| golang.org/x/sync | v0.18.0 | errgroup for parallel operations if needed | Already in go.mod; NOT needed for deposit txs (must be sequential) |
## Specific Technical Decisions
### 1. ABI Binding: abigen vs Manual Calldata Construction
- OptimismPortal has a stable, well-known ABI. abigen gives type-safe `DepositTransaction(opts, _to, _value, _gasLimit, _isCreation, _data)` calls. This matches the existing SDK pattern in `abis/TON.go` and `abis/L1ContractVerification.go`.
- CrossTrade L2 contract calls (setSelectorImplementations2, initialize, setChainInfo, registerToken) happen **inside** deposit tx data, not as direct contract calls. The `_data` field of `depositTransaction()` contains the L2 calldata. Use `abi.JSON` + `abi.Pack` for these (matching `drb_genesis.go` pattern).
- L1 setChainInfo calls (Backend-side) should also use abigen bindings for L1CrossTradeProxy and L2toL2CrossTradeL1, since these are direct L1 contract calls.
# In trh-sdk/abis/
# In trh-backend (for L1 setChainInfo)
### 2. Transaction Pattern: Raw tx vs bind.TransactOpts
- The SDK has two tx patterns:
- For OptimismPortal, pattern 2 is better because `depositTransaction` has 5 parameters with specific types. Type-safe bindings prevent encoding errors that would silently fail on L2.
- For the `sendTxAndWait` helper (polling receipt), reuse the pattern from `aa_setup.go` lines 87-114 but adapted for L1.
### 3. L1-to-L2 Deposit Receipt Tracking
- Deposit txs do not use sender nonce. They use sourceHash as unique identifier.
- The L2 deposit tx hash is deterministically derived from the L1 event position.
### 4. L2 Contract Address Prediction
- `sender` = the L1 deployer address (no aliasing for EOA callers of OptimismPortal)
- `nonce` = the sender's L2 nonce at execution time
### 5. Docker Compose dApp Service Addition
- The dApp should only run when CrossTrade is enabled (DeFi/Full presets).
- Docker Compose `profiles` (v3.9+, supported in Compose V2) allow services to be started only when explicitly requested.
- Alternative (env-gated): Use environment variable + entrypoint check. Rejected because it still pulls the image even when not needed.
- No version bump risk
- Backend already manages `docker compose` commands dynamically
- Follows the principle of "code coexistence" from PROJECT.md constraints
# docker-compose.crosstrade.yml
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| ABI encoding | abigen bindings (OptimismPortal) + abi.Pack (inner L2 calldata) | All manual keccak256 selector + byte packing | Error-prone for 5-param function; SDK already has abigen precedent in `abis/` |
| Tx sending | bind.TransactOpts + bind.WaitMined | Raw types.NewTransaction + manual poll loop | bind.WaitMined handles edge cases (reorg, timeout); already used in deploy_chain.go |
| L1->L2 tracking | Poll L2 eth_getCode at predicted address | Compute deposit tx hash from sourceHash spec | sourceHash computation is complex (RLP encoding of deposit tx type 0x7E); getCode polling is simpler and sufficient for contract creation |
| L1->L2 tracking | Poll L2 eth_getCode | Use optimism Go SDK (op-node/rollup/derive) | Would add heavy dependency on optimism monorepo; overkill for 12 deposit txs |
| Docker dApp | Separate compose file | Docker Compose profiles | Current compose version is 3.8; profiles require 3.9+; separate file is backward-compatible |
| Docker dApp | Separate compose file | Single compose with `condition: service_started` | Doesn't solve conditional inclusion; service still defined and image pulled |
| Foundry scripts | Pure Go ethclient | Foundry forge script (existing AWS pattern) | PRD explicitly requires Go-native L1 Deposit Tx; Foundry adds external binary dependency for local Docker |
## What NOT to Use
| Technology | Why Avoid |
|------------|-----------|
| optimism monorepo Go packages (op-node, op-bindings) | Massive dependency tree; version conflicts with existing go-ethereum v1.17.1; the SDK only needs depositTransaction() which is a simple contract call |
| Foundry/forge for local deployment | Adds external binary dependency; existing AWS CrossTrade uses it, but local deployment should be pure Go per PRD constraints |
| Genesis predeploy (alloc manipulation) | Explicitly rejected in PRD v2.0: constructor not executed, bridge invariant violation, manual storage slot calculation |
| ethers.js / TypeScript for contract interaction | Backend and SDK are Go; cross-language calls add complexity. The only TypeScript component (Platform UI) doesn't interact with contracts directly |
| go-ethereum SimulatedBackend for testing | Doesn't support deposit transaction type (0x7E); use actual devnet L2 for integration tests |
## Gas Estimation Notes
| Operation | L1 Gas (estimated) | L2 Gas Limit (in depositTransaction) | Notes |
|-----------|-------------------|--------------------------------------|-------|
| depositTransaction (creation) | ~100,000-150,000 | 3,000,000 | L1 gas for the portal call itself; L2 gas for contract deployment |
| depositTransaction (function call) | ~60,000-80,000 | 500,000 | L1 gas lower for non-creation; L2 gas for function execution |
| L1 setChainInfo | ~80,000-120,000 | N/A (direct L1 call) | Backend-side, not a deposit tx |
## Installation
# Generate ABI bindings (one-time, committed to repo)
# For backend L1 setChainInfo bindings
- **OptimismPortal**: OP Stack contracts-bedrock artifacts (already used during L2 deployment)
- **L1CrossTrade, L2toL2CrossTradeL1**: `crossTrade/abi/` directory or extracted from deployed Sepolia contracts
## Confidence Assessment
| Decision | Confidence | Basis |
|----------|------------|-------|
| go-ethereum v1.17.1 ethclient for L1 txs | HIGH | Verified in go.mod; already used for 13+ files with ethclient patterns |
| abigen for OptimismPortal binding | HIGH | Existing SDK pattern in abis/TON.go, L1ContractVerification.go; abigen ships with go-ethereum |
| abi.Pack for inner L2 calldata | HIGH | Exact pattern exists in drb_genesis.go lines 125-130 |
| bind.WaitMined for L1 receipt | HIGH | Used in deploy_chain.go:889, register_candidate.go:254, aa_bridge.go:148 |
| L2 getCode polling for deposit verification | MEDIUM | Simpler than sourceHash computation; works for creation txs. Non-creation verification needs view function calls. Not yet proven in this codebase. |
| CREATE address prediction for L2 contracts | MEDIUM | Standard EVM CREATE formula; works if nonce tracking is correct. Risk: if any prior deposit tx fails, subsequent nonce predictions break. Need rollback/retry logic. |
| Separate docker-compose file for dApp | MEDIUM | Clean pattern but Backend must dynamically construct `docker compose -f` command chain. Needs verification that Backend's Docker management supports multi-file compose. |
## Sources
- [OP Stack Deposits Specification](https://specs.optimism.io/protocol/deposits.html) - TransactionDeposited event, sourceHash formula, deposit tx derivation
- [OP Stack Deposit Flow](https://docs.optimism.io/stack/transactions/deposit-flow) - End-to-end deposit mechanism
- [go-ethereum abigen documentation](https://geth.ethereum.org/docs/developers/dapp-developer/native-bindings) - ABI binding generation
- [go-ethereum accounts/abi/bind package](https://pkg.go.dev/github.com/ethereum/go-ethereum/accounts/abi/bind) - WaitMined, TransactOpts
- [Optimism op-node bindings](https://pkg.go.dev/github.com/ethereum-optimism/optimism/op-node/bindings/preview) - OptimismPortal2 binding reference
- trh-sdk go.mod (local: go-ethereum v1.17.1 pinned)
- trh-sdk/abis/TON.go (local: existing abigen binding pattern)
- trh-sdk/pkg/stacks/thanos/drb_genesis.go (local: abi.JSON + Pack pattern)
- trh-sdk/pkg/stacks/thanos/aa_setup.go (local: sendTxAndWait pattern, raw tx construction)
- trh-sdk/pkg/stacks/thanos/deploy_chain.go (local: bind.WaitMined L1 pattern)
- crossTrade/PRD-CrossTrade-TRH-Integration-v2.1.md (local: deployment sequence, Go interface spec)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
