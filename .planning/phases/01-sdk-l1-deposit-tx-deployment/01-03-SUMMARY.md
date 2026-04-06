---
phase: 01-sdk-l1-deposit-tx-deployment
plan: "03"
subsystem: trh-sdk
tags: [go, ethclient, crosstrade, deposit-tx, l1, l2, orchestrator, registerToken]

dependency_graph:
  requires:
    - phase: 01-02
      provides: deployL2CrossTradePair, sendDepositCreation, sendDepositCall, waitForContractCode, verifyDepositCallEffect
    - phase: 01-01
      provides: OptimismPortal abigen binding, CrossTrade ABI JSONs, bytecode constants, DeployCrossTradeLocalInput/Output types
  provides:
    - DeployCrossTradeLocal: complete orchestrator deploying L2CrossTrade + L2toL2CrossTradeL2 pairs
    - registerTokenFunc: callback type for L2CrossTrade (3-param) and L2toL2CrossTradeL2 (6-param) registerToken
    - L2CrossTradeABI, L2CrossTradeProxyABI, L2toL2CrossTradeL2ABI, L2toL2CrossTradeProxyABI: exported ABI string constants in abis package
  affects:
    - Phase 02: Backend can now call DeployCrossTradeLocal to deploy CrossTrade on local Docker L2

tech-stack:
  added:
    - abis/cross_trade_abis.go: exported ABI string constants (4 CrossTrade contracts)
  patterns:
    - registerTokenFunc callback: decouples deployL2CrossTradePair from specific registerToken parameter count
    - ABI strings in abis package: matches OptimismPortal.go pattern (const string, not embed)
    - L2 nonce accounting: only creation txs consume nonce (function call txs do not)
    - portal.OptimismPortalTransactor pointer: use &portal.OptimismPortalTransactor for embedded struct

key-files:
  created:
    - ../trh-sdk/abis/cross_trade_abis.go
  modified:
    - ../trh-sdk/pkg/stacks/thanos/cross_trade_local.go

key-decisions:
  - "registerTokenFunc callback pattern chosen over separate deployL2CrossTradePair overloads — single function handles both 3-param and 6-param registerToken variants"
  - "ABI JSON strings stored as const in abis package — go:embed cannot traverse .. from pkg/stacks/thanos/"
  - "L2toL2 registerToken Phase 1: l2SourceToken == l2DestinationToken (same token on single L2)"
  - "L2toL2 registerToken Phase 1: l2SourceChainId == l2DestinationChainId == l2ChainID (single L2 scenario)"
  - "l2Nonce+2 offset for L2toL2 pair: each creation Deposit Tx consumes exactly 1 L2 deployer nonce"
  - "&portal.OptimismPortalTransactor: embedded struct field accessed by pointer to match *OptimismPortalTransactor parameter type"

requirements-completed: [SDK-04, SDK-07]

duration: 3min
completed: 2026-04-07
---

# Phase 01 Plan 03: DeployCrossTradeLocal Orchestrator Summary

**registerTokenFunc callback for L2CrossTrade(3-param)/L2toL2CrossTradeL2(6-param) registerToken + DeployCrossTradeLocal orchestrator deploying 4 CrossTrade contracts via L1 Deposit Tx**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-06T17:24:48Z
- **Completed:** 2026-04-06T17:28:24Z
- **Tasks:** 2
- **Files modified:** 1
- **Files created:** 1

## Accomplishments

- Task 1: `registerTokenFunc` callback type 추가 — `deployL2CrossTradePair`가 L2CrossTrade(3-param)과 L2toL2CrossTradeL2(6-param) registerToken 모두 처리 가능하도록 범용화
- Task 2: `DeployCrossTradeLocal` 완전 구현:
  - L1/L2 RPC client 초기화, OptimismPortal 바인딩, EIP-155 TransactOpts
  - L2 deployer nonce 획득 (PendingNonceAt 1회)
  - `abis/cross_trade_abis.go` 생성: 4개 CrossTrade 계약의 ABI 문자열 상수
  - L2→L1 쌍 배포 (L2CrossTrade impl+proxy, l2Nonce+0, l2Nonce+1)
  - L2→L2 쌍 배포 (L2toL2CrossTradeL2 impl+proxy, l2Nonce+2, l2Nonce+3)
  - `DeployCrossTradeLocalOutput` 반환 (4개 컨트랙트 주소)

