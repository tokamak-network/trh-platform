# Architecture Patterns

**Domain:** Cross-repo deployment test harness (4 repos, single test location)
**Researched:** 2026-03-26

## Recommended Architecture

### Overview: Layered Mock Architecture with Contract-Based Boundaries

The test harness validates a deployment flow that crosses 4 repositories:

```
Electron (trh-platform) --> Platform UI (trh-platform-ui) --> Backend API (trh-backend) --> SDK CLI (trh-sdk)
     |                            |                               |                            |
     | IPC + window.__globals     | HTTP POST /preset-deploy      | exec trh-sdk deploy        | Docker/L1/L2
     | (mock: electronAPI)        | (mock: HTTP interceptor)      | (mock: CLI stub)           | (mock: all external)
```

The harness does NOT clone or import from other repos. Instead, it mocks the **contracts** (API shapes, IPC payloads, CLI args/outputs) between repos. Each boundary has a mock layer that returns deterministic test data.

### Component Boundaries

| Component | Responsibility | Communicates With | Mock Strategy |
|-----------|---------------|-------------------|---------------|
| **Test Runner** | Orchestrates test execution (Vitest + Playwright) | All mock layers | N/A (top-level) |
| **Preset Fixtures** | Static test data for 4 presets (General, DeFi, Gaming, Full) | All test layers | Shared JSON fixtures |
| **ElectronAPI Mock** | Simulates Electron IPC (docker, keystore, awsAuth, app) | Unit/integration tests | Existing pattern in `src/renderer/mock/electronAPI.ts`, extend with preset scenarios |
| **Backend API Mock** | Simulates HTTP responses from trh-backend | Integration tests, Playwright | MSW (Mock Service Worker) intercepting `/api/v1/stacks/thanos/preset-deploy` |
| **SDK Output Mock** | Simulates trh-sdk CLI stdout/stderr and artifacts | Backend-layer integration tests | Static response fixtures (genesis JSON, deployment status) |
| **Docker Compose Mock** | Simulates container orchestration health/status | Unit tests for setup flow | Already exists in ElectronAPI mock (docker namespace) |
| **Playwright Fixtures** | Browser automation for E2E wizard flow | Platform UI in test mode | Page objects + MSW for network |

### Directory Structure

```
tests/
  fixtures/                    # Shared test data (Preset configurations, expected outputs)
    presets/
      general.json             # Input config + expected genesis params for General preset
      defi.json
      gaming.json
      full.json
    contracts/                 # API contract schemas (request/response shapes)
      preset-deploy-request.ts # TypeScript type + Zod schema for POST body
      preset-deploy-response.ts
      deployment-status.ts
    genesis/                   # Expected genesis config outputs per preset
      general-genesis.json
      defi-genesis.json
      gaming-genesis.json
      full-genesis.json
    accounts.ts                # BIP44 derived test accounts (deterministic from known mnemonic)

  mocks/                       # Mock implementations per boundary
    backend-api/               # MSW handlers simulating trh-backend
      handlers.ts              # Request handlers for /preset-deploy, /stacks/:id/status
      server.ts                # MSW setupServer() instance
    electron-api/              # Extended ElectronAPI mock for test scenarios
      index.ts                 # Re-exports from src/renderer/mock/ with test extensions
    sdk/                       # Simulated trh-sdk CLI outputs
      deploy-output.ts         # Stdout simulation for successful/failed deployments

  unit/                        # Pure logic validation (no HTTP, no browser)
    preset-config.test.ts      # Preset -> chain params mapping correctness
    preset-predeploys.test.ts  # Preset -> predeploys list correctness
    preset-modules.test.ts     # Preset -> module activation correctness
    account-derivation.test.ts # BIP44 key derivation produces expected addresses
    funding-threshold.test.ts  # Testnet 0.5 ETH / mainnet 2 ETH thresholds

  integration/                 # Cross-component tests (mocked external deps)
    ipc-payload.test.ts        # Electron IPC sends correct preset data to webview
    api-contract.test.ts       # POST /preset-deploy request body matches backend schema
    deployment-status.test.ts  # Status polling returns correct state transitions
    docker-health.test.ts      # Docker compose schema validation (service order, health checks)

  e2e/                         # Playwright browser tests
    preset-wizard.spec.ts      # Full wizard flow: select preset -> configure -> deploy
    setup.ts                   # Playwright global setup (MSW, test server)
    page-objects/
      wizard.page.ts           # Page object for 3-step wizard
      rollup-list.page.ts      # Page object for rollup list/detail
```

