---
phase: 03-backend-auto-install-pipeline
plan: "01"
subsystem: trh-backend
tags: [go, backend, crosstrade, auto-install, deployment, preset, local]

dependency_graph:
  requires:
    - phase: 02-preset-alignment
      plan: 02
      provides: Backend localUnsupported crossTrade 제거, DeFi/Full crossTrade=true
    - phase: 01-sdk-l1-deposit-tx-deployment
      plan: 03
      provides: DeployCrossTradeLocal orchestrator in trh-sdk
  provides:
    - Backend thanos_stack.go DeployCrossTradeLocal wrapper function
    - deployment.go crossTrade auto-install block (local preset DeFi/Full)
    - autoInstallCrossTradeLocal() helper reading artifacts + calling SDK
  affects:
    - 03-02: dApp Docker Compose integration (next plan)
    - 03-03: setChainInfo retry logic (next plan)

tech-stack:
  added:
    - trhSDKUtils "github.com/tokamak-network/trh-sdk/pkg/utils" import
    - thanosSDKStack "github.com/tokamak-network/trh-sdk/pkg/stacks/thanos" import
    - go.mod replace directive for local trh-sdk development
  patterns:
    - "auto-install pattern: SDK call + UpdateMetadataAfterInstalled + error → UpdateIntegrationStatusWithReason"
    - "ReadDeployementConfigFromJSONFile: reads {chainId}-deploy.json from deployment artifacts"
    - "Non-fatal crossTrade install: stack remains Deployed even if CrossTrade install fails"

key-files:
  created: []
  modified:
    - ../trh-backend/pkg/stacks/thanos/thanos_stack.go
    - ../trh-backend/pkg/services/thanos/deployment.go
    - ../trh-backend/go.mod

key-decisions:
  - "crossTrade install failure is non-fatal: stack status stays Deployed, integration status set to Failed"
  - "deployer key = AdminAccount field (BIP44 index 0 private key, stored in stack.Config)"
  - "L1CrossTradeProxy and L2toL2CrossTradeL1 constants left empty (placeholder): real Sepolia addresses needed before E2E test"
  - "autoInstallCrossTradeLocal guards L1ChainID==0: rollup.json may not exist at call time"
  - "replace directive in go.mod: enables local trh-sdk development without publishing"

metrics:
  duration: 4min
  completed: 2026-04-07
  tasks: 2
  files_modified: 3
---

# Phase 03 Plan 01: Backend CrossTrade Local Auto-Install Summary

**Backend deployment.go의 local preset auto-install 블록에 CrossTrade SDK 호출을 추가하고, thanos_stack.go에 DeployCrossTradeLocal 래퍼를 구현**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-07T02:18:42Z
- **Completed:** 2026-04-07T02:22:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Task 1: `thanos_stack.go`에 `DeployCrossTradeLocal()` 래퍼 추가
  - SDK `ThanosStack.DeployCrossTradeLocal()` 호출을 표준 Backend 패턴으로 래핑
  - `supportedTokens []thanosStack.TokenPair` 파라미터로 Phase 1 empty slice 지원
  - `go.mod`에 `replace` 지시어 추가로 로컬 SDK 사용 가능
- Task 2: `deployment.go` auto-install 블록에 CrossTrade 처리 추가
  - local infra + crossTrade module 활성화 시 `autoInstallCrossTradeLocal()` 호출
  - 성공 시: `url: "http://localhost:3004"` + `contracts: output`을 integration metadata에 저장
  - 실패 시: integration status를 Failed로 업데이트 (stack은 Deployed 유지 — non-fatal)
  - `autoInstallCrossTradeLocal()` 헬퍼: artifacts에서 OptimismPortalProxy 읽기 → SDK 호출
  - L1CrossTradeProxy/L2toL2CrossTradeL1 상수 정의 (현재 빈 문자열 — Sepolia 주소 필요)

## Task Commits

1. **Task 1: DeployCrossTradeLocal 래퍼 + go.mod replace** — `da3a0b6` (feat, trh-backend)
2. **Task 2: crossTrade auto-install block + autoInstallCrossTradeLocal** — `5fb9c75` (feat, trh-backend)