## Task Commits

1. **Task 1: registerTokenFunc 콜백 추가** - `098cb88` (feat)
2. **Task 2: DeployCrossTradeLocal 완전 구현** - `632d543` (feat)

## Files Created/Modified

- `/Users/theo/workspace_tokamak/trh-sdk/abis/cross_trade_abis.go` — 4개 CrossTrade 계약 ABI 문자열 상수 (L2CrossTradeABI, L2CrossTradeProxyABI, L2toL2CrossTradeL2ABI, L2toL2CrossTradeProxyABI)
- `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/cross_trade_local.go` — registerTokenFunc 타입 추가, deployL2CrossTradePair 파라미터 추가, DeployCrossTradeLocal 완전 구현 (Plan 03 스캐폴드 교체)

## Decisions Made

- `registerTokenFunc` 콜백 패턴: `deployL2CrossTradePair` 함수 오버로딩 대신 콜백으로 registerToken 파라미터 차이 추상화
- ABI 문자열을 `abis` 패키지 const로 저장: `go:embed`가 `..` 경로를 허용하지 않아 `pkg/stacks/thanos/`에서 `abis/json/`에 직접 embed 불가
- L2toL2 Phase 1에서 l2SourceToken == l2DestinationToken (동일 L2의 동일 토큰)
- L2toL2 Phase 1에서 l2SourceChainId == l2DestinationChainId (단일 L2 시나리오)
- `&portal.OptimismPortalTransactor`: `NewOptimismPortal`이 반환하는 `*OptimismPortal`의 임베디드 struct 필드를 포인터로 전달

## Deviations from Plan

None — plan executed exactly as written.

One deviation at implementation level (not in plan): Plan specified no specific method for passing ABI JSON to `deployL2CrossTradePair`. Chose `abis` package exported const string pattern (matching `OptimismPortalABI` pattern in `OptimismPortal.go`) over `go:embed` because embed cannot traverse parent directories. This is consistent with existing codebase conventions.

## Known Stubs

None. `DeployCrossTradeLocal` is fully implemented. Phase 01 is complete.

## Phase 01 Completion

All 3 plans of Phase 01 are now complete:
- Plan 01: OptimismPortal abigen binding + CrossTrade types + bytecode constants
- Plan 02: Deposit Tx helpers + deployL2CrossTradePair 7-step sequence
- Plan 03: DeployCrossTradeLocal orchestrator (this plan)

Phase 01 deliverable: `DeployCrossTradeLocal()` function on `ThanosStack` that Backend can call to deploy 4 CrossTrade contracts on a local Docker Compose L2.

## Self-Check: PASSED

- [x] `../trh-sdk/abis/cross_trade_abis.go` exists
- [x] `../trh-sdk/pkg/stacks/thanos/cross_trade_local.go` contains `func (t *ThanosStack) DeployCrossTradeLocal(`
- [x] `cross_trade_local.go` does NOT contain `not yet implemented`
- [x] `cross_trade_local.go` contains `type registerTokenFunc func`
- [x] `cross_trade_local.go` contains `l2Nonce + 2`
- [x] `cross_trade_local.go` contains `L2CrossTradeBytecode` (package var reference)
- [x] `cross_trade_local.go` contains `L2toL2CrossTradeL2Bytecode` (package var reference)
- [x] commit 098cb88 exists
- [x] commit 632d543 exists
- [x] `go build ./pkg/stacks/thanos/` passes
- [x] `go vet ./pkg/stacks/thanos/` passes

---
*Phase: 01-sdk-l1-deposit-tx-deployment*
*Completed: 2026-04-07*
