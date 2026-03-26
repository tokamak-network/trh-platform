# Feature Landscape

**Domain:** Blockchain L2 Rollup Preset Deployment Test Harness
**Researched:** 2026-03-26

## Table Stakes

Features users (developers) expect. Missing = test suite is incomplete and untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Preset config unit tests | Core value proposition -- 4 Presets must generate correct genesis config, chain params, module sets | Low | Each preset has deterministic output; pure function testing |
| Preset parameter matrix validation | BatchFreq, OutputFreq, Backup, RegisterCandidate differ per preset; wrong values = broken L2 | Low | Data-driven tests against PROJECT.md comparison table |
| Predeploy list correctness tests | DeFi needs Uniswap/USDC, Gaming needs VRF/AA, Full needs all; missing predeploy = broken chain | Low | Assert exact predeploy contract lists per preset |
| Module activation combination tests | Bridge/Explorer/Monitoring/Uptime differ per preset; wrong modules = incomplete deployment | Low | Boolean matrix assertion against preset spec |
| Fee token availability tests | General supports TON/ETH only; DeFi/Gaming/Full add USDT/USDC | Low | Enum-level validation |
| BIP44 key derivation tests | admin/sequencer/batcher/proposer must derive correctly from seed phrase | Low | Already partially exists (keystore.test.ts); deterministic HD wallet output |
| EOA funding threshold tests | testnet 0.5 ETH, mainnet 2 ETH minimum per account; wrong thresholds = failed deployment | Low | Mock RPC balance responses, assert threshold logic |
| Mock boundary isolation | All external deps (L1/L2 RPC, Docker CLI, AWS SDK) must be mocked; real calls = flaky/slow tests | Medium | Define clear mock interfaces at each integration point |
| Backend API contract tests | POST /preset-deploy and related endpoints must accept/reject correct payloads | Medium | Schema validation against actual backend DTOs |
| Docker compose schema validation | Health checks, container ordering (postgres -> backend -> ui), volume config must be correct | Low | Parse docker-compose.yml, assert structure programmatically |
| CI-compatible execution | Tests must run in CI without Docker daemon, real networks, or AWS credentials | Low | Already implied by mock-only constraint; verify no leaked real deps |
| Test isolation (no shared state) | Each test runs independently; no ordering dependencies between test files | Low | Vitest default behavior, but must be enforced for mock state resets |
| Confidence-building coverage reporting | Developers need to see which presets/flows are covered and which are not | Low | Vitest built-in coverage with c8/istanbul |

## Differentiators

Features that elevate the test suite from "basic correctness" to "reliable deployment safety net."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Electron IPC payload round-trip tests | Validate that Electron main process <-> renderer payloads match expected shapes across the full flow | Medium | Use electron-mock-ipc or manual vi.mock; covers keystore injection, docker status, AWS creds |
| Deployment flow state machine tests | Model the deployment as a state machine (Pending -> InProgress -> Success/Failed) and test all transitions | Medium | Mirrors backend TaskManager lifecycle; catches impossible state transitions |
| Cross-preset regression matrix | Single test file that parametrically runs all 4 presets through the same assertions, flagging any preset that drifts | Low | Vitest `describe.each` or `test.each` with preset config objects |
| Snapshot testing for genesis configs | Capture known-good genesis JSON outputs; any change triggers explicit approval | Low | Vitest snapshot feature; catches accidental config drift |
| WebView injection validation | Verify window.__TRH_DESKTOP_ACCOUNTS__ and window.__TRH_AWS_CREDENTIALS__ injection logic | Medium | Mock WebContentsView.executeJavaScript, assert injected values |
| Error path coverage | Test what happens when Docker is not installed, backend is unreachable, keystore is corrupted, seed phrase is invalid | Medium | Each error path has a defined recovery behavior; tests prevent silent failures |
| Multi-repo type contract alignment | Verify that TypeScript types in trh-platform match Go DTO structures in trh-backend | High | Requires type extraction from Go structs; can use JSON Schema as bridge |
| Integration health check sequencing tests | Validate that IntegrationManager executes Bridge, Explorer, Monitoring in correct order with correct dependencies | Medium | Mock IntegrationInterface implementations; assert execution order |
| Deployment progress event stream tests | Verify IPC events (docker:pull-progress, docker:status-update, docker:install-progress) fire in correct sequence | Medium | Event listener mocking; assert event ordering and payload shapes |
| Playwright E2E for preset wizard flow | 3-step wizard (Preset selection -> Configuration -> Deploy) exercised through actual UI rendering | High | Requires Playwright + running frontend; highest fidelity but slowest |

## Anti-Features

