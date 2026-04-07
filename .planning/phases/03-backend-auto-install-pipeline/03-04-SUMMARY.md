---
phase: 03-backend-auto-install-pipeline
plan: "04"
subsystem: trh-backend
tags:
  - cross-trade
  - l1-registration
  - setChainInfo
  - gap-closure
dependency_graph:
  requires:
    - 03-01
    - 03-02
    - 03-03
  provides:
    - CrossTradeL1RegistrationInput struct
    - CrossTradeL1RegistrationOutput struct
    - CrossTradePresetConfig struct
    - RegisterCrossTradeL2 function
    - L1 registration wired into deployment pipeline
  affects:
    - trh-backend/pkg/services/thanos/integrations/cross_trade_local.go
    - trh-backend/pkg/services/thanos/deployment.go
tech_stack:
  added:
    - github.com/ethereum/go-ethereum/accounts/abi (ABI encoding)
    - github.com/ethereum/go-ethereum/accounts/abi/bind (WaitMined)
    - github.com/ethereum/go-ethereum/ethclient (L1 RPC)
    - github.com/ethereum/go-ethereum/crypto (ECDSA key)
    - github.com/ethereum/go-ethereum/core/types (EIP-155 tx)
  patterns:
    - abi.JSON + abi.Pack for setChainInfo calldata encoding
    - types.NewEIP155Signer + types.SignTx for raw L1 tx signing
    - bind.WaitMined for L1 receipt polling
    - Retry loop: for attempt := 1; attempt <= maxRetries with attempt*5s backoff
key_files:
  created: []
  modified:
    - trh-backend/pkg/services/thanos/integrations/cross_trade_local.go
    - trh-backend/pkg/services/thanos/deployment.go
decisions:
  - "RegisterCrossTradeL2() sends direct L1 txs (not deposit txs) to call setChainInfo on already-deployed Sepolia contracts"
  - "L1 registration failure (D-01): integration marked failed, L2 deploy result preserved"
  - "l1StandardBridge and l1USDCBridge read from deploy.json via trhSDKUtils; empty string fallback on read error (non-fatal)"
  - "L1 ethclient created fresh per RegisterCrossTradeL2() call (independent of SDK client)"
metrics:
  duration: 4min
  completed_date: "2026-04-07T03:27:26Z"
  tasks: 2
  files_modified: 2
---

# Phase 03 Plan 04: L1 CrossTrade Registration Gap Closure Summary

**One-liner:** Direct L1 setChainInfo calls to register new L2 on Sepolia CrossTrade contracts, with retry logic and failure isolation per D-01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | cross_trade_local.go 구조체 + RegisterCrossTradeL2() 추가 | b84c87c | cross_trade_local.go (+186 lines) |
| 2 | deployment.go 성공 블록 RegisterCrossTradeL2() 연결 | 5affcf3 | deployment.go (+88/-40 lines) |

## What Was Built

### Task 1: cross_trade_local.go

3개 구조체와 RegisterCrossTradeL2() 함수를 cross_trade_local.go에 추가했다.

**새 구조체:**
- `CrossTradeL1RegistrationInput` (BE-11): L1 RPC URL, chain IDs, deployer private key, L2 contract addresses, L1 bridge addresses
- `CrossTradeL1RegistrationOutput` (BE-11): L2L1TxHash, L2L2TxHash (각 setChainInfo 트랜잭션 해시)
- `CrossTradePresetConfig` (BE-10): L1 CrossTrade proxy 주소, owner key

**RegisterCrossTradeL2() (BE-04, BE-05, BE-06):**
- `sendL1SetChainInfoTx()` 헬퍼: EIP-155 서명, PendingNonceAt, bind.WaitMined 사용
- L1CrossTradeProxy.setChainInfo 3-param 호출 (address, address, uint256)
- L2toL2CrossTradeL1.setChainInfo 7-param 호출 (address, address, address, address, address, uint256, bool)
- 각 호출 `for attempt := 1; attempt <= maxRetries` 재시도, attempt*5s backoff

### Task 2: deployment.go

CrossTrade 성공 블록에 L1 등록 단계 삽입:

1. `trhSDKUtils.ReadDeployementConfigFromJSONFile()`로 L1StandardBridgeProxy, L1UsdcBridgeProxy 읽기
2. `integrations.RegisterCrossTradeL2(ctx, regInput, 3)` 호출
3. regErr != nil: `UpdateIntegrationStatusWithReason` → DeploymentStatusFailed (D-01)
4. regErr == nil: ctMetaBytes에 `l1_registration_tx_hash`, `l1_l2l2_tx_hash` 포함

## Gaps Resolved

| Requirement | Status | Evidence |
|-------------|--------|---------|
| BE-11 | Resolved | CrossTradeL1RegistrationInput/Output 구조체 exported |
| BE-10 | Resolved | CrossTradePresetConfig 구조체 exported |
| BE-04 | Resolved | L1CrossTradeProxy.setChainInfo 3-param ABI Pack + sendL1SetChainInfoTx |
| BE-05 | Resolved | L2toL2CrossTradeL1.setChainInfo 7-param ABI Pack + sendL1SetChainInfoTx |
| BE-06 | Resolved | `for attempt := 1; attempt <= maxRetries` 루프 (양쪽 호출 모두) |

## Verification Results

```
=== integrations build ===
OK
=== thanos build ===
OK
=== full build ===
OK
```

`go build ./...` 전체 오류 없음.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all fields are wired to real values from stackConfig and chainInformation.

## Self-Check: PASSED

- `/Users/theo/workspace_tokamak/trh-backend/pkg/services/thanos/integrations/cross_trade_local.go` — exists, compiles
- `/Users/theo/workspace_tokamak/trh-backend/pkg/services/thanos/deployment.go` — exists, compiles
- Commit b84c87c — Task 1 (cross_trade_local.go)
- Commit 5affcf3 — Task 2 (deployment.go)
