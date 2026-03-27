# Phase 4: E2E Wizard Scenarios - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

`trh-platform-ui` (Next.js webapp, localhost:3000)의 Preset 배포 wizard 전체 흐름을 Playwright로 자동 검증한다. Electron 앱 실행 불필요, Docker 데몬 불필요. trh-platform-ui dev server + MSW mock으로 격리된 환경에서 E2E 시나리오 실행.

요구사항: E2E-01, E2E-02, E2E-03, E2E-04

</domain>

<decisions>
## Implementation Decisions

### E2E Target (E2E-01)
- **D-01:** 테스트 대상은 `trh-platform-ui` (Next.js webapp, localhost:3000). Electron 렌더러(ConfigPage/SetupPage)가 아님. 실제 Preset 배포 wizard UI가 platform-ui에 있음.
- **D-02:** Playwright가 trh-platform-ui dev server에 직접 접근. `playwright.config.ts`의 `webServer` 설정으로 dev server를 Playwright가 자동 시작.

### Playwright Setup
- **D-03:** `playwright.config.ts`는 `trh-platform` 루트에 위치. E2E 테스트 파일은 `tests/e2e/` 디렉토리에 위치. Phase 1~3의 `tests/unit/`과 동일한 레이어.
- **D-04:** `webServer` 설정: `{ command: 'pnpm dev', url: 'http://localhost:3000', cwd: '../trh-platform-ui', reuseExistingServer: !process.env.CI }`. Docker 데몬, 실제 네트워크 불필요 (INFR-01 충족).

### API Mock Strategy (E2E-02, E2E-03, E2E-04)
- **D-05:** MSW (Mock Service Worker)를 trh-platform-ui에 추가하여 Backend API 호출을 mock. `NEXT_PUBLIC_MSW=true` 환경변수로 test 환경에서만 활성화.
- **D-06:** MSW handler는 `trh-platform-ui/src/mocks/` 디렉토리에 위치. Playwright webServer command에서 환경변수 주입: `NEXT_PUBLIC_MSW=true pnpm dev`.
- **D-07:** Phase 3에서 정의한 `PresetDeployRequestSchema` (api-contract.schema.ts)와 동일한 응답 구조로 MSW 핸들러 작성 — mock 정합성 보장.

### Test Coverage (E2E-01~04)
- **D-08:** `test.each(['general', 'defi', 'gaming', 'full'])` 로 4개 Preset 파라메트릭 커버. 각 Preset에 동일한 3-step wizard 흐름 검증.
- **D-09:** Funding 상태 검증(E2E-03)은 MSW 핸들러를 통해 "잔액 미달" 응답과 "잔액 충분" 응답 두 케이스를 시나리오별로 분리.
- **D-10:** 배포 진행 상태 검증(E2E-04)은 MSW로 진행 상태 이벤트를 순차적으로 반환하여 UI 업데이트 검증.

### Claude's Discretion
- trh-platform-ui wizard의 실제 컴포넌트/페이지 구조와 CSS selector (researcher가 코드 읽어서 결정)
- MSW handler 파일 세부 구조 및 응답 데이터 형태
- Playwright Page Object Model 사용 여부 및 helper 구조
- trh-platform-ui에 msw devDependency 추가 여부 확인 (이미 있을 수 있음)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Target App - Platform UI Wizard
- `../trh-platform-ui/src/` — wizard 페이지/컴포넌트 전체 (E2E-01 selector 기반 자동화 대상)
- `../trh-platform-ui/package.json` — MSW 의존성 여부 확인, dev script 파악

### Existing Patterns (재사용)
- `src/renderer/mock/electronAPI.ts` — 기존 mock 패턴 (scenario 기반 분기 방식 참조)
- `tests/schemas/api-contract.schema.ts` — Phase 3 API contract (MSW 핸들러 응답 구조 참조)
- `tests/fixtures/presets.json` — Preset fixture (expected module preview / deploy time 검증 기준)

### Phase 1 Patterns
- `tests/unit/preset-config.test.ts` — Preset별 기대값 패턴 (E2E-02 모듈 미리보기 기댓값)
- `vitest.config.mts` — 현재 test 설정 (playwright config와 분리 필요)

### Phase 4 Requirements
- `.planning/REQUIREMENTS.md` §E2E — E2E-01~04 상세 요구사항

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/fixtures/presets.json` — 4개 Preset의 모듈, 파라미터 기댓값 (E2E-02 검증 기준)
- `tests/schemas/api-contract.schema.ts` — PresetDeployRequestSchema (MSW mock 정합성)
- `src/renderer/mock/electronAPI.ts` — scenario 기반 mock 패턴 (MSW handler 설계에 참조)

### Established Patterns
- Phase 1~3: Zod 스키마 기반 mock 정합성 → MSW handler도 동일 스키마 재사용
- Phase 2: readFileSync + regex 정적 분석 → E2E에서는 Playwright locator 기반 동적 검증으로 전환
- `test.each` 파라메트릭: Phase 1 preset-matrix.test.ts 패턴 그대로 E2E에 적용

### Integration Points
- `playwright.config.ts` (신규): `trh-platform` 루트에 추가, `webServer` 설정으로 dev server 연동
- `tests/e2e/` (신규): wizard 흐름 테스트 파일 위치
- `../trh-platform-ui/src/mocks/` (신규): MSW handler 추가 위치

### Known Risk
- trh-platform-ui의 실제 wizard UI 구조, selector, test-id 는 researcher가 직접 코드를 읽어야 함
- MSW가 trh-platform-ui에 이미 설치되어 있는지 확인 필요 (없으면 devDependency 추가)
- Next.js 13+ App Router vs Pages Router에 따라 MSW setup 방식이 다름

</code_context>

<specifics>
## Specific Ideas

- `playwright.config.ts`: `testDir: './tests/e2e'`, `webServer.command: 'NEXT_PUBLIC_MSW=true pnpm dev'`
- MSW handler: `http.post('/api/stacks/thanos/preset-deploy', () => HttpResponse.json({ deploymentId: 'test-123' }))`
- 잔액 미달 시나리오: MSW가 funding status API에서 `{ sufficient: false, balance: '0.1 ETH' }` 반환
- 파라메트릭: `for (const preset of ['general', 'defi', 'gaming', 'full']) { test(...) }`

</specifics>

<deferred>
## Deferred Ideas

- trh-platform-ui 레포지토리 내부에 playwright config 추가 (테스트 하네스 분리 목적으로 trh-platform에 유지)
- playwright-electron을 이용한 Electron 앱 전체 흐름 E2E (Phase 4 범위 초과)
- visual regression (스크린샷 비교) — REQUIREMENTS.md 범위 외로 명시됨
- CrossTrade, RegisterCandidate 시나리오 — 개발 중이므로 범위 외

</deferred>

---

*Phase: 04-e2e-wizard-scenarios*
*Context gathered: 2026-03-27*