## Data Flow

### Test Data Flow (Unit Tests)

```
Preset Fixture (JSON)
  |
  v
Test Function (pure logic under test)
  |
  v
Assertion against expected output (from fixture)
```

Unit tests import preset fixture data, run pure functions (config generation, predeploy resolution, module activation), and assert outputs match expected values. No mocks needed -- these test the mapping logic itself.

### Test Data Flow (Integration Tests)

```
Preset Fixture (JSON)
  |
  v
ElectronAPI Mock / MSW Handler (intercepts calls)
  |
  v
Component/Service under test (makes real calls to mocked endpoints)
  |
  v
Assertion: request shape matches contract schema
Assertion: response handling produces correct state
```

Integration tests verify that when a component makes a call, the request payload matches the expected contract and the response is handled correctly.

### Test Data Flow (E2E Tests)

```
Playwright Browser
  |
  v
Platform UI (Next.js, running in test mode)
  |
  v (HTTP intercepted by MSW)
MSW Handler (returns preset fixture data)
  |
  v
Playwright asserts: correct UI state, correct form values, correct final request
```

E2E tests run the actual Platform UI in a browser, with MSW intercepting all backend calls. Playwright drives the 3-step wizard and verifies the full flow.

### Mock Boundary Principle

Each mock operates at a **process boundary**, not an internal abstraction:

| Boundary | Real Protocol | Mock Mechanism |
|----------|--------------|----------------|
| Electron <-> Renderer | IPC (ipcMain/ipcRenderer) | vi.mock('electron') + mock ElectronAPI object |
| Renderer <-> Platform UI | window.__TRH_* globals | Set window globals in test setup |
| Platform UI <-> Backend | HTTP REST | MSW (Mock Service Worker) |
| Backend <-> SDK | exec child_process | Not tested (out of scope -- SDK is separate repo) |
| SDK <-> L1/L2 | RPC JSON-RPC | Not tested (out of scope) |
| SDK <-> Docker | docker compose CLI | Not tested (out of scope) |

The test harness only mocks boundaries that trh-platform code directly touches: Electron IPC, window globals, and HTTP to backend. The backend-to-SDK and SDK-to-chain boundaries are represented by static fixture data (expected genesis configs, expected deployment status responses).

## Patterns to Follow

### Pattern 1: Contract-First Mock Design

**What:** Define API contracts (TypeScript types + Zod schemas) as the source of truth. Mocks implement these contracts. Tests validate against these contracts.

**When:** Always. Every mock must conform to a contract schema.

**Why:** When trh-backend changes its API, updating the contract schema in one place causes type errors in all affected mocks and tests, preventing silent drift.

```typescript
// tests/fixtures/contracts/preset-deploy-request.ts
import { z } from 'zod';

export const PresetDeployRequestSchema = z.object({
  preset: z.enum(['general', 'defi', 'gaming', 'full']),
  networkType: z.enum(['testnet', 'mainnet']),
  l1RpcUrl: z.string().url(),
  chainName: z.string().min(1),
  chainId: z.number().int().positive(),
  adminAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  // ... other fields
});

export type PresetDeployRequest = z.infer<typeof PresetDeployRequestSchema>;
```

```typescript
// tests/mocks/backend-api/handlers.ts
import { http, HttpResponse } from 'msw';
import { PresetDeployRequestSchema } from '../../fixtures/contracts/preset-deploy-request';

export const handlers = [
  http.post('*/api/v1/stacks/thanos/preset-deploy', async ({ request }) => {
    const body = await request.json();
    // Validate request matches contract
    const parsed = PresetDeployRequestSchema.parse(body);
    return HttpResponse.json({
      id: 'test-stack-id',
      status: 'pending',
    });
  }),
];
```

