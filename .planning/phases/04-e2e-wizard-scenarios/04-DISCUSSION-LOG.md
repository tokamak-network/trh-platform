# Phase 4: E2E Wizard Scenarios - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-03-27
**Phase:** 04-e2e-wizard-scenarios
**Areas discussed:** 4 gray areas

---

## Outcome

| Decision Area | Resolution |
|---------------|------------|
| E2E 테스트 대상 앱 | trh-platform-ui (Next.js webapp) — Electron 렌더러가 아님 |
| Playwright 접근 방식 | trh-platform-ui dev server 직접 (webServer config) |
| API Mock 전략 | MSW (Mock Service Worker), NEXT_PUBLIC_MSW=true 환경변수 |
| Playwright 파일 위치 | trh-platform/tests/e2e/ (기존 tests/unit/과 동일 레이어) |
| Preset 커버리지 | 4 Preset 파라메트릭 (test.each) |

## Claude's Discretion

- trh-platform-ui wizard 컴포넌트 구조 및 Playwright selector
- MSW handler 파일 세부 구조
- Page Object Model 사용 여부
- msw devDependency 추가 방법 (trh-platform-ui에 기존 설치 여부 확인 후)

## Deferred Ideas

- playwright-electron Electron 앱 전체 흐름 테스트
- visual regression 스크린샷 비교
- CrossTrade/RegisterCandidate 시나리오
