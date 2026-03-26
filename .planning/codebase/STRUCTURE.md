# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
trh-platform/
├── src/
│   ├── main/                      # Main process (Electron + Node.js)
│   │   ├── index.ts               # App entry point, IPC setup
│   │   ├── preload.ts             # Renderer window preload
│   │   ├── webview-preload.ts     # WebContentsView preload
│   │   ├── docker.ts              # Docker CLI operations
│   │   ├── keystore.ts            # Encrypted seed phrase storage
│   │   ├── aws-auth.ts            # AWS credential management
│   │   ├── network-guard.ts       # Request filtering
│   │   ├── webview.ts             # WebContentsView lifecycle
│   │   ├── installer.ts           # Docker Desktop installation
│   │   ├── notifications.ts       # Notification store
│   │   ├── aws-auth.test.ts       # AWS auth unit tests
│   │   └── keystore.test.ts       # Keystore unit tests
│   │
│   ├── renderer/                  # Renderer process (React)
│   │   ├── main.tsx               # React root entry
│   │   ├── index.html             # HTML template
│   │   ├── App.tsx                # Main router component
│   │   ├── types.ts               # ElectronAPI interface types
│   │   ├── app.css                # Global styles
│   │   │
│   │   ├── pages/                 # Page components (full-screen views)
│   │   │   ├── ConfigPage.tsx      # Docker/port configuration
│   │   │   ├── ConfigPage.css
│   │   │   ├── SetupPage.tsx       # Docker startup orchestration
│   │   │   ├── SetupPage.css
│   │   │   ├── SetupPage.test.tsx  # Setup steps unit tests
│   │   │   ├── NotificationPage.tsx # Notification center view
│   │   │   ├── NotificationPage.css
│   │   │   ├── ReadyPage.tsx       # Legacy ready state (unused)
│   │   │   └── ReadyPage.css
│   │   │
│   │   ├── components/            # Reusable UI components
│   │   │   ├── StepItem.tsx        # Setup step display
│   │   │   ├── StepItem.css
│   │   │   ├── TerminalPanel.tsx   # Log output viewer
│   │   │   ├── TerminalPanel.css
│   │   │   ├── PortConflictModal.tsx # Port conflict dialog
│   │   │   └── PortConflictModal.css
│   │   │
│   │   ├── assets/                # Images and icons
│   │   │   ├── icon/
│   │   │   ├── images/
│   │   │   ├── logo/              # Logos (TRH, Tokamak, RollupHub)
│   │   │   └── mov/               # Animations/videos
│   │   │
│   │   ├── mock/                  # Development mocks
│   │   │   └── electronAPI.ts      # Mock API for browser testing
│   │   │
│   │   └── vite-env.d.ts          # Vite type declarations
│   │
│   └── test/                      # Shared test configuration
│       └── setup.ts               # Vitest setup
│
├── config/                        # Configuration templates
│   ├── env.docker.template        # Docker image versions
│   ├── env.backend.template       # Backend service config
│   └── env.frontend.template      # Frontend service config
│
├── ec2/                           # AWS EC2 Terraform
│   ├── main.tf                    # Instance + security group
│   ├── variables.tf               # Input variables
│   ├── outputs.tf                 # Terraform outputs
│   ├── setup.sh                   # SSH key setup
│   └── terraform.tfstate          # Infrastructure state
│
├── dist/                          # Built output (generated)
│   ├── main/                      # Compiled main process
│   └── renderer/                  # Vite-built renderer
│
├── public/                        # Static assets
│   ├── icon.png                   # App icon
│   ├── icon.ico                   # Windows icon
│   ├── icon.icns                  # macOS icon
│   ├── tray-icon.png              # Tray icon
│   └── favicon.ico                # Browser favicon
│
├── release/                       # Built installers (generated)
│   ├── *.dmg                      # macOS installer
│   ├── *.exe                      # Windows installer
│   └── *.AppImage                 # Linux installer
│
├── resources/                     # Application resources
│   ├── docker-compose.yml         # Service definitions
│   └── setup.sh                   # Backend container setup
│
├── docs/                          # Documentation
│   ├── daily-reports/             # Generated deployment reports
│   ├── deployment-flow.html       # Visual flow
│   └── *.md                       # Feature specs
│
├── .planning/                     # GSD codebase analysis
│   └── codebase/                  # This analysis directory
│
├── .github/                       # GitHub workflows
├── .env*                          # Environment files (gitignored)
├── docker-compose.yml             # For local backend/DB (in project root)
├── Makefile                       # Service commands
├── package.json                   # Dependencies + scripts
├── tsconfig.electron.json         # Main process TypeScript
├── tsconfig.renderer.json         # Renderer TypeScript
├── vite.config.ts                 # Renderer build config
├── vitest.config.mts              # Test framework config
└── CLAUDE.md                      # Project instructions
```

## Directory Purposes

**`src/main/`:**
- Purpose: Electron main process code
- Contains: Service modules (Docker, keystore, AWS), IPC handlers, preload scripts
- Key files: `index.ts` (entry), `preload.ts` (API bridge), `docker.ts` (orchestration)
- Built to: `dist/main/` (CommonJS)

**`src/renderer/`:**
- Purpose: React-based user interface
- Contains: Pages, components, styles, mocks, type definitions
- Key files: `App.tsx` (router), `main.tsx` (entry), `types.ts` (ElectronAPI interface)
- Built to: `dist/renderer/` (ES modules via Vite)

**`src/renderer/pages/`:**
- Purpose: Full-page views that render in Electron window
- ConfigPage: Port conflict detection, Docker daemon checks, installation guidance
- SetupPage: Orchestrates Docker startup with step-by-step progress display
- NotificationPage: Shows in-app notifications with actions
- ReadyPage: Unused legacy component

**`src/renderer/components/`:**
- Purpose: Reusable UI components used in pages
- StepItem: Displays setup step status (pending/running/success/error)
- TerminalPanel: Scrollable log output viewer
- PortConflictModal: Dialog for port conflict resolution

**`src/renderer/mock/`:**
- Purpose: Mock ElectronAPI for browser-based development
- electronAPI.ts: Provides fake responses to mimic Electron behavior
- Activated with `VITE_MOCK_ELECTRON=true` or `?scenario=<name>`

**`src/test/`:**
- Purpose: Shared test configuration
- setup.ts: Initializes testing-library jest-dom matchers for Vitest

**`config/`:**
- Purpose: Environment variable templates
- env.docker.template: Docker image digests (pinned versions)
- env.backend.template: PostgreSQL, JWT, admin credentials
- env.frontend.template: Backend API URL

**`public/`:**
- Purpose: Static files bundled with the app
- Icons: app icon, tray icon, platform-specific formats
- Copied to `dist/` and packaged into installers

**`resources/`:**
- Purpose: Application resources bundled by electron-builder
- docker-compose.yml: Service definitions (copied from project root)
- setup.sh: Container initialization script

**`dist/`:**
- Purpose: Compiled/built output
- dist/main: TypeScript compiled to CommonJS
- dist/renderer: Vite bundled React app
- dist/index.js: Entry point specified in package.json

**`release/`:**
- Purpose: Packaged installers
- Generated by electron-builder from `dist/`
- Platform-specific: dmg (macOS), exe (Windows), AppImage (Linux)

## Key File Locations

**Entry Points:**
- `src/main/index.ts`: Main process entry point (app.whenReady, window creation, IPC)
- `src/renderer/main.tsx`: Renderer entry point (React createRoot)
- `src/renderer/index.html`: HTML template loaded by Electron
- `dist/main/index.js`: Built main process (referenced by package.json "main" field)

**Configuration:**
- `package.json`: Dependencies, build scripts, electron-builder config
- `tsconfig.electron.json`: Main process TypeScript config (CommonJS, target ES2020)
- `tsconfig.renderer.json`: Renderer TypeScript config (ESNext, JSX enabled)
- `vite.config.ts`: Renderer build config (root: src/renderer, outDir: dist/renderer)
- `vitest.config.mts`: Test runner config (globals: true, environment: happy-dom)

**Core Logic:**
- `src/main/docker.ts`: Docker CLI operations and health checks
- `src/main/keystore.ts`: BIP44 key derivation, seed phrase encryption
- `src/main/aws-auth.ts`: AWS credential management and SSO flow
- `src/main/webview.ts`: WebContentsView lifecycle and JavaScript injection
- `src/renderer/App.tsx`: View routing and Docker status orchestration

**Testing:**
- `src/main/aws-auth.test.ts`: AWS auth module unit tests
- `src/main/keystore.test.ts`: Keystore encryption/decryption tests
- `src/renderer/pages/SetupPage.test.tsx`: Setup workflow tests
- `src/test/setup.ts`: Vitest configuration

**IPC Bridge:**
- `src/main/preload.ts`: ElectronAPI exposed to renderer via contextBridge
- `src/renderer/types.ts`: TypeScript interface for ElectronAPI

## Naming Conventions

**Files:**
- Page components: PascalCase with Page suffix (e.g., `ConfigPage.tsx`)
- Regular components: PascalCase (e.g., `StepItem.tsx`)
- Styles: Match component name with .css (e.g., `StepItem.css`)
- Services/modules: camelCase (e.g., `docker.ts`, `keystore.ts`)
- Tests: Component name + `.test.tsx` (e.g., `SetupPage.test.tsx`)
- Types/interfaces: Defined in `types.ts` (shared) or in module where used

**Directories:**
- Feature directories: kebab-case (e.g., `src/renderer/pages/`, `src/main/`)
- Asset subdirectories: lowercase plural (e.g., `assets/logo/`, `assets/images/`)
- Special directories: lowercase (e.g., `.planning/`, `resources/`)

**Code Symbols:**
- React components: PascalCase (must start with capital for JSX)
- Functions: camelCase (e.g., `getStatus()`, `startContainers()`)
- Variables: camelCase (e.g., `dockerOperationInProgress`)
- Types/Interfaces: PascalCase (e.g., `DockerStatus`, `ElectronAPI`)
- Constants: UPPER_SNAKE_CASE (e.g., `COMMAND_TIMEOUT`, `REQUIRED_PORTS`)
- IPC channels: kebab-case (e.g., `docker:get-status`, `webview:go-back`)

## Where to Add New Code

**New Renderer Page (e.g., Settings):**
- Implementation: `src/renderer/pages/SettingsPage.tsx` + `SettingsPage.css`
- Update: `src/renderer/App.tsx` to add route and ViewMode type
- Tests: `src/renderer/pages/SettingsPage.test.tsx`

**New Main Process Service (e.g., file operations):**
- Implementation: `src/main/file-manager.ts` with exported functions
- IPC handlers: Add to `src/main/index.ts` setupIpcHandlers()
- Preload API: Add methods to electronAPI object in `src/main/preload.ts`
- Type definitions: Add interface to `src/renderer/types.ts` ElectronAPI

**New Reusable Component (e.g., Button variant):**
- Implementation: `src/renderer/components/CustomButton.tsx` + `CustomButton.css`
- Usage: Import in page components
- Tests: `src/renderer/components/CustomButton.test.tsx` (if complex)

**New Utility Function:**
- If renderer-only: Create `src/renderer/utils/functionName.ts`
- If main-only: Create `src/main/utils/functionName.ts`
- If shared types: Add to `src/renderer/types.ts`

**New Test:**
- Unit tests for services: `src/main/service.test.ts` (use vitest)
- Component tests: `src/renderer/components/Component.test.tsx` (use React Testing Library)
- Page tests: `src/renderer/pages/Page.test.tsx`

## Special Directories

**`.planning/`:**
- Purpose: GSD codebase analysis documents
- Generated: Manually during `/gsd:map-codebase` command
- Committed: Yes (guides future work)
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**`dist/`:**
- Purpose: Build output from TypeScript and Vite
- Generated: By `npm run build` (tsc + vite)
- Committed: No (.gitignored)
- Structure: mirrors src/ layout (main/ and renderer/)

**`release/`:**
- Purpose: Packaged installers built by electron-builder
- Generated: By `npm run package` or platform-specific variants
- Committed: No (.gitignored)
- Contents: .dmg, .exe, .AppImage, .blockmap files

**`resources/`:**
- Purpose: Application resources bundled into installer
- Generated: No (committed as source)
- Committed: Yes
- Usage: electron-builder extracts these into app package

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: By `npm install` or `npm ci`
- Committed: No (.gitignored)
- Includes: Electron, React, TypeScript, build tools

**`docs/`:**
- Purpose: Project documentation and deployment guides
- Generated: Partially (daily-reports are generated)
- Committed: Yes (except daily-reports)
- Contains: Feature specs, deployment flows, implementation plans

## Build and Compilation

**Build Process:**
1. `npm run build:main`: TypeScript compilation of `src/main/` via `tsc -p tsconfig.electron.json`
   - Compiles to `dist/main/` as CommonJS
   - Preserves type declarations (declaration: true)
   - Requires strict mode
2. `npm run build:renderer`: Vite bundling of `src/renderer/`
   - Bundles React + dependencies
   - Output to `dist/renderer/`
   - Minified in production
3. `npm run build`: Both of above in sequence
4. `npm run package`: electron-builder creates installers from `dist/`
   - Reads from `dist/main/index.js` (entry point)
   - Bundles `dist/renderer/` as web assets
   - Copies `public/` and `resources/` into app package
   - Creates platform-specific installers in `release/`

**Development:**
- `npm run dev`: Runs TypeScript compiler, Vite dev server, and launches Electron
  - Loads Vite dev URL (http://localhost:5173) instead of packaged HTML
  - Hot reload enabled for renderer
- `npm run dev:watch`: Runs TypeScript watcher + Vite + Electron
- `npm run dev:browser`: Runs Vite only (browser testing without Electron)
- `VITE_MOCK_ELECTRON=true`: Activates mock ElectronAPI for browser testing

**Testing:**
- `npm test`: Runs vitest with src/**/*.test.{ts,tsx}
- `npm run test:watch`: Vitest watch mode
- Test environment: happy-dom (lightweight JSDOM alternative)
- Matches: Files named `*.test.ts` or `*.test.tsx`
