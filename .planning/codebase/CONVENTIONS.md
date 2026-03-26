# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Electron main process: camelCase (e.g., `docker.ts`, `aws-auth.ts`, `keystore.ts`)
- React components: PascalCase (e.g., `SetupPage.tsx`, `ConfigPage.tsx`, `StepItem.tsx`)
- Type files: PascalCase with types suffix or explicit names (e.g., `types.ts`)
- Test files: match source name with `.test` extension (e.g., `SetupPage.test.tsx`, `aws-auth.test.ts`)
- CSS files: match component/page name (e.g., `SetupPage.css`, `StepItem.css`)

**Functions and Methods:**
- camelCase for all function names
- Async functions commonly prefixed with action words: `check`, `get`, `load`, `start`, `stop`, `install`, `pull`
- Examples: `checkInstalled()`, `getDockerStatus()`, `startContainers()`, `killPortProcesses()`

**Variables:**
- camelCase for all variables
- Boolean variables often prefix with `is`, `has`, `show`, `can` (e.g., `isDockerInstalled`, `hasSeedPhrase`, `showKeySetup`)
- State variables with `set` prefix for React setState functions (e.g., `setViewMode`, `setError`, `setCredentials`)
- Callback handlers prefix with `handle` or `on` (e.g., `handleConfigDone`, `onComplete`)

**Types and Interfaces:**
- PascalCase for all type names (e.g., `DockerStatus`, `StepStatus`, `PortConflict`, `ElectronAPI`)
- Interface names do not use `I` prefix
- Union types use camelCase when stored in variables (e.g., `ViewMode = 'config' | 'setup' | 'webapp' | 'notifications'`)
- Literal string types for discriminant unions (e.g., `StepStatus = 'pending' | 'loading' | 'success' | 'error'`)

**Constants:**
- UPPER_SNAKE_CASE for module-level constants (e.g., `UPDATE_CHECK_INTERVAL_MS`, `REQUIRED_PORTS`, `COMMAND_TIMEOUT`)
- camelCase for constants within function scope or descriptive object keys

## Code Style

**Formatting:**
- No explicit eslint/prettier config files detected
- Consistent 2-space indentation throughout codebase
- Semicolons required (enforced by TypeScript strict mode)
- Quote style: single quotes for strings, backticks for templates

**Linting:**
- TypeScript strict mode enabled in both `tsconfig.electron.json` and `tsconfig.renderer.json`
- Compiler options: `strict: true`, `esModuleInterop: true`, `forceConsistentCasingInFileNames: true`
- No separate ESLint configuration files present

**Type Safety:**
- Strict TypeScript everywhere: `strict: true` in all configs
- All function parameters and return types explicitly typed
- No implicit `any` allowed
- Union types preferred over optional fields where semantically appropriate

## Import Organization

**Order:**
1. Node.js/Electron built-in modules (`electron`, `path`, `fs`, `net`, `os`, `child_process`)
2. Third-party packages (React, AWS SDK, ethers, vitest)
3. Local relative imports (`.`, `..`, `../components`, etc.)
4. Type-only imports separated with `type` keyword when mixing value and type imports

**Path Aliases:**
- No path aliases configured
- Relative imports used throughout (e.g., `import StepItem from '../components/StepItem'`)
- Explicit relative paths with `../` for parent directory navigation

**Module Organization:**
- Barrel files (`index.ts`) not used; direct imports from source files preferred
- Each module exports specific functions/interfaces without default exports (with exception of React components)
- React components use default export pattern
- Utility modules use named exports

## Error Handling

**Patterns:**
- Explicit `try-catch` blocks for error-prone operations
- Error messages descriptive and specific to failure context
- Runtime validation before operations (e.g., checking port availability, validating mnemonics)
- Promise rejection handling with proper error propagation
- For React components: error state managed via `useState` with error object containing `{ title, message }`
- Example from `SetupPage.tsx`: `const [error, setError] = useState<{ title: string; message: string } | null>(null)`
- Electron IPC handlers throw specific errors that propagate to renderer process
- BDD-style error assertions in tests: `expect(mockFn).toHaveBeenCalledWith(expectedValue)`

**Guard Clauses:**
- Early return pattern used extensively (e.g., `if (!installed) { ... return; }`)
- Null/undefined checks before operations
- Type guards used with `instanceof Error` pattern: `error instanceof Error ? error.message : 'Unknown error'`

## Logging

**Framework:** `console.*` methods (no structured logging library)

**Patterns:**
- `console.warn()` for non-critical issues
- `console.error()` for exceptions and failures
- Logging callback pattern in electron: `setLogCallback()` function allows main process to stream logs to renderer
- Example: `setLogCallback((line: string) => { mainWindow?.webContents.send('docker:log', line); })`
- Test logging in `docker.ts`: `emitLog()` internal function trims and filters empty lines before callback

## Comments

**When to Comment:**
- Complex algorithms or non-obvious logic (e.g., Docker port detection with fallback strategy)
- Boundary conditions and timeout constants with rationale
- Section separators for major logical blocks (e.g., `// ---------------------------------------------------------------------------`)
- Type definitions followed by inline documentation in types (not separate comments)
- Very rarely used; code preferred to be self-documenting through naming

**JSDoc/TSDoc:**
- Not used; TypeScript interfaces and type signatures are self-documenting
- Function names and parameters are sufficiently descriptive

## Function Design

**Size:** Functions range from 5 lines (simple handlers) to 80+ lines (complex setup sequences)
- No strict function size limit enforced
- Complex multi-step operations kept together in single function with clear step comments
- Example: `runSetup()` in `SetupPage.tsx` contains 6-step Docker/backend initialization

**Parameters:**
- Destructuring used for React component props
- Named objects preferred over multiple parameters for option-like arguments
- Example: `function createWindow()` takes no parameters; configuration is hardcoded
- IPC handlers use `(_event, ...args)` pattern where event is unused but TypeScript-required

**Return Values:**
- Promises extensively used for async operations
- `void` return type for event handlers and callbacks
- Discriminant unions for complex state (e.g., `PortModalState = { open: false } | { open: true; conflicts: PortConflict[]; resolve: ... }`)
- Generic promise resolution: `Promise<T>` where T is clearly typed

## Module Design

**Exports:**
- Mix of named and default exports
- React components use default exports: `export default function SetupPage(...)`
- Utility modules use named exports: `export function checkInstalled(): boolean`
- Type-only exports for interfaces: `export interface DockerStatus { ... }`
- Electron module re-exports aggregated from multiple sub-modules (e.g., `index.ts` imports from `docker.ts`, `keystore.ts`, etc.)

**Barrel Files:**
- Not used; direct imports from source files preferred throughout codebase

**Separation of Concerns:**
- Main process logic isolated in `src/main/` (Electron, Docker, filesystem operations)
- Renderer process logic isolated in `src/renderer/` (React components, UI state)
- Type definitions centralized in `src/renderer/types.ts` for cross-process contracts
- Test files co-located with source (`.test.tsx` or `.test.ts` extension)

---

*Convention analysis: 2026-03-26*
