# Phase 1: Foundation & Preset Logic - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

테스트 인프라를 구축하고, 4개 Preset(General, DeFi, Gaming, Full)의 config/funding 핵심 로직을 unit test로 검증한다. 모든 외부 의존성(L1/L2 RPC, Docker, AWS)은 mock 처리. CrossTrade와 RegisterCandidate는 범위 외.

</domain>

<decisions>
## Implementation Decisions

### Test Layout
- **D-01:** `tests/` 디렉토리는 harness 전용으로 사용. 기존 `src/*.test.ts` 파일들(keystore.test.ts, aws-auth.test.ts 등)은 그대로 유지하고 건드리지 않는다.
- **D-02:** Vitest config에서 `tests/` 경로를 include에 추가하여 기존 테스트와 함께 실행 가능하게 한다.

### Preset Data Source
- **D-03:** Preset config 기대값은 Go 코드(trh-sdk)에서 golden JSON으로 추출하여 사용한다. Go 테스트에서 각 Preset의 정확한 파라미터를 JSON으로 export → TS 테스트에서 이 JSON을 fixture로 읽어서 검증.
- **D-04:** Go 측 golden JSON 생성 스크립트/테스트를 trh-sdk에 추가해야 한다. 변경 시 JSON을 재생성하면 TS 테스트가 자동으로 최신 값을 검증.

### Fixture Structure
- **D-05:** 단일 `presets.json` 파일에 4개 Preset 전체 데이터(chainParams, predeploys, modules, feeTokens, infrastructure별 config)를 관리한다. 파라메트릭 테스트에서 iterate하기 좋고 한눈에 비교 가능.

### Claude's Discretion
- tests/ 내부 하위 디렉토리 구조 (unit/, integration/ 등 분리 여부)
- Zod 스키마 파일 위치 및 네이밍 컨벤션
- BIP44 키 파생 테스트의 테스트 벡터 선정

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Preset Specification
- `docs/preset-deployment-flow.html` — 4개 Preset의 모듈/체인설정/predeploys 비교표 및 배포 흐름 전체 도식
- `.planning/PROJECT.md` §Preset 비교표 — BatchFreq, OutputFreq, Backup, Monitoring 등 파라미터 매트릭스

### Existing Test Patterns
- `src/main/keystore.test.ts` — BIP44 키 파생 테스트 기존 패턴, vi.mock(electron) 사용법
- `src/main/aws-auth.test.ts` — AWS SDK mock 패턴
- `vitest.config.mts` — 현재 Vitest 설정

### Go Preset Logic (golden JSON 추출 대상)
- `../trh-sdk/pkg/stacks/thanos/deploy_chain.go` — Preset별 deploy config 초기화 로직
- `../trh-sdk/pkg/stacks/thanos/deploy_contracts.go` — Predeploys 삽입 로직
- `../trh-backend/pkg/services/thanos/preset_deploy.go` — Backend Preset 배포 서비스

### Research
- `.planning/research/STACK.md` — 테스트 스택 추천 (Vitest, Zod, msw, Playwright)
- `.planning/research/FEATURES.md` — Table stakes/differentiator 분류
- `.planning/research/PITFALLS.md` — Mock fidelity drift, Go/TS boundary 위험

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vitest.config.mts` — 기존 Vitest 설정, include 경로만 추가하면 tests/ 인식 가능
- `src/renderer/mock/electronAPI.ts` — ElectronAPI mock 패턴, IPC mock에 재사용 가능
- `src/main/keystore.ts` — BIP44 키 파생 로직, ethers.js HDNodeWallet 사용

### Established Patterns
- vi.mock('electron') 패턴으로 Electron 모듈 mock
- vi.resetModules()로 테스트 간 모듈 상태 초기화
- describe/it 구조, BDD 스타일 assertion

### Integration Points
- `package.json` scripts에 test 명령 추가 필요
- `tests/fixtures/presets.json` — Go에서 생성된 golden JSON 배치 위치

</code_context>

<specifics>
## Specific Ideas

- Go 코드에서 golden JSON을 추출하는 방식이므로, trh-sdk에 `TestExportPresetFixtures` 같은 Go 테스트를 추가하여 `go test -run TestExportPresetFixtures -v` 실행 시 JSON 파일 생성
- 4 Preset × 2 인프라(Local/AWS) 조합을 `test.each`로 파라메트릭하게 순회

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-preset-logic*
*Context gathered: 2026-03-26*
