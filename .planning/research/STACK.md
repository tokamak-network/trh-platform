# Technology Stack - Test Harness

**Project:** TRH Preset Deployment Test Harness
**Researched:** 2026-03-26

## Recommended Stack

### Test Runner (TypeScript Side)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | 4.1.0 | Unit/integration test runner | Already in project. Fast, native ESM, vi.mock() for Electron/child_process mocking. No reason to switch. |
| @playwright/test | ^1.58.2 | E2E testing for Electron app | Only viable option for Electron E2E. Supports `_electron.launch()` via CDP. Electron 33 is compatible (issues start at 36.x). |

**Confidence:** HIGH -- Vitest is already proven in this codebase. Playwright Electron support is experimental but is the only maintained option.

### Schema Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zod | ^3.24 | Docker compose schema validation, preset config validation | TypeScript-native, zero deps, static type inference. Define preset schemas as Zod objects and validate generated configs at test time. |
| js-yaml | ^4.1.0 | YAML parsing | Parse docker-compose.yml into JS objects for Zod validation. Lightweight, well-maintained. |

**Confidence:** HIGH -- Zod is the standard for TypeScript schema validation in 2025-2026. Preferable over Ajv because: (1) no separate JSON Schema files needed, (2) schemas double as TypeScript types, (3) better DX for hand-written validation of known structures like preset configs.

**Why NOT Ajv:** Ajv is faster for high-throughput runtime validation but overkill here. We validate test fixtures, not production traffic. Zod's TypeScript integration is far superior for this use case.

### Mocking Libraries (TypeScript)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest `vi.mock()` | (built-in) | Module mocking | Mock `electron`, `child_process`, `ethers`, external SDKs. Already used in codebase. |
| vitest `vi.fn()` | (built-in) | Function stubs | Mock IPC handlers, API calls, Docker CLI responses. |
| msw | ^2.7 | HTTP request interception | Mock Backend API responses (POST /preset-deploy, GET /stacks). Intercepts at network level, no code changes needed. |

**Confidence:** HIGH for vi.mock/vi.fn (proven). MEDIUM for msw (standard practice but new to this codebase).

**Why msw over manual fetch mocking:** msw intercepts at the network level, meaning tests exercise the actual HTTP client code. Manual `vi.mock('fetch')` skips serialization/deserialization logic where bugs hide.

**Why NOT nock:** nock patches Node.js `http` module globally, causing test isolation issues. msw uses Service Worker (browser) or interceptors (Node) cleanly.

### Testing Library (React Components)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | 16.3.2 | React component rendering | Already in project. Use for renderer process UI tests. |
| @testing-library/user-event | 14.6.1 | User interaction simulation | Already in project. Simulates real DOM events. |
| @testing-library/jest-dom | 6.9.1 | DOM assertion matchers | Already in project. `toBeInTheDocument()`, etc. |
| happy-dom | 20.8.4 | DOM environment | Already configured. Lighter than jsdom, sufficient for React tests. |

**Confidence:** HIGH -- all already in use, no changes needed.

### Go Backend Testing (trh-backend, trh-sdk)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Go `testing` | (stdlib) | Test framework | Standard Go testing. Already used in backend. |
| testify | v1.10.0 | Assertions + mocking | Already a dependency in trh-sdk. `assert`, `require`, `mock` packages. |
| go-ethereum `ethclient/simulated` | (bundled with go-ethereum v1.15.2) | Simulated blockchain backend | Built into go-ethereum. Replaces deprecated `backends.SimulatedBackend`. No external RPC server needed. |
| httptest | (stdlib) | HTTP handler testing | Test Gin handlers without starting a server. |

**Confidence:** HIGH -- all standard Go testing patterns, dependencies already present.

**Why NOT ginkgo/gomega:** testify is already in the dependency tree. Adding a BDD framework increases cognitive load for no benefit in this context.

### E2E / Playwright for Electron

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @playwright/test | ^1.58.2 | Electron E2E test runner | `_electron.launch()` API for launching and automating Electron apps via CDP. |
| playwright (core) | ^1.58.2 | Electron automation library | Provides `_electron` namespace for app launch, window access, IPC evaluation. |

