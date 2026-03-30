---
phase: quick
plan: 260330-pob
subsystem: tokamak-thanos-geth/core
tags: [eip-7702, setcode-tx, go-ethereum, prague]
dependency_graph:
  requires: []
  provides: [EIP-7702 execution layer in tokamak-thanos-geth]
  affects: [core/state_transition.go, core/error.go, params/protocol_params.go, core/txpool/validation.go]
tech_stack:
  added: []
  patterns: [op-geth backport, tracing-less SetNonce, ParseDelegation EOA check]
key_files:
  created: []
  modified:
    - /Users/theo/workspace_tokamak/tokamak-thanos-geth/params/protocol_params.go
    - /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/error.go
    - /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/state_transition.go
    - /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/txpool/validation.go
    - /Users/theo/workspace_tokamak/tokamak-thanos-geth/tests/transaction_test_util.go
    - /Users/theo/workspace_tokamak/tokamak-thanos-geth/cmd/evm/internal/t8ntool/transaction.go
decisions:
  - "IsPrague gate used (not IsthmusTime) — tokamak-thanos-geth has no IsthmusTime field"
  - "SetNonce called with 2 args (no tracing.NonceChangeReason) — tokamak-thanos-geth lacks core/tracing package"
  - "IntrinsicGas charges CallNewAccountGas per auth tuple (not TxAuthTupleGas) — matches op-geth spec"
metrics:
  duration: "~20 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_modified: 6
---

# Phase quick Plan 260330-pob: EIP-7702 SetCodeTx Execution Layer Port Summary

**One-liner:** Port op-geth EIP-7702 validateAuthorization/applyAuthorization execution logic to tokamak-thanos-geth with tracing-free SetNonce and IsPrague gate.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | error.go + state_transition.go EIP-7702 포팅 | b00525301 | params/protocol_params.go, core/error.go, core/state_transition.go |
| 2 | txpool Prague gate + empty auth list + IntrinsicGas 업데이트 | 26ff28ad7 | core/txpool/validation.go |
| 2b | IntrinsicGas callers 추가 수정 (Rule 3) | 361443e7e | tests/transaction_test_util.go, cmd/evm/internal/t8ntool/transaction.go |

## What Was Implemented

### params/protocol_params.go
- `TxAuthTupleGas = 12500` 상수 추가 (EIP-7702 per auth tuple gas)

### core/error.go
- `ErrEmptyAuthList` — SetCodeTx auth list 비어 있음
- `ErrSetCodeTxCreate` — SetCodeTx로 컨트랙트 생성 시도
- `ErrAuthorizationWrongChainID` — chain ID 불일치
- `ErrAuthorizationNonceOverflow` — nonce overflow
- `ErrAuthorizationInvalidSignature` — 잘못된 서명
- `ErrAuthorizationDestinationHasCode` — delegation 대상이 컨트랙트
- `ErrAuthorizationNonceMismatch` — nonce 불일치

### core/state_transition.go
- `IntrinsicGas` 시그니처에 `authList []types.SetCodeAuthorization` 파라미터 추가; `CallNewAccountGas * len(authList)` 가스 계산
- `Message` 구조체에 `SetCodeAuthorizations []types.SetCodeAuthorization` 필드 추가
- `TransactionToMessage()`에서 `tx.SetCodeAuthorizations()` 설정
- `preCheck()` EOA 체크를 `ParseDelegation` 기반으로 교체 (delegation된 EOA 허용)
- `preCheck()`에 SetCodeTx create/empty-list 검증 추가
- `innerTransitionDb()` non-create 분기에 authorization loop + delegation target warming 추가
- `validateAuthorization()` 함수 구현 (chain ID, nonce overflow, signature, code, nonce 검증)
- `applyAuthorization()` 함수 구현 (refund 계산, SetNonce, SetCode delegation)

### core/txpool/validation.go
- Prague gate: `SetCodeTxType`을 IsPrague 이전에 거부
- `core.IntrinsicGas` 호출에 `tx.SetCodeAuthorizations()` 인수 추가
- SetCodeTx empty auth list 체크

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Additional IntrinsicGas caller fixes**
- **Found during:** Task 2 최종 전체 빌드 검증
- **Issue:** `tests/transaction_test_util.go:58`과 `cmd/evm/internal/t8ntool/transaction.go:136`에서도 구 시그니처로 `core.IntrinsicGas` 호출
- **Fix:** 두 파일 모두 `tx.SetCodeAuthorizations()` 인수 추가
- **Files modified:** tests/transaction_test_util.go, cmd/evm/internal/t8ntool/transaction.go
- **Commit:** 361443e7e

**2. [Rule 3 - Blocking] txpool/validation.go IntrinsicGas 조기 수정**
- **Found during:** Task 1 빌드 검증 (`go build ./core/...`)
- **Issue:** txpool validation.go가 Task 1에서 변경된 IntrinsicGas 시그니처와 불일치
- **Fix:** Task 2 대상 파일의 IntrinsicGas 호출을 Task 1 완료 후 즉시 수정하여 Task 1 빌드 성공
- **Note:** Plan에서는 Task 2에서 처리 예정이었으나, Task 1 빌드 gate 통과를 위해 조기 적용

## Known Stubs

None — 모든 구현은 실제 EVM state 변경을 수행함.

## Self-Check: PASSED

```
params/protocol_params.go TxAuthTupleGas: FOUND (line 179)
core/error.go ErrEmptyAuthList: FOUND (line 119)
core/error.go ErrAuthorizationWrongChainID: FOUND (line 130)
core/state_transition.go validateAuthorization: FOUND (line 617)
core/state_transition.go applyAuthorization: FOUND (line 639)
core/state_transition.go Message.SetCodeAuthorizations: FOUND (line 146)
core/txpool/validation.go IsPrague gate: FOUND (line 105)
core/txpool/validation.go empty auth check: FOUND (line 188-191)
go build ./core/... ./params/... ./cmd/evm/... ./tests/...: SUCCESS
Commit b00525301: FOUND
Commit 26ff28ad7: FOUND
Commit 361443e7e: FOUND
```