Features to explicitly NOT build. These waste effort or create false confidence.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real L1/L2 RPC integration tests | Slow (minutes per test), flaky (network dependent), expensive (gas costs on testnet), defeats mock-first design | Mock all RPC calls with deterministic responses; test RPC call shapes, not blockchain state |
| Docker container spin-up tests | Requires Docker daemon in CI, slow (image pulls), infrastructure-dependent | Validate docker-compose.yml schema statically; mock Docker CLI exec calls |
| AWS credential/SSO flow tests | Requires real AWS accounts, secrets management in CI, environment-specific | Mock AWS SDK responses; test credential shape handling, not real auth |
| Performance/load testing | Project scope explicitly excludes performance; logic correctness is the goal | If ever needed later, separate test suite with different tooling |
| CrossTrade module tests | Module is still under development; testing unstable code creates maintenance burden | Add when module stabilizes; track as future scope |
| Helm/Kubernetes deployment tests | Cloud infra testing is out of scope per PROJECT.md; different concern than preset logic | Separate infra test suite if ever needed |
| Flaky retry/polling tests | Tests that poll for container health with real timeouts create intermittent CI failures | Use deterministic mock responses with instant resolution |
| Screenshot comparison tests | UI pixel testing is brittle, high-maintenance, and overkill for deployment logic validation | Playwright interaction tests are sufficient for E2E wizard flow |
| Contract deployment verification | Actual Solidity contract deployment testing belongs in tokamak-thanos repo, not the platform test harness | Test that correct contract addresses/ABIs are referenced, not that contracts deploy |

## Feature Dependencies

```
BIP44 key derivation tests (independent - no deps)
         |
         v
EOA funding threshold tests (needs: key derivation to produce addresses)
         |
         v
Preset config unit tests (independent - no deps)
Preset parameter matrix validation (independent - no deps)
Predeploy list correctness tests (independent - no deps)
Module activation combination tests (independent - no deps)
Fee token availability tests (independent - no deps)
         |
         +--- All above feed into --->  Cross-preset regression matrix
         |
         v
Mock boundary isolation (prerequisite for all integration-level tests)
         |
         +---> Backend API contract tests
         +---> Electron IPC payload round-trip tests
         +---> WebView injection validation
         +---> Deployment flow state machine tests
         +---> Error path coverage
         |
         v
Docker compose schema validation (independent - static analysis)
         |
         v
Playwright E2E for preset wizard flow (depends on: all mock infra + running frontend)
```

## MVP Recommendation

### Phase 1: Preset Logic Correctness (build first)

1. **Preset config unit tests** -- core value, fastest to write, highest confidence gain
2. **Preset parameter matrix validation** -- covers BatchFreq/OutputFreq/Backup/RegisterCandidate
3. **Predeploy list correctness tests** -- DeFi/Gaming/Full predeploy sets
4. **Module activation combination tests** -- Bridge/Explorer/Monitoring/Uptime matrix
5. **Fee token availability tests** -- TON/ETH vs extended set
6. **Cross-preset regression matrix** -- parametric test covering all 4 presets

### Phase 2: Integration Mock Infrastructure (build second)

7. **BIP44 key derivation tests** -- extend existing keystore.test.ts
8. **EOA funding threshold tests** -- mock RPC, assert thresholds
9. **Mock boundary isolation** -- establish mock patterns for Docker/RPC/AWS
10. **Backend API contract tests** -- validate request/response shapes
11. **Docker compose schema validation** -- static structure checks

### Phase 3: Flow and IPC Testing (build third)

12. **Electron IPC payload round-trip tests** -- main <-> renderer communication
13. **Deployment flow state machine tests** -- lifecycle transitions
14. **Error path coverage** -- failure scenarios
15. **WebView injection validation** -- credential/account injection

### Defer

- **Playwright E2E**: Highest complexity, requires running frontend; build after mock layer is solid
- **Multi-repo type contract alignment**: High complexity, cross-repo coordination; address when type drift becomes a real problem
- **Deployment progress event stream tests**: Nice-to-have after core flow tests exist

## Sources

- [Electron Testing Documentation](https://www.electronjs.org/docs/latest/development/testing)
- [electron-mock-ipc](https://github.com/h3poteto/electron-mock-ipc) -- IPC mocking library for Electron tests
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
- [End-to-End Testing for Microservices (2026)](https://www.bunnyshell.com/blog/end-to-end-testing-for-microservices-a-2025-guide/)
- [Docker Compose Health Checks Guide](https://last9.io/blog/docker-compose-health-checks/)
- [Blockchain Testing Best Practices](https://www.lambdatest.com/learning-hub/blockchain-testing)
- Existing codebase: `src/main/keystore.test.ts`, `src/main/aws-auth.test.ts` (current test patterns)
- Project context: `.planning/PROJECT.md` (preset comparison table, scope constraints)
