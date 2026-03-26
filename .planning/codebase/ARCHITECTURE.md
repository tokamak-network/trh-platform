# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Electron + React Multi-Process Architecture

This is a desktop application using Electron's two-process model (main and renderer) with a embedded WebContentsView for localhost-based web UI integration. The architecture separates system-level operations (Docker management, keystore, AWS auth) from UI rendering, using IPC for secure communication.

**Key Characteristics:**
- Two-process isolation: Main process (Node.js) handles system operations, renderer process (React) handles UI
- Preload-based security: Context isolation with exposed ElectronAPI via preload script
- Embedded web view: localhost:3000 platform UI runs in a WebContentsView within the Electron window
- Service-focused main process: Docker operations, key management, AWS authentication are separate modules
- IPC-driven: All renderer-main communication through ipcRenderer/ipcMain with explicit handlers

## Layers

**Renderer/UI Layer:**
- Purpose: React-based user interface for desktop app configuration, setup, and notifications
- Location: `src/renderer/`
- Contains: React components (pages, reusable components), styles, type definitions, mock APIs
- Depends on: ElectronAPI (via preload), local state management (hooks)
- Used by: Electron window (BrowserWindow)

**Main Process/System Layer:**
- Purpose: Manages Docker containers, keystore encryption, AWS authentication, network security
- Location: `src/main/`
- Contains: Modular service files (docker.ts, keystore.ts, aws-auth.ts, network-guard.ts), IPC handlers, preload scripts
- Depends on: Electron APIs, child_process for Docker CLI, @aws-sdk for AWS auth, ethers for key derivation
- Used by: Renderer process via IPC, Tray menu

**Preload/Bridge Layer:**
- Purpose: Securely exposes main process functionality to renderer
- Location: `src/main/preload.ts` (main window), `src/main/webview-preload.ts` (webview)
- Contains: IPC invocation wrappers, event listeners, ElectronAPI type definitions
- Depends on: Electron contextBridge, ipcRenderer
- Used by: Renderer, webview

**Embedded Web View:**
- Purpose: Displays platform UI (localhost:3000) within the desktop app
- Location: Managed by `src/main/webview.ts`
- Contains: WebContentsView instance, injection logic for keystore/AWS credentials
- Depends on: Main process services, IPC handlers
- Used by: Electron app for platform deployment UI

## Data Flow

**Initialization Flow:**

1. Electron app starts (`src/main/index.ts` app.whenReady())
2. IPC handlers registered via `setupIpcHandlers()`
3. Main window created with preload script
4. Network guard initialized on electron session
5. Tray created with context menu
6. Renderer loads (Vite dev URL or packaged HTML)
7. Renderer React App.tsx initializes, checks Docker status
8. If healthy, loads platform view (WebContentsView at localhost:3000)

**Docker Lifecycle Flow:**

1. Renderer calls `api.docker.getStatus()` → IPC to `docker:get-status`
2. Main process checks: Docker installed, daemon running, containers up, health check
3. Returns status object to renderer
4. If not healthy, renderer shows ConfigPage or SetupPage
5. On setup: renderer calls `api.docker.start()` → main starts containers
6. Progress events sent via `docker:pull-progress`, `docker:status-update`, `docker:install-progress`
7. Once healthy, renderer loads platform view

**Keystore Injection Flow:**

1. WebContentsView loads localhost:3000
2. `did-finish-load` event triggers `injectKeystoreAccounts()`
3. Keystore module decrypts seed phrase from disk
4. Derives addresses using ethers HDNodeWallet
5. Private keys generated but NOT exposed to web UI (only addresses)
6. Window.__TRH_DESKTOP_ACCOUNTS__ set via executeJavaScript
7. Platform UI accesses injected data directly from window object

**AWS Credentials Injection Flow:**

1. After webview loads, `injectAwsCredentials()` reads credentials from memory store
2. Credentials stored by `aws-auth.ts` after SSO login or profile load
3. Window.__TRH_AWS_CREDENTIALS__ injected for platform UI consumption
4. Credentials cleared on app quit (main process cleanup)

**State Management:**

- Docker operation mutex: `dockerOperationInProgress` flag prevents concurrent operations
- Update checker: Background interval (60 min) checks for new Docker images
- Keystore cache: Decrypted mnemonic stays in memory, cleared after key derivation
- AWS credentials cache: Kept in module scope (`currentCredentials`), cleared on explicit logout
- Notification store: In-process store notified via IPC events

## Key Abstractions

**Docker Manager (`src/main/docker.ts`):**
- Purpose: Abstracts Docker CLI operations (compose, health checks, pulls)
- Exports: isDockerInstalled, isDockerRunning, getDockerStatus, startContainers, stopContainers, pullImages, waitForHealthy, checkBackendDependencies, installBackendDependencies
- Pattern: Async functions that exec Docker commands, parse output, return typed results