**Confidence:** MEDIUM -- Playwright Electron support is labeled "experimental" but is actively maintained and the only real option. Spectron (the old Electron testing tool) is dead. Key constraint: Electron 33 works fine, but upgrading to Electron 36+ may break (known CDP issue).

### Docker Compose Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zod | ^3.24 | Schema definition and validation | Define expected service structure, port mappings, volume mounts, healthcheck configs as Zod schemas. |
| js-yaml | ^4.1.0 | YAML to JS object parsing | Load docker-compose.yml for validation. |
| `docker compose config` | (CLI) | Official validation | Use in integration tests to verify compose files are syntactically valid. Not a substitute for semantic validation. |

**Confidence:** HIGH -- Zod + js-yaml is straightforward. `docker compose config` is the canonical CLI validator.

### CI Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| GitHub Actions | N/A | CI runner | Already used by tokamak-network. Standard for the org. |

**Confidence:** HIGH -- organizational standard.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Test runner (TS) | Vitest | Jest | Already using Vitest. Jest is slower, worse ESM support, no reason to switch. |
| E2E framework | Playwright | Spectron | Spectron is abandoned (last release 2021). |
| E2E framework | Playwright | WebdriverIO | WDIO Electron support exists but Playwright has better DX, faster execution, and is more actively maintained for Electron. |
| Schema validation | Zod | Ajv + JSON Schema | Ajv requires separate schema files. Zod schemas are TypeScript code that provides both validation and types. |
| Schema validation | Zod | joi | joi has no TypeScript type inference. Zod is the TypeScript-first choice. |
| HTTP mocking | msw | nock | nock patches globals, causing test isolation problems. msw intercepts cleanly. |
| HTTP mocking | msw | vi.mock('fetch') | Manual mocking skips serialization. msw exercises the real HTTP path. |
| Go test framework | testify | ginkgo | testify already in deps. No benefit from BDD style for this project. |
| Blockchain mock (Go) | ethclient/simulated | hardhat node | Go simulated backend is in-process, faster, no external process. Tests are Go-native. |
| IPC mocking | vi.mock('electron') | electron-mock-ipc | electron-mock-ipc is unmaintained (last update 2022). vi.mock() with custom implementations is more flexible and already proven in this codebase. |

## Installation

```bash
# New dependencies for test harness
npm install -D @playwright/test zod js-yaml @types/js-yaml msw

# Install Playwright browsers (Electron tests don't need this, but useful for web E2E)
npx playwright install

# Go side (already present, no new deps needed)
# go-ethereum/ethclient/simulated is bundled
# testify is already in go.sum
```

## Key Version Constraints

| Constraint | Detail |
|------------|--------|
| Electron 33 + Playwright | Compatible. Do NOT upgrade Electron past 35.x without verifying Playwright CDP compatibility. Electron 36.x has a known `electron.launch()` failure. |
| Vitest 4.x + happy-dom | Current setup works. Keep happy-dom for unit tests, Playwright for E2E. Don't try to run Playwright inside Vitest. |
| go-ethereum v1.15.2 | Use `ethclient/simulated` package (new API), NOT the deprecated `backends.SimulatedBackend`. |
| msw v2.x | v2 has breaking changes from v1. Use v2 patterns (handlers array, `http.get()` / `http.post()` syntax). |

## Sources

- [Playwright Electron API docs](https://playwright.dev/docs/api/class-electron) -- official, HIGH confidence
- [Electron 36.x Playwright issue](https://github.com/electron/electron/issues/47419) -- confirmed compatibility constraint
- [Electron automated testing tutorial](https://www.electronjs.org/docs/latest/tutorial/automated-testing) -- official, HIGH confidence
- [go-ethereum simulated package](https://pkg.go.dev/github.com/ethereum/go-ethereum/ethclient/simulated) -- official Go docs, HIGH confidence
- [Vitest mocking guide](https://vitest.dev/guide/mocking.html) -- official, HIGH confidence
- [Zod documentation](https://zod.dev/) -- official, HIGH confidence
- [msw documentation](https://mswjs.io/) -- official, HIGH confidence
- [compose-spec JSON schema](https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json) -- official reference schema

---

*Stack research: 2026-03-26*
