# Research Summary: TRH Preset Deployment Test Harness

**Domain:** Mock-based test harness for validating preset-based L2 rollup deployment flows
**Researched:** 2026-03-26
**Overall confidence:** HIGH

## Executive Summary

The TRH Platform test harness validates that 4 deployment presets (General, DeFi, Gaming, Full) correctly generate chain configurations, predeploys, module activations, and genesis configs across a multi-process Electron app with a Go backend. The test strategy is entirely mock-based -- no real blockchain, Docker containers, or AWS services are needed.

The existing codebase already has Vitest 4.1.0 with React Testing Library and happy-dom, covering basic keystore and AWS auth tests. The test harness extends this foundation with: (1) Zod-based schema validation for preset configs and Docker compose files, (2) msw for HTTP-level backend API mocking, (3) Playwright for E2E Electron automation. On the Go side, testify and go-ethereum's simulated backend are already in the dependency tree and sufficient for backend/SDK unit tests.

The critical risk is mock fidelity drift -- mocks diverging from real backend behavior across 4 independently-evolving repositories. This is mitigated by contract-first design: define API contracts as Zod schemas that both mocks and assertions validate against. When the real API changes, the schema update propagates to all tests.

The technology stack requires only 4 new npm dependencies: `@playwright/test`, `zod`, `js-yaml`, and `msw`. No Go dependencies need to be added. The Electron 33 + Playwright 1.58.x combination is compatible, but Electron must not be upgraded past 35.x without verifying CDP compatibility (Electron 36.x has a known launch failure with Playwright).

## Key Findings

**Stack:** Vitest 4.1.0 (unit/integration) + Playwright 1.58.x (E2E) + Zod (schema validation) + msw (HTTP mocking). Only 4 new npm deps. Go side needs no additions.

**Architecture:** Layered mock architecture with contract-based boundaries. Tests mock at process boundaries (IPC, HTTP, CLI) only, not internal functions. Fixtures encode the preset comparison table as structured data.

**Critical pitfall:** Mock fidelity drift -- mocks diverging from real Go backend/SDK behavior across 4 repos. Prevention: contract-first Zod schemas shared between mocks and assertions.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: Fixtures + Contract Schemas** - Define test data and API contracts first
   - Addresses: Preset comparison table encoding, shared test data, Zod contract schemas
   - Avoids: Mock fidelity drift (Pitfall #1), Preset table not encoded (Pitfall #8)

2. **Unit Tests: Preset Logic Correctness** - Pure function testing with no mocks
   - Addresses: Preset config validation, predeploy lists, module activation, fee tokens, BIP44 key derivation, funding thresholds
   - Avoids: Testing the mock instead of logic (Pitfall #2), Go boundary gap (Pitfall #5)

3. **Integration Tests: Cross-Boundary Communication** - Mocked external deps, real internal logic
   - Addresses: IPC payload validation, Backend API contract tests, Docker compose schema validation, deployment state machine
   - Avoids: Over-mocking (Pitfall #10), IPC channel mismatch (Pitfall #3)

4. **E2E Tests: Playwright Wizard Flow** - Full user journey automation
   - Addresses: Preset selection through deploy start, 3-step wizard flow
   - Avoids: Electron/Playwright friction (Pitfall #7) by testing UI standalone first

**Phase ordering rationale:**
- Fixtures first because every other layer depends on shared test data and contract schemas
- Unit tests second because they validate core business logic with fastest feedback loop (no mock infrastructure needed)
- Integration tests third because they require MSW and ElectronAPI mocks (built on fixtures/contracts)
- E2E tests last because they are slowest, most complex, and require all mock layers working together

**Research flags for phases:**
- Phase 3: Likely needs deeper research on msw v2 handler patterns for Electron context
- Phase 4: Likely needs deeper research on Playwright `_electron.launch()` configuration for this specific Electron 33 + Vite setup
- Phase 2: Standard patterns, unlikely to need additional research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (TypeScript) | HIGH | Vitest, Zod, msw, Playwright are all well-documented, current, and verified against official sources |
| Stack (Go) | HIGH | testify and go-ethereum simulated backend are already dependencies, standard patterns |
| Features | HIGH | Requirements clearly defined in PROJECT.md with specific preset comparison table |
| Architecture | HIGH | Layered mock architecture follows established patterns from existing codebase tests |
| Pitfalls | MEDIUM | Mock fidelity and IPC mismatch risks are real but preventable with discipline. Cross-repo contract drift is hardest to mitigate |
| Playwright + Electron | MEDIUM | Experimental support, known version constraints, but only viable option |

## Gaps to Address

- msw v2 handler patterns for Electron/Node context need phase-specific research when building integration tests
- Playwright `_electron.launch()` configuration specifics for this project's Electron 33 + Vite build need hands-on experimentation
- Cross-repo contract validation (TypeScript types matching Go structs) is identified as high-value but high-complexity; defer to later phases
- Coverage reporting configuration (c8/istanbul) not yet researched in detail; add during phase 2
- Go-side test patterns for trh-backend preset logic need coordination with backend team

---

*Research summary: 2026-03-26*
