# Domain Pitfalls

**Domain:** Mock-based test harness for multi-service blockchain deployment (Electron + Go Backend + Go SDK + Next.js UI)
**Researched:** 2026-03-26

## Critical Pitfalls

Mistakes that cause rewrites, false confidence, or unusable test suites.

### Pitfall 1: Mock Fidelity Drift — Mocks Diverge from Real Services

**What goes wrong:** Mock responses are written once based on current API behavior, then never updated as the real Go backend and SDK evolve. Tests pass against stale mocks while actual integration is broken. This is especially dangerous here because 4 separate repositories (trh-platform, trh-backend, trh-sdk, trh-platform-ui) evolve independently.

**Why it happens:** The test harness lives in trh-platform but mocks behavior from trh-backend (Go API) and trh-sdk (Go CLI). There is no automated mechanism to detect when the real API contract changes. Developers modify the backend preset-deploy endpoint or SDK CLI flags without updating mocks in the test repo.

**Consequences:**
- 100% test pass rate with zero real-world validity
- False confidence leads to shipping broken preset deployments
- Discovered only during manual QA or production incidents

**Prevention:**
1. **Contract-first mock generation**: Extract API schemas from trh-backend's Go handler types (OpenAPI or JSON Schema) and generate mock response fixtures from them. When schema changes, fixture generation fails, forcing mock updates.
2. **Golden file pattern**: Store actual API responses from a known-good backend run as golden files. CI job periodically re-captures golden files from a running backend and diffs against test fixtures.
3. **Type-shared contracts**: Define shared TypeScript types for IPC payloads (Electron <-> renderer) and HTTP payloads (renderer <-> backend) in a single `types/` package. Both production code and mocks import from the same types.
4. **Version pin in mock metadata**: Each mock fixture includes the backend/SDK git commit hash it was captured from. Test runner logs warnings when mock version is more than N commits behind.

**Detection:** Tests pass but manual preset deployments fail. Backend returns fields that mocks don't include. Mock responses have different structure than actual API.

**Phase mapping:** Phase 1 (foundation) -- establish mock generation patterns before writing any tests.

---

### Pitfall 2: Testing the Mock Instead of the Logic

**What goes wrong:** Tests verify that the mock returns what you told it to return, rather than testing the actual business logic that consumes mock data. Example: test checks "preset-deploy endpoint returns 200" when what matters is "DeFi preset generates correct genesis config with Uniswap predeploys."

**Why it happens:** It is easier to write `expect(mockApi.presetDeploy).toHaveBeenCalledWith(...)` than to validate the downstream effects: correct BatchFreq (900s for DeFi), correct predeploy list, correct module activation. The actual validation logic lives in Go code (trh-sdk), so TypeScript tests can only verify the JavaScript/TypeScript layer.

**Consequences:**
- High test count, low defect detection
- Critical bugs in preset parameter mapping slip through
- Preset comparison table (General vs DeFi vs Gaming vs Full) violations go undetected

**Prevention:**
1. **Test the transformation, not the transport**: Focus unit tests on the data transformations. For example, test that the preset selection UI maps "DeFi" to the correct `POST /preset-deploy` payload with `batchFreq: 900`, `outputFreq: 900`, `backup: true`, `defiPredeploys: true`.
2. **Fixture-driven preset validation**: Create a `presets.fixture.ts` encoding the full comparison table from PROJECT.md. Tests iterate over all 4 presets and validate every parameter against the fixture.
3. **Separate transport tests from logic tests**: Transport tests verify IPC channels exist and payloads serialize. Logic tests verify preset parameter correctness. Never mix them.

**Detection:** Adding a new preset or changing a parameter value -- tests still pass without updating anything.

**Phase mapping:** Phase 2 (unit tests) -- establish test patterns that validate preset logic, not mock plumbing.

---

### Pitfall 3: IPC Channel Mismatch Between Electron Main and Renderer

**What goes wrong:** The test mocks an IPC channel name like `docker:get-status` but the actual Electron main process registers it as `docker:getStatus` (or vice versa). The codebase already has 40+ IPC handlers with inconsistent naming (colons, camelCase, kebab-case mixed). Tests pass because the mock matches the test's expectation, but the real IPC bridge uses a different channel name.

**Why it happens:** Electron IPC channels are stringly-typed. There is no compile-time check that `ipcRenderer.invoke('docker:check-installed')` matches `ipcMain.handle('docker:check-installed')`. The existing codebase has channels defined across `src/main/index.ts` (30+ handlers) and `src/main/webview.ts` (8+ handlers) with no shared channel name registry.