**Keystore (`src/main/keystore.ts`):**
- Purpose: Manages encrypted seed phrase storage using OS keychain (Electron safeStorage)
- Exports: storeSeedPhrase, hasSeedPhrase, deleteSeedPhrase, getAddresses, previewAddresses, deriveKeysToEnv
- Pattern: Encrypt/decrypt using safeStorage, derive keys using ethers HDNodeWallet with BIP44 paths

**AWS Auth (`src/main/aws-auth.ts`):**
- Purpose: Handles AWS credential management (profiles, SSO login, role assumption)
- Exports: listProfiles, loadProfile, startSsoLogin, assumeSsoRole, getCredentials, clearCredentials
- Pattern: AWS SDK clients for SSO/OIDC flow, INI file parsing for ~/.aws/credentials, in-memory credential cache

**Network Guard (`src/main/network-guard.ts`):**
- Purpose: Blocks external network requests except from whitelisted domains
- Exports: initNetworkGuard, addAllowedHost, getBlockedRequests, setMainWindowId
- Pattern: Electron session.webRequest hook with regex patterns and dynamic allowlist

**Installer (`src/main/installer.ts`):**
- Purpose: Detects and guides Docker Desktop installation on missing Docker
- Exports: installDockerDesktop
- Pattern: Platform-specific download URLs, spawn installer, wait for completion

**WebView Manager (`src/main/webview.ts`):**
- Purpose: Manages WebContentsView lifecycle and injection of desktop-specific data
- Exports: showPlatformView, hidePlatformView, destroyPlatformView, registerWebviewIpcHandlers, setAdminCredentials
- Pattern: Create/reuse WebContentsView with preload, inject window.__ globals, track navigation

**Notification Store (`src/main/notifications.ts`):**
- Purpose: Manages in-app notifications with persistence
- Pattern: Array store with timestamps, read/dismissed flags, action handlers

## Entry Points

**Main Window (`src/main/index.ts`):**
- Location: `src/main/index.ts`
- Triggers: Electron app.whenReady()
- Responsibilities:
  - Initialize all services (IPC, network guard, tray)
  - Create BrowserWindow and load renderer
  - Manage tray menu with service controls
  - Handle app lifecycle (quit, activate, second-instance)
  - Coordinate between renderer and services

**Renderer App (`src/renderer/App.tsx`):**
- Location: `src/renderer/App.tsx`
- Triggers: React createRoot in `src/renderer/main.tsx`
- Responsibilities:
  - Initialize Docker status check
  - Route between views (ConfigPage, SetupPage, webapp, NotificationPage)
  - Coordinate webview visibility with platform UI navigation

**Preload Scripts:**
- `src/main/preload.ts`: Exposes ElectronAPI to renderer (contextBridge)
- `src/main/webview-preload.ts`: Simple marker for webview sandbox

## Error Handling

**Strategy:** Explicit error objects with typed shapes. Errors flow through IPC with message preservation.

**Patterns:**

- Docker operations: Try/catch with stderr capture, emit user-friendly messages via log callback
- Keystore: Validate mnemonic format before storage, catch decryption errors with "data corrupted" message
- AWS auth: INI parsing errors return empty results, SSO login catches URL/network errors
- Network Guard: URL parsing errors silently allow (no blocking on parse failure)
- Async IPC: Errors thrown in main handlers propagate to renderer as IPC errors with .message preserved
- Setup page: Catches step errors, displays in modal, allows retry from any step

## Cross-Cutting Concerns

**Logging:**
- Docker: setLogCallback() in main, logs streamed to renderer via `docker:log` IPC event
- Other services: console.log/warn/error in main process (visible in Electron dev tools)
- Renderer: window.electronAPI event listeners log to console

**Validation:**
- Mnemonic: validateMnemonic() checks BIP39 format before storage
- URLs: URL constructor throws on invalid URLs in webview load
- Port checks: lsof/netstat parsing with timeout and error fallback

**Authentication:**
- Renderer: No auth check (assumes user has physical access)
- WebView: Auto-login via backend API after docker start, stored credentials in component state
- AWS: Credentials stored in module scope, cleared on logout or app quit

**Threading:**
- Docker operations protected by `dockerOperationInProgress` mutex
- Long operations use Electron event emitters for progress (not blocking)
- Async IPC handlers don't block renderer

**Security Decisions:**
- Keystore uses OS safeStorage (encrypted via system keychain)
- Private keys never injected into webview (only addresses)
- Network guard blocks external requests by default (whitelist only)
- Preload uses contextIsolation:true and sandbox:true
- AWS credentials cleared on quit
