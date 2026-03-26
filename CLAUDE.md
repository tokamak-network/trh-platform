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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**TRH Preset Deployment Test Harness**

TRH 플랫폼의 4가지 Preset(General, DeFi, Gaming, Full) 배포 흐름을 실제 L1/L2 통신 없이 mock 기반으로 검증하는 테스트 suite. Electron → Platform UI → Backend API → trh-sdk 전 구간의 로직 정합성을 단위/통합/E2E 테스트로 커버한다.

**Core Value:** 각 Preset이 올바른 genesis config, predeploys, 모듈 구성, 체인 파라미터를 생성하는지 자동으로 검증할 수 있어야 한다.

### Constraints

- **Tech stack**: TypeScript/Vitest (unit/integration), Playwright (E2E) — trh-platform이 Electron + TypeScript 기반
- **Mock boundary**: 모든 외부 의존성(L1/L2 RPC, Docker, Helm, AWS)은 mock/stub 처리
- **Location**: 모든 테스트 코드는 `trh-platform/tests/` 디렉토리에 위치
- **Dependencies**: 4개 저장소(trh-platform, trh-sdk, trh-backend, trh-platform-ui)의 코드를 참조하되, 테스트 실행은 trh-platform에서 수행
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
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
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
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