**Consequences:**
- Tests pass, but IPC calls silently fail in the real app (Electron returns undefined for unmatched channels)
- Debugging is painful because failures are silent -- no error thrown, just undefined response
- New IPC channels added without test coverage

**Prevention:**
1. **Shared channel constants**: Create `src/shared/ipc-channels.ts` that exports all channel names as typed constants. Both main process handlers and renderer invokers import from this file. Tests also use these constants.
2. **Exhaustive channel registry test**: A meta-test that reads all `ipcMain.handle` registrations and verifies each has a corresponding test. This prevents new channels from being added without test coverage.
3. **Typed IPC wrapper**: Replace raw `ipcRenderer.invoke(string)` with typed functions: `ipc.docker.getStatus()`. The type system catches mismatches at compile time.

**Detection:** `ipcRenderer.invoke` returns `undefined` instead of expected data. Features work in development but break after refactoring channel names.

**Phase mapping:** Phase 1 (foundation) -- establish IPC channel registry before writing integration tests.

---

### Pitfall 4: Async State Machine Testing Without Temporal Assertions

**What goes wrong:** The deployment flow is a multi-step state machine: Preset Selection -> EOA Funding Check -> Contract Deployment -> Genesis Generation -> Module Installation -> Health Check. Tests assert the final state but skip intermediate states, missing bugs where the state machine transitions incorrectly (e.g., skipping funding check, deploying with wrong genesis).

**Why it happens:** The backend uses a TaskManager with status transitions (NotStarted -> InProgress -> Completed/Failed) and the trh-sdk has a resume state machine. Testing final outcomes is easy; testing state transitions requires temporal assertions and careful mock sequencing. The existing backend has known race conditions in integration status updates (CONCERNS.md documents this).

**Consequences:**
- Tests miss ordering bugs (module installed before genesis deployed)
- Race conditions in task progress updates cause flaky tests
- Resume-from-failure scenarios untested (SDK CONCERNS.md confirms no resume integration tests exist)

**Prevention:**
1. **State transition recorder**: Mock the TaskManager to record all state transitions in order. Assert the full transition sequence, not just final state: `expect(transitions).toEqual(['NotStarted', 'FundingCheck', 'ContractDeploy', 'GenesisGen', 'ModuleInstall', 'Completed'])`.
2. **Temporal test helpers**: Create `waitForState(state, timeoutMs)` helper that resolves when the mock reaches a specific state. This prevents tests from racing past intermediate states.
3. **Deterministic async**: Replace `setTimeout`/polling with explicit event-driven progression in tests. Each state transition is triggered by test code, not by timers.

**Detection:** Tests are flaky (pass sometimes, fail sometimes). Tests pass but deployment gets stuck in intermediate state in production.

**Phase mapping:** Phase 3 (integration tests) -- when testing multi-step flows.

---

### Pitfall 5: Ignoring the Go Boundary — Testing TypeScript Proxies Instead of Go Logic

**What goes wrong:** The test harness tests only the TypeScript/Electron layer, treating the Go backend and Go SDK as opaque boxes behind mocks. But the critical business logic (preset parameter mapping, genesis config generation, BIP44 key derivation paths, funding threshold checks) lives in Go code. TypeScript tests provide zero coverage of the actual logic.

**Why it happens:** The project constraint is "all tests in trh-platform/tests/" using TypeScript/Vitest. The Go backend and SDK are separate repositories. It feels natural to mock them entirely and test the UI/IPC layer. But this creates a dangerous gap: the UI correctly sends "DeFi preset" but the Go backend incorrectly maps it to General parameters.

**Consequences:**
- All 4 preset configurations could be wrong in the Go layer, and TypeScript tests would never catch it
- BIP44 key derivation (seed -> 4 accounts) could produce wrong addresses, undetectable by TS tests
- Funding thresholds (0.5 ETH testnet, 2 ETH mainnet) could be wrong in Go, passing in TS mocks

**Prevention:**
1. **Snapshot testing against Go artifacts**: Run the Go backend/SDK once to generate known-good outputs (genesis configs, derived addresses, module lists) for each preset. Save these as snapshot fixtures. TypeScript tests validate that the mock fixtures match these snapshots.
2. **Companion Go tests**: For critical logic (preset mapping, key derivation, funding checks), maintain a minimal Go test suite in the respective repos. The test harness in trh-platform focuses on integration/E2E, not reimplementing Go unit tests.
3. **API contract validation**: Define the preset-deploy API contract (request/response schema) and validate both sides: Go tests validate the backend implements the contract, TypeScript tests validate the UI sends conforming requests.
4. **CI pipeline dependency**: Make the trh-platform test pipeline depend on trh-backend and trh-sdk test suites passing first. No point running integration tests if unit tests in Go repos fail.

