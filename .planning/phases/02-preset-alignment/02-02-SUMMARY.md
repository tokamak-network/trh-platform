---
phase: 02-preset-alignment
plan: 02
subsystem: preset-alignment
tags: [go, tdd-green, preset, crossTrade, constants, stack_lifecycle, sdk, backend]

requires:
  - phase: 02-preset-alignment
    plan: 01
    provides: TDD RED tests for SDK and Backend crossTrade alignment

provides:
  - SDK PresetModules crossTrade 정합성 구현 (DeFi=true, Gaming=없음, Full=true)
  - Backend preset definitions crossTrade 정합성 구현 (DeFi=true, Gaming=false)
  - Backend stack_lifecycle localUnsupported 제거로 로컬 배포 허용

affects: [03-crosstrade-local-docker]

tech-stack:
  added: []
  patterns:
    - "TDD GREEN: 기존 failing 테스트를 통과시키는 최소 코드 변경"
    - "map literal 직접 수정 패턴 — bool 값 토글"
    - "dead code 제거: localUnsupported map + isLocal variable + if 블록"

key-files:
  created: []
  modified:
    - ../trh-sdk/pkg/constants/chain.go
    - ../trh-backend/pkg/services/thanos/presets/service.go
    - ../trh-backend/pkg/services/thanos/stack_lifecycle.go

key-decisions:
  - "PresetGaming에서 crossTrade 완전 제거 (false 유지가 아니라 키 자체 없음) — SDK-09 요구사항"
  - "Backend Gaming preset은 crossTrade: false 유지 (키 삭제 아님, HelmValues 정합성 필요)"
  - "localUnsupported 맵과 isLocal 변수는 완전 삭제 — dead code로 판단"

metrics:
  duration: 3min
  completed: 2026-04-07
  tasks: 2
  files_modified: 3
---

# Phase 02 Plan 02: TDD GREEN 전환 — 실제 코드 변경 Summary

**SDK PresetModules와 Backend preset definitions에서 DeFi=crossTrade true, Gaming=crossTrade false 정합성을 구현하고, Backend localUnsupported에서 crossTrade를 제거하여 로컬 배포를 허용**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T00:15:02Z
- **Completed:** 2026-04-07T00:17:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- SDK `chain.go` 수정: PresetDeFi에 `crossTrade: true` 추가, PresetGaming에서 `crossTrade` 키 제거
- Backend `presets/service.go` 수정: DeFi crossTrade `false→true`, Gaming crossTrade `true→false` (Modules + HelmValues 모두)
- Backend `stack_lifecycle.go` 수정: `localUnsupported` 맵, `isLocal` 변수, `if isLocal && localUnsupported[module]` 블록 완전 제거
- 모든 TDD RED 테스트 GREEN 전환: SDK 4개 subtest + Backend 5개 subtest 모두 PASS
- 기존 preset 테스트 11개 회귀 없이 PASS

## Task Commits

1. **Task 1: SDK PresetModules crossTrade 정합성 수정** — `da7b227` (feat, trh-sdk)
2. **Task 2: Backend preset definitions + localUnsupported 수정** — `6bbd35d` (feat, trh-backend)

## Files Created/Modified

- `/Users/theo/workspace_tokamak/trh-sdk/pkg/constants/chain.go` — PresetDeFi에 crossTrade 추가, PresetGaming에서 crossTrade 제거
- `/Users/theo/workspace_tokamak/trh-backend/pkg/services/thanos/presets/service.go` — DeFi/Gaming crossTrade bool 값 수정
- `/Users/theo/workspace_tokamak/trh-backend/pkg/services/thanos/stack_lifecycle.go` — localUnsupported 관련 dead code 제거

## Decisions Made

- Backend Gaming preset에서 crossTrade 키를 삭제하지 않고 `false`로 유지: HelmValues와의 정합성 및 명시적 비활성화 의미 보존
- SDK PresetGaming에서는 crossTrade 키 자체를 삭제: SDK-09 요구사항은 "Gaming에 crossTrade 없음"이므로 존재 여부가 테스트 기준
- `localUnsupported` 전체 삭제: 더 이상 참조하는 코드 없음, go vet 통과

## Deviations from Plan

없음 — 계획대로 정확하게 실행됨.

## Known Stubs

없음.

## Pre-existing Issues (Out of Scope)

`TestGetFundingStatus_*` (4개) — `funding_test.go`에서 잘못된 private key 픽스처 사용으로 발생하는 기존 실패. 이번 플랜과 무관. `deferred-items.md`에 기록됨.

## TDD GREEN 결과

### SDK (trh-sdk/pkg/constants)

```
=== RUN   TestPresetModulesCrossTrade/DeFi_has_crossTrade_true    PASS
=== RUN   TestPresetModulesCrossTrade/Gaming_has_no_crossTrade    PASS
=== RUN   TestPresetModulesCrossTrade/Full_has_crossTrade_true    PASS
=== RUN   TestPresetModulesCrossTrade/General_has_no_crossTrade   PASS
```

### Backend (trh-backend/pkg/services/thanos)

```
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/DeFi_local_creates_crossTrade_entity    PASS
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/Full_local_creates_crossTrade_entity    PASS
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/Gaming_local_no_crossTrade_entity       PASS
=== RUN   TestLocalDeploymentCrossTradeEntityCreation/General_local_no_crossTrade_entity      PASS
=== RUN   TestLocalUnsupportedNoCrossTrade                                                    PASS
```

## Requirements Completed

- SDK-08: PresetDeFi에 crossTrade=true 추가
- SDK-09: PresetGaming에서 crossTrade 키 제거
- SDK-10: PresetFull crossTrade=true 유지 확인
- BE-01: Backend localUnsupported에서 crossTrade 제거
- BE-02: Backend DeFi/Gaming preset crossTrade 정합성 구현

---
*Phase: 02-preset-alignment*
*Completed: 2026-04-07*