### Pattern 2: Preset Fixture Matrix

**What:** Each preset (General, DeFi, Gaming, Full) has a complete fixture file containing: input config, expected chain parameters, expected predeploys, expected modules, expected genesis fragments.

**When:** Any test that validates preset-specific behavior.

**Why:** The preset comparison table from PROJECT.md becomes executable test data. Adding a new preset means adding one fixture file.

```typescript
// tests/fixtures/presets/defi.json
{
  "preset": "defi",
  "expectedParams": {
    "batchFrequency": 900,
    "outputFrequency": 900,
    "backup": true,
    "registerCandidate": false
  },
  "expectedModules": {
    "bridge": true,
    "blockExplorer": true,
    "monitoring": true,
    "uptimeService": true
  },
  "expectedPredeploys": ["uniswap-v3", "usdc-bridge"],
  "expectedFeeTokens": ["TON", "ETH", "USDT", "USDC"]
}
```

### Pattern 3: Scenario-Driven ElectronAPI Mock

**What:** Extend the existing `src/renderer/mock/electronAPI.ts` scenario pattern (URL params) into test-specific scenarios controlled programmatically.

**When:** Integration and E2E tests that need different Electron states.

**Why:** The project already has this pattern. Tests should build on it, not invent a new one.

```typescript
// tests/mocks/electron-api/index.ts
import { mockElectronAPI } from '../../../src/renderer/mock/electronAPI';

export function createTestElectronAPI(scenario: 'fresh' | 'healthy' | 'dep-missing' | 'pull-fail') {
  // Clone the existing mock and override scenario-specific behavior
  return {
    ...mockElectronAPI,
    // Override specific methods for test control
    docker: {
      ...mockElectronAPI.docker,
      getStatus: async () => {
        if (scenario === 'healthy') return { installed: true, running: true, containersUp: true, healthy: true };
        return { installed: true, running: false, containersUp: false, healthy: false };
      },
    },
  };
}
```

### Pattern 4: Page Object Model for E2E

**What:** Abstract Playwright selectors and interactions behind page objects.

**When:** All E2E (Playwright) tests.

**Why:** When UI changes (selector, step order), only the page object updates.

```typescript
// tests/e2e/page-objects/wizard.page.ts
import { Page } from '@playwright/test';

export class WizardPage {
  constructor(private page: Page) {}

  async selectPreset(preset: 'general' | 'defi' | 'gaming' | 'full') {
    await this.page.getByTestId(`preset-${preset}`).click();
  }

  async fillChainConfig(config: { chainName: string; chainId: number }) {
    await this.page.getByLabel('Chain Name').fill(config.chainName);
    await this.page.getByLabel('Chain ID').fill(String(config.chainId));
  }

  async clickDeploy() {
    await this.page.getByRole('button', { name: 'Deploy' }).click();
  }

  async getDeploymentStatus() {
    return this.page.getByTestId('deployment-status').textContent();
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Importing Code from Other Repos

**What:** Cloning trh-backend or trh-sdk to import their Go types or run their logic.

**Why bad:** Creates build dependency on Go toolchain, couples test updates to other repo releases, makes CI slow and fragile.

**Instead:** Define contract schemas in TypeScript within `tests/fixtures/contracts/`. These schemas represent what trh-platform expects from the backend, not what the backend actually does. If the contract drifts, that is a real bug to catch.

### Anti-Pattern 2: Testing Backend Logic in trh-platform

**What:** Trying to validate that trh-backend correctly processes a preset-deploy request.

**Why bad:** That is trh-backend's responsibility. trh-platform tests should verify that the correct request is SENT, not that it is correctly PROCESSED.

**Instead:** Test the request shape (matches contract), test response handling (success/error paths), test UI state transitions. Backend logic tests belong in trh-backend.

### Anti-Pattern 3: Shared Mutable Mock State Between Tests

**What:** Multiple tests modifying the same mock's internal state without reset.

**Why bad:** Test ordering dependencies, flaky results.

**Instead:** Each test gets a fresh mock instance. Use `beforeEach` to create new mock state. The existing `keystore.test.ts` pattern (vi.resetModules + fresh import) is correct.

### Anti-Pattern 4: Over-mocking Internal Functions

**What:** Mocking every internal function to test a single component.

**Why bad:** Tests become tautological (testing mocks, not logic). Refactoring internals breaks tests even when behavior is unchanged.

**Instead:** Mock at process boundaries only (IPC, HTTP, CLI). Let internal logic run for real.

## Suggested Build Order (Phase Dependencies)

The architecture implies this build sequence:

```
Phase 1: Fixtures + Contracts (no test runner needed)
  |
  v