**Detection:** TypeScript tests all pass, but manual deployment with a specific preset produces wrong chain parameters. Key derivation produces different addresses than expected.

**Phase mapping:** Phase 1 (foundation) -- decide the Go/TypeScript testing boundary early. Phase 2 (unit tests) -- create Go snapshots as fixtures.

## Moderate Pitfalls

### Pitfall 6: Docker Compose Mock That Hides Container Ordering Bugs

**What goes wrong:** Tests mock `docker compose up` as a single successful operation, but in reality container startup order matters: PostgreSQL must be ready before backend, backend before frontend. The existing docker-compose.yml uses `depends_on` but without health check conditions. Tests that mock away Docker hide ordering failures.

**Prevention:**
1. Mock at the container health check level, not the compose level. Test that the harness waits for DB health before proceeding.
2. Create a `docker-compose.test.yml` schema validation test that checks `depends_on` relationships match expected ordering.
3. Test the `waitForHealthy()` function's timeout and retry logic with controlled delays.

**Detection:** Tests pass but `make setup` fails intermittently because backend starts before PostgreSQL is ready.

**Phase mapping:** Phase 2 (unit tests) -- test `waitForHealthy` logic.

---

### Pitfall 7: Playwright E2E Tests That Are Flaky Due to Electron Context

**What goes wrong:** Playwright tests for the 3-step wizard (preset selection, configuration, deployment) interact with a Next.js UI inside an Electron WebView. The Electron WebView has special behaviors: certificate bypass on localhost, network guard filtering, credential injection via `executeJavaScript`. Playwright cannot easily control these Electron-specific behaviors, causing tests to be flaky or incomplete.

**Prevention:**
1. **Separate Playwright targets**: Test the Next.js UI standalone (without Electron) for UI logic. Test Electron-specific behaviors (WebView injection, IPC) with Vitest + Electron test utilities.
2. **Do not attempt to test `executeJavaScript` injection via Playwright**. The WebView injection system (`injectKeystoreAccounts`, `injectAutoLogin`) is an Electron main-process concern. Test it with Electron-specific mocking.
3. **Use `@playwright/test` with `webServer` config** pointing to the Next.js dev server directly, bypassing Electron entirely for UI flow tests.

**Detection:** E2E tests pass locally but fail in CI. Tests timeout waiting for WebView to load. Certificate bypass causes test connection errors.

**Phase mapping:** Phase 4 (E2E tests) -- plan Playwright scope carefully.

---

### Pitfall 8: Preset Comparison Table Not Encoded as Test Data

**What goes wrong:** The 4 preset configurations (General, DeFi, Gaming, Full) with their specific BatchFreq, OutputFreq, module combinations, and predeploy lists are documented in markdown (PROJECT.md) but not encoded as structured test data. Tests hardcode individual values, and when a preset's parameters change, some tests are updated while others are missed.

**Prevention:**
1. Create a single `presets.fixture.ts` (or `.json`) that encodes the entire comparison table as structured data.
2. All preset-related tests reference this fixture. Changing a preset parameter requires changing one file.
3. Add a meta-test that validates the fixture against the markdown documentation (or vice versa) to keep them in sync.

**Detection:** Tests for General preset pass but DeFi preset tests have stale parameter values. Inconsistency between test expectations and documentation.

**Phase mapping:** Phase 1 (foundation) -- create fixture before writing any preset tests.

---

### Pitfall 9: Private Key Handling in Test Fixtures Creates Security Risk

**What goes wrong:** Tests for BIP44 key derivation and EOA funding use real-looking private keys or seed phrases in fixtures. These fixtures get committed to git, and developers or CI systems accidentally use test keys for real transactions. The existing codebase already has `VALID_MNEMONIC = 'abandon abandon...'` in keystore.test.ts (a well-known test mnemonic, but the pattern could extend to less-obvious ones).

**Prevention:**
1. **Only use the canonical BIP39 test mnemonic** (`abandon abandon abandon...about`) -- it is universally recognized as a test key.
2. **Never generate random mnemonics in test fixtures**. Any mnemonic that looks real could be accidentally funded.
3. **Add a CI check** that scans test files for private key patterns (64-char hex strings starting with `0x`) and flags them.
4. **Derive expected addresses from the canonical mnemonic** and hardcode the expected addresses (not the keys) in assertions.

**Detection:** Test fixtures contain hex strings that look like private keys. A developer funds a test-derived address on mainnet.

**Phase mapping:** Phase 2 (unit tests) -- establish key handling conventions.

---

