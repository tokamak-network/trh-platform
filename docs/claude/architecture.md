# Electron App Architecture

## Pattern Overview

- **Two-process isolation**: Main (Node.js) handles system ops; Renderer (React) handles UI
- **Preload security**: `contextIsolation: true`, `sandbox: true`, ElectronAPI exposed via contextBridge
- **Embedded web view**: localhost:3000 runs in a `WebContentsView` inside the Electron window
- **IPC-driven**: All renderer↔main communication via `ipcRenderer`/`ipcMain`

## Layers

| Layer | Location | Role |
|-------|----------|------|
| Renderer | `src/renderer/` | React pages, components, UI state |
| Main Process | `src/main/` | Docker, keystore, AWS auth, network guard |
| Preload | `src/main/preload.ts` | IPC wrappers, ElectronAPI type definitions |
| WebView | `src/main/webview.ts` | WebContentsView lifecycle, credential injection |

## Key Modules (src/main/)

| Module | Exports | Pattern |
|--------|---------|---------|
| `docker.ts` | `isDockerInstalled`, `getDockerStatus`, `startContainers`, `stopContainers`, `pullImages`, `waitForHealthy` | Async exec Docker CLI, parse output, return typed results |
| `keystore.ts` | `storeSeedPhrase`, `hasSeedPhrase`, `getAddresses`, `deriveKeysToEnv` | OS safeStorage encrypt/decrypt; BIP44 key derivation via ethers HDNodeWallet |
| `aws-auth.ts` | `listProfiles`, `startSsoLogin`, `assumeSsoRole`, `getCredentials`, `clearCredentials` | AWS SDK SSO/OIDC flow; INI file parsing; in-memory credential cache |
| `network-guard.ts` | `initNetworkGuard`, `addAllowedHost`, `getBlockedRequests` | `session.webRequest` hook; whitelist-only external requests |
| `webview.ts` | `showPlatformView`, `hidePlatformView`, `registerWebviewIpcHandlers`, `setAdminCredentials` | WebContentsView lifecycle; inject `window.__` globals |

## Entry Points

- `src/main/index.ts` — Electron `app.whenReady()`
- `src/renderer/App.tsx` — React `createRoot` in `src/renderer/main.tsx`
- `src/main/preload.ts` — ElectronAPI exposed to renderer
- `src/main/webview-preload.ts` — Webview sandbox marker

## Data Flow Notes

- **Docker mutex**: `dockerOperationInProgress` flag prevents concurrent Docker operations
- **Update checker**: Background interval (60 min) polls for new Docker images
- **Keystore cache**: Decrypted mnemonic in memory; cleared after key derivation
- **AWS credentials**: Module-scope cache; cleared on logout or app quit
- **Private keys never injected** into webview (addresses only)