Phase 2: Unit Tests (Vitest only, pure logic, uses fixtures)
  |
  v
Phase 3: Integration Tests (Vitest + MSW + ElectronAPI mocks)
  |
  v
Phase 4: E2E Tests (Playwright + MSW + running Platform UI)
```

**Rationale:**

1. **Fixtures first** because every other layer depends on shared test data. Contract schemas must be defined before mocks can implement them. This is the foundation -- get it wrong and everything built on top is unreliable.

2. **Unit tests second** because they validate the core preset logic with zero infrastructure. They will catch the most common bugs (wrong BatchFreq for DeFi, missing predeploy for Gaming) with the fastest feedback loop. They depend only on fixtures.

3. **Integration tests third** because they need MSW and ElectronAPI mocks (which are built on fixtures/contracts). They validate that components correctly communicate across boundaries. They depend on fixtures being stable and contracts being defined.

4. **E2E tests last** because they require a running Platform UI instance, Playwright setup, and all mock layers working together. They are the slowest, most complex, and most fragile. They should only be built after unit and integration tests prove the logic is sound.

### Inter-Phase Dependencies

| Phase | Depends On | Produces |
|-------|-----------|----------|
| Fixtures + Contracts | PROJECT.md preset table, backend API shape | JSON fixtures, Zod schemas, TypeScript types |
| Unit Tests | Fixtures | Validated preset logic |
| Integration Tests | Fixtures, Contracts, MSW handlers, ElectronAPI mock | Validated cross-boundary communication |
| E2E Tests | All of the above + running UI | Validated end-to-end wizard flow |

## Technology Choices for Test Infrastructure

| Tool | Purpose | Why |
|------|---------|-----|
| **Vitest** | Unit + integration test runner | Already used in trh-platform (keystore.test.ts, aws-auth.test.ts). Same config. |
| **MSW (Mock Service Worker)** | HTTP mock for backend API | Works in both Node (integration) and browser (E2E). Contract-validating handlers. |
| **Playwright** | E2E browser automation | Specified in PROJECT.md constraints. Works with Next.js. |
| **Zod** | Contract schema validation | Already used in trh-platform-ui. Produces TypeScript types from schemas. |

## Scalability Considerations

| Concern | 4 Presets (Now) | 10+ Presets (Later) | New Repo Added |
|---------|----------------|---------------------|----------------|
| Fixture management | 4 JSON files | Fixture generator from template | Add new contract schema |
| Test matrix | 4x parameterized | Same pattern, more iterations | Add new mock boundary layer |
| CI time | <30s unit, <2min integration, <5min E2E | Parallel preset execution | Unchanged (boundary mocks isolate) |
| Contract drift | Manual sync with backend API | Add CI job to validate schemas against backend OpenAPI (future) | Same pattern per boundary |

## Sources

- Existing test patterns: `src/main/keystore.test.ts`, `src/main/aws-auth.test.ts` (Vitest + vi.mock)
- Existing mock pattern: `src/renderer/mock/electronAPI.ts` (scenario-based mock)
- MSW documentation: https://mswjs.io/docs/ (MEDIUM confidence, based on training data)
- Playwright with Next.js: https://playwright.dev/docs/intro (MEDIUM confidence)
- Project constraints: `.planning/PROJECT.md` (HIGH confidence, direct source)

---

*Architecture analysis: 2026-03-26*
