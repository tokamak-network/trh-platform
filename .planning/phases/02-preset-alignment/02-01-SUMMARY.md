---
phase: 02-preset-alignment
plan: 01
subsystem: testing
tags: [go, tdd, preset, crossTrade, constants, stack_lifecycle]

requires:
  - phase: 01-crosstrade-core
    provides: CrossTrade deployment infrastructure and ABI bindings

provides:
  - TDD RED tests for SDK PresetModules crossTrade alignment (chain_test.go)
  - TDD RED tests for Backend crossTrade local deployment unblock (stack_lifecycle_test.go)

affects: [02-02-preset-alignment-implementation]

tech-stack:
  added: []
  patterns:
    - "TDD RED scaffold: write failing tests before implementation to pin expected behavior"
    - "standard testing package only — no external assertion libraries in Go unit tests"
    - "thanos_test package for external-package Backend integration tests"

key-files:
  created:
    - ../trh-sdk/pkg/constants/chain_test.go
    - ../trh-backend/pkg/services/thanos/stack_lifecycle_test.go
  modified: []

key-decisions:
  - "Backend test simulates localUnsupported map without crossTrade to verify BE-01 precondition"
  - "Gaming preset crossTrade removal also tested in Backend to prevent regression"

patterns-established:
  - "TDD RED: write all failing tests before any implementation changes"

requirements-completed: [SDK-08, SDK-09, SDK-10, BE-01, BE-02]

duration: 15min
completed: 2026-04-07
---

# Phase 02 Plan 01: Wave 0 TDD 테스트 스캐폴드 Summary

**SDK PresetModules crossTrade 정합성 테스트와 Backend localUnsupported 제거 검증 테스트를 TDD RED 상태로 작성하여 Plan 02-02 구현의 기반 마련**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-07T00:00:00Z
- **Completed:** 2026-04-07T00:12:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- SDK `chain_test.go` 생성: 4개 subtest로 구성된 `TestPresetModulesCrossTrade` 작성, DeFi/Gaming subtest 의도적 FAIL 확인
- Backend `stack_lifecycle_test.go` 생성: `TestLocalDeploymentCrossTradeEntityCreation` + `TestLocalUnsupportedNoCrossTrade` 작성, DeFi subtest 의도적 FAIL 확인
- `go vet` 두 파일 모두 통과 — 타입 안전성 확보

## Task Commits

각 task는 개별적으로 커밋됨:

1. **Task 1: SDK PresetModules crossTrade 정합성 테스트** - `8376ee2` (test)
2. **Task 2: Backend stack_lifecycle crossTrade 로컬 배포 허용 테스트** - `28910b6` (test)

## Files Created/Modified

- `/Users/theo/workspace_tokamak/trh-sdk/pkg/constants/chain_test.go` - SDK PresetModules crossTrade 정합성 TDD RED 테스트 (4개 subtest)
- `/Users/theo/workspace_tokamak/trh-backend/pkg/services/thanos/stack_lifecycle_test.go` - Backend 로컬 배포 crossTrade entity 생성 TDD RED 테스트

## Decisions Made

- Backend 테스트에서 `localUnsupported` 맵을 인라인으로 시뮬레이션: `stack_lifecycle.go` 내부 로직 직접 접근 불가이므로 preset definitions 레벨에서 검증
- Gaming preset crossTrade 제거도 Backend 테스트에 포함: 회귀 방지 목적
- `thanos_test` external package 사용: presets 패키지를 외부에서 임포트하는 패턴이 서비스 경계를 명확히 함

## Deviations from Plan

없음 — 계획대로 정확하게 실행됨.

## Issues Encountered

없음.

## TDD RED 상태 확인

### SDK (trh-sdk/pkg/constants)

```
=== RUN   TestPresetModulesCrossTrade/DeFi_has_crossTrade_true
    FAIL: PresetModules["defi"] should have crossTrade key
=== RUN   TestPresetModulesCrossTrade/Gaming_has_no_crossTrade
    FAIL: PresetModules["gaming"] should not have crossTrade key
=== RUN   TestPresetModulesCrossTrade/Full_has_crossTrade_true
    PASS
=== RUN   TestPresetModulesCrossTrade/General_has_no_crossTrade
    PASS
```

### Backend (trh-backend/pkg/services/thanos)

```
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/DeFi_local_creates_crossTrade_entity
    FAIL: preset "defi": crossTrade entity creation = false, want true
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/Gaming_local_no_crossTrade_entity
    FAIL: preset "gaming": crossTrade entity creation = true, want false
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/Full_local_creates_crossTrade_entity
    PASS
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/General_local_no_crossTrade_entity
    PASS
=== RUN   TestLocalUnsupportedNoCrossTrade
    FAIL: DefaultPresetDefinitions["defi"].Modules[crossTrade] = false, want true
```

## Next Phase Readiness

- Plan 02-02에서 SDK PresetModules와 Backend DefaultPresetDefinitions를 수정하면 모든 테스트가 GREEN으로 전환됨
- Gaming crossTrade 제거, DeFi crossTrade 추가, Backend localUnsupported crossTrade 제거가 구현 대상
- 테스트 구조가 구현 변경 범위를 정확히 정의함

---
*Phase: 02-preset-alignment*
*Completed: 2026-04-07*