### Pitfall 10: Over-Mocking Loses the Integration Signal

**What goes wrong:** Every external dependency is mocked: Docker, IPC, backend API, SDK CLI, filesystem, network. Tests become pure unit tests that verify JavaScript logic in isolation. The integration signal -- whether these components actually work together -- is completely lost. You end up testing that `if (preset === 'DeFi') return defiConfig` works, which is trivially true.

**Prevention:**
1. **Layer the test pyramid explicitly**: Unit tests (mock everything, test transformations), Integration tests (mock only external services like Docker/L1, test IPC + API contracts), E2E tests (mock only blockchain, test full flow).
2. **Integration tests should use real IPC**: Use `@electron/remote` or Electron test harness to test actual `ipcMain.handle` -> `ipcRenderer.invoke` round-trips with mocked Docker/backend.
3. **Identify the "mock boundary"**: Everything inside the Electron app (IPC handlers, state management, UI components) should be tested with minimal mocking. Only mock at the process boundary (Docker CLI, HTTP to backend, filesystem).

**Detection:** All tests pass in under 1 second (suspiciously fast for integration tests). No test ever starts an Electron process or HTTP server.

**Phase mapping:** Phase 3 (integration tests) -- define mock boundaries explicitly.

## Minor Pitfalls

### Pitfall 11: Test Environment Pollution from Singleton Modules

**What goes wrong:** The Electron main process modules (`docker.ts`, `keystore.ts`, `aws-auth.ts`) use module-level state (e.g., `let adminCredentials`, `let currentCredentials`, `activeProcesses` Set). Vitest's module caching means state leaks between tests unless `vi.resetModules()` is called correctly. The existing tests already use this pattern (`keystore.test.ts` line 40, `aws-auth.test.ts` line 47) but it is easy to forget.

**Prevention:**
1. Establish a `beforeEach` template that always calls `vi.resetModules()` and re-imports the module under test.
2. Add a lint rule or test helper that warns if a test file imports a singleton module at the top level instead of inside `beforeEach`.

**Detection:** Tests pass individually but fail when run together. Test order affects outcomes.

**Phase mapping:** Phase 2 (unit tests) -- include in test conventions.

---

### Pitfall 12: Hardcoded Port Numbers in Tests

**What goes wrong:** Tests hardcode ports (3000, 5432, 8000) that conflict with a developer's running instance or CI parallel execution. The existing codebase already has a port mismatch bug (CONCERNS.md: REQUIRED_PORTS uses 5433 but docker-compose.yml uses 5432).

**Prevention:**
1. Tests should never bind real ports. Mock the port-checking functions.
2. If integration tests need ports, use port 0 (OS-assigned) or randomized high ports.
3. Document the known 5432/5433 discrepancy and fix it before writing port-related tests.

**Detection:** Tests fail in CI with "port already in use." Tests pass on one developer's machine but fail on another.

**Phase mapping:** Phase 2 (unit tests) -- address in test infrastructure setup.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Foundation / Test Infrastructure | Mock fidelity drift (#1), IPC channel mismatch (#3) | Establish shared types and channel constants before writing tests |
| Unit Tests (Preset Logic) | Testing the mock (#2), Go boundary gap (#5) | Focus on data transformations, create Go snapshot fixtures |
| Unit Tests (Key Derivation) | Security risk in fixtures (#9) | Use canonical test mnemonic only |
| Integration Tests (IPC + API) | Over-mocking (#10), State machine testing (#4) | Define mock boundary, use state transition recorder |
| Integration Tests (Docker) | Docker ordering hidden (#6) | Mock at health-check level, not compose level |
| E2E Tests (Playwright) | Electron/Playwright friction (#7) | Test UI standalone, test Electron behaviors separately |
| Cross-cutting | Preset table not encoded (#8), Singleton pollution (#11) | Single fixture source of truth, module reset template |

## Sources

- Project context: `.planning/PROJECT.md` -- preset comparison table, deployment flow, constraints
- Codebase concerns: `.planning/codebase/CONCERNS.md` -- port mismatch, test coverage gaps, Docker fragility
- Backend concerns: `.planning/codebase/trh-backend/CONCERNS.md` -- race conditions, task manager issues, error handling
- SDK concerns: `.planning/codebase/trh-sdk/CONCERNS.md` -- resume state machine, panic-based errors, deployment state
- Existing test patterns: `src/main/keystore.test.ts`, `src/main/aws-auth.test.ts` -- mock patterns, module reset usage
- IPC handler inventory: `src/main/index.ts`, `src/main/webview.ts` -- 40+ stringly-typed IPC channels

---

*Concerns audit: 2026-03-26*
