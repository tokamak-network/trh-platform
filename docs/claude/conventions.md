# Code Conventions

## Naming

| Target | Pattern | Examples |
|--------|---------|---------|
| Electron main modules | camelCase | `docker.ts`, `aws-auth.ts`, `keystore.ts` |
| React components | PascalCase | `SetupPage.tsx`, `StepItem.tsx` |
| Test files | `<source>.test.ts(x)` | `SetupPage.test.tsx` |
| Functions | camelCase, action prefix | `checkInstalled()`, `getDockerStatus()`, `startContainers()` |
| Boolean vars | `is/has/show/can` prefix | `isDockerInstalled`, `hasSeedPhrase` |
| React setState | `set` prefix | `setViewMode`, `setError` |
| Event handlers | `handle/on` prefix | `handleConfigDone`, `onComplete` |
| Types/Interfaces | PascalCase, no `I` prefix | `DockerStatus`, `ElectronAPI` |
| Module constants | UPPER_SNAKE_CASE | `UPDATE_CHECK_INTERVAL_MS`, `REQUIRED_PORTS` |

## Code Style

- 2-space indentation, single quotes, semicolons required
- TypeScript strict mode (`strict: true`) in all configs
- No implicit `any`; all function params/returns explicitly typed
- Union types preferred over optional fields

## Imports

- No path aliases; relative imports throughout (`../components/StepItem`)
- No barrel files (`index.ts`); direct source imports
- React components: `export default`; utilities: named exports

## Error Handling

- `try-catch` blocks on all error-prone operations
- React error state: `useState<{ title: string; message: string } | null>(null)`
- Type guard pattern: `error instanceof Error ? error.message : 'Unknown error'`
- Early return pattern used extensively

## Logging

- `console.warn()` non-critical, `console.error()` exceptions
- Main→Renderer log streaming: `setLogCallback()` + `docker:log` IPC event

## Function Design

- IPC handlers: `(_event, ...args)` pattern (event unused but TypeScript-required)
- Discriminant unions for complex state:
  `PortModalState = { open: false } | { open: true; conflicts: PortConflict[]; resolve: ... }`
- `void` return type for event handlers and callbacks
