# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5.9.3 - Full codebase (main process, renderer, tests)
- React 19.2.4 - UI components in renderer process

**Secondary:**
- JavaScript (auto-generated from TypeScript compilation)

## Runtime

**Environment:**
- Node.js 18.0.0+ (specified in `package.json` engines field)
- Electron 33.0.0 - Desktop application framework

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Electron 33.0.0 - Desktop application runtime (`src/main/index.ts` uses electron APIs)
  - IPC for main/renderer communication
  - Native dialogs, menus, tray icons
  - Safe storage for keystore encryption
- React 19.2.4 - UI framework (`src/renderer/main.tsx` entry point)

**Build/Dev:**
- Vite 7.3.1 - Renderer build tool (config: `vite.config.ts`)
  - Plugin: @vitejs/plugin-react 5.1.3
  - Output: `dist/renderer`, Development port 5173
- TypeScript 5.9.3 - Type checking
  - Electron config: `tsconfig.electron.json` (target: ES2020, module: commonjs)
  - Renderer config: `tsconfig.renderer.json` (target: ESNext, module: ESNext)

**Testing:**
- Vitest 4.1.0 - Test runner and assertion library
  - Test command: `npm run test`
  - Watch command: `npm run test:watch`
- Testing Library 6.9.1+
  - @testing-library/react 16.3.2 - React component testing
  - @testing-library/jest-dom 6.9.1 - DOM matchers
  - @testing-library/user-event 14.6.1 - User interaction simulation
- JSDOM 29.0.1 - DOM environment for tests
- Happy DOM 20.8.4 - Lightweight DOM alternative for tests

**Build/Package:**
- electron-builder 25.1.8 - Packaging and distribution
  - Targets: macOS (dmg, arm64/x64), Windows (nsis, x64), Linux (AppImage, x64)
  - Config in `package.json` build section
- Concurrently 9.2.1 - Run multiple commands in parallel during development

## Key Dependencies

**Critical:**
- ethers 6.13.4 - Blockchain library (`src/main/keystore.ts`)
  - Used for: HD wallet derivation, mnemonic validation, private key generation
  - Pattern: `HDNodeWallet.fromPhrase()`, `Mnemonic.fromPhrase()`

**AWS SDK:**
- @aws-sdk/client-sso-oidc 3.1013.0 - AWS SSO OIDC authentication
  - Used in `src/main/aws-auth.ts`
  - Commands: RegisterClientCommand, StartDeviceAuthorizationCommand, CreateTokenCommand
- @aws-sdk/client-sso 3.1013.0 - AWS SSO credential retrieval
  - Used in `src/main/aws-auth.ts`
  - Commands: GetRoleCredentialsCommand, ListAccountsCommand, ListAccountRolesCommand

**Standard Library:**
- React DOM 19.2.4 - React DOM rendering
- Node.js built-ins: fs, path, os, child_process, net, https, http

## Configuration

**Environment:**
- Template files in `config/`:
  - `config/env.backend.template` - Backend/database config (PostgreSQL connection, JWT secret, admin credentials)
  - `config/env.frontend.template` - Frontend config (NEXT_PUBLIC_API_BASE_URL)
  - `config/env.docker.template` - Docker image versions (comments only, no pin required)
- Vite env prefix: `VITE_` (defined in `vite.config.ts`)
- Mock mode: `VITE_MOCK_ELECTRON=true` bypasses Electron for browser testing

**Build:**
- Vite config: `vite.config.ts`
  - Root: `src/renderer`
  - Base: `./` (relative paths)
  - Output: `dist/renderer` and `dist/main`
- TypeScript configs:
  - `tsconfig.electron.json` - Main process compilation (target: ES2020, outDir: dist)
  - `tsconfig.renderer.json` - Renderer process compilation (target: ESNext)
- Electron Builder config embedded in `package.json`

## Platform Requirements

**Development:**
- macOS, Windows, or Linux
- Docker and Docker Compose (for backend services)
- Node.js 18+
- npm

**Production:**
- macOS 10.13+ (Intel/Apple Silicon)
  - DMG distribution with hardened runtime and gatekeeper support
- Windows 10+ (x64)
  - NSIS installer with UI customization
- Linux (x64)
  - AppImage distribution
- Backend: Docker containers (PostgreSQL 15, trh-backend, trh-platform-ui)

## Build Outputs

**Electron Application:**
- Main process: `dist/main/index.js` (compiled from TypeScript)
- Renderer: `dist/renderer/` (Vite bundled React app)
- Packaged binaries: `release/` directory (created by electron-builder)
  - macOS: `TRH Desktop-X.Y.Z.dmg`
  - Windows: `TRH Desktop X.Y.Z.nsis.exe`
  - Linux: `TRH Desktop-X.Y.Z-x64.AppImage`

---

*Stack analysis: 2026-03-26*