## Files Created/Modified

- `/Users/theo/workspace_tokamak/trh-backend/pkg/stacks/thanos/thanos_stack.go` — DeployCrossTradeLocal wrapper function 추가
- `/Users/theo/workspace_tokamak/trh-backend/pkg/services/thanos/deployment.go` — crossTrade auto-install 블록, autoInstallCrossTradeLocal helper, 상수 추가
- `/Users/theo/workspace_tokamak/trh-backend/go.mod` — replace directive 추가

## Decisions Made

- **CrossTrade install failure is non-fatal:** stack은 Deployed 상태를 유지하고 integration만 Failed로 마킹. 운영자가 재시도할 수 있음.
- **deployer key = AdminAccount:** `preset_deploy.go`에서 BIP44 index 0 private key가 AdminAccount에 저장됨을 확인.
- **L1 contract address constants 빈 값:** Sepolia pre-deployed CrossTrade L1 주소는 Phase 05 E2E 검증 전에 확인 필요. 현재 빈 문자열로 표시.
- **replace directive:** trh-backend go.mod에 `replace github.com/tokamak-network/trh-sdk => ../trh-sdk` 추가. 로컬 개발 환경에서 SDK를 참조하기 위해 필요.

## Deviations from Plan

**1. [Rule 3 - Blocking] go.mod replace directive 추가**
- **Found during:** Task 1 빌드 시
- **Issue:** trh-backend go.mod의 trh-sdk 버전이 `DeployCrossTradeLocal`이 추가된 커밋보다 오래된 pseudo-version을 참조
- **Fix:** `replace github.com/tokamak-network/trh-sdk => ../trh-sdk` 지시어 추가
- **Files modified:** `trh-backend/go.mod`
- **Commit:** `da3a0b6` (포함됨)

## Known Stubs

1. **`crossTradeSepoliaL1CrossTradeProxy = ""`** — `deployment.go:524`
   - Sepolia에 pre-deployed L1CrossTradeProxy 주소 필요
   - 이 값이 빈 문자열이면 `DeployCrossTradeLocal`이 실패함
   - 해결: Sepolia CrossTrade L1 컨트랙트 주소를 확인하여 채워야 함 (Phase 05 전)

2. **`crossTradeSepoliaL2toL2CrossTradeL1 = ""`** — `deployment.go:529`
   - Sepolia에 pre-deployed L2toL2CrossTradeL1 주소 필요
   - 동일한 이유로 빈 문자열 → 실패
   - 해결: Phase 05 E2E 검증 전 주소 확인 필요

**Note:** 위 스텁은 Phase 03의 핵심 목표(auto-install 파이프라인 구조 구현)를 달성하는 것을 방해하지 않음. 실제 Sepolia 주소 채우기는 Phase 05 범위. Local devnet 테스트 시에는 실제 CrossTrade L1 배포 주소를 사용.

## Verification Results

```
# SDK build
cd /Users/theo/workspace_tokamak/trh-sdk && go build ./pkg/stacks/thanos/ && go vet ./pkg/stacks/thanos/
→ OK

# Backend full build
cd /Users/theo/workspace_tokamak/trh-backend && go build ./... && go vet ./pkg/services/thanos/ && go vet ./pkg/stacks/thanos/
→ OK

# Regression tests
go test ./pkg/services/thanos/... -run "TestLocalDeploymentCrossTradeEntityCreation|TestLocalUnsupportedNoCrossTrade" -v
→ PASS (5/5)
```

## Self-Check: PASSED

- [x] `trh-backend/pkg/stacks/thanos/thanos_stack.go` contains `func DeployCrossTradeLocal(`
- [x] `trh-backend/pkg/services/thanos/deployment.go` contains `autoInstallCrossTradeLocal`
- [x] `trh-backend/go.mod` contains `replace github.com/tokamak-network/trh-sdk`
- [x] commit da3a0b6 exists
- [x] commit 5fb9c75 exists
- [x] `go build ./...` passes for trh-backend
- [x] All 5 CrossTrade alignment tests PASS

---
*Phase: 03-backend-auto-install-pipeline*
*Completed: 2026-04-07*
