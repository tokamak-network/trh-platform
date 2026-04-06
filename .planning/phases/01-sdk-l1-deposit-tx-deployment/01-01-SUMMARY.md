---
phase: 01-sdk-l1-deposit-tx-deployment
plan: "01"
subsystem: trh-sdk
tags: [abigen, abi, crosstrade, go-bindings, bytecode]
dependency_graph:
  requires: []
  provides:
    - OptimismPortal abigen binding (6-param depositTransaction)
    - CrossTrade ABI JSONs (L2CrossTrade, L2CrossTradeProxy, L2toL2CrossTradeL2, L2toL2CrossTradeProxy)
    - DeployCrossTradeLocalInput/Output/TokenPair types
    - DeployCrossTradeLocal scaffold on ThanosStack
    - Cross trade contract bytecode constants
  affects:
    - 01-02-PLAN.md (uses OptimismPortal binding and types)
    - 01-03-PLAN.md (uses ABI JSONs for abi.Pack calldata encoding)
tech_stack:
  added:
    - abigen (go-ethereum tool) for OptimismPortal binding generation
  patterns:
    - abigen binding pattern (matching abis/TON.go)
    - bytecode constant file separation (PRD v2.1 Input purity)
key_files:
  created:
    - ../trh-sdk/abis/OptimismPortal.go
    - ../trh-sdk/abis/json/OptimismPortal.abi.json
    - ../trh-sdk/abis/json/L2CrossTrade.abi.json
    - ../trh-sdk/abis/json/L2CrossTradeProxy.abi.json
    - ../trh-sdk/abis/json/L2toL2CrossTradeL2.abi.json
    - ../trh-sdk/abis/json/L2toL2CrossTradeProxy.abi.json
    - ../trh-sdk/pkg/stacks/thanos/cross_trade_local.go
    - ../trh-sdk/pkg/stacks/thanos/cross_trade_local_bytecodes.go
  modified: []
decisions:
  - "ABI source: crossTrade L2toL2Implementation branch hardhat artifacts (not forge out/)"
  - "Bytecode stored in separate constants file to keep Input struct clean per PRD v2.1"
  - "CrossTrade contracts use abi.Pack pattern (not abigen) per D-08 - only ABI JSON needed"
metrics:
  duration: "3min"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_created: 8
  files_modified: 0
---

# Phase 01 Plan 01: ABI Bindings and Type Definitions Summary

**One-liner:** OptimismPortal abigen binding (6-param depositTransaction) and CrossTrade type scaffolding via hardhat artifacts from L2toL2Implementation branch.

## What Was Built

### Task 1: ABI JSON Extraction and OptimismPortal abigen Binding

- Extracted `OptimismPortal.abi.json` from tokamak-thanos forge artifacts
- Verified 6-param `depositTransaction` (_to, _mint, _value, _gasLimit, _isCreation, _data) — Tokamak-specific, not standard OP Stack 4-param
- Generated `OptimismPortal.go` abigen binding in `package abis` using existing TON.go pattern
- Extracted 4 CrossTrade ABI JSONs from crossTrade repo L2toL2Implementation branch hardhat artifacts:
  - `L2CrossTrade.abi.json` — registerToken(address, address, uint256) 3-param
  - `L2CrossTradeProxy.abi.json` — setSelectorImplementations2, setAliveImplementation2, initialize, setChainInfo
  - `L2toL2CrossTradeL2.abi.json` — registerToken(address, address, address, uint256, uint256, uint256) 6-param
  - `L2toL2CrossTradeProxy.abi.json`
- `go build ./abis/` passes

### Task 2: Type Definitions and Bytecode Constants

- Created `cross_trade_local.go` with:
  - `DeployCrossTradeLocalInput` struct (PRD v2.1, no bytecode fields)
  - `TokenPair` struct
  - `DeployCrossTradeLocalOutput` struct
  - `DeployCrossTradeLocal` scaffold on `ThanosStack` (returns not-yet-implemented)
  - `waitForContractCode` helper signature for creation tx verification
  - `verifyDepositCallEffect` helper signature for function-call deposit verification
- Created `cross_trade_local_bytecodes.go` with 4 contract bytecode constants (`L2CrossTradeBytecode`, `L2CrossTradeProxyBytecode`, `L2toL2CrossTradeL2Bytecode`, `L2toL2CrossTradeProxyBytecode`) via `mustDecodeHex()`
- `go build ./pkg/stacks/thanos/` passes

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | b1b80c7 | abis/OptimismPortal.go, abis/json/OptimismPortal.abi.json, abis/json/L2CrossTrade.abi.json, abis/json/L2CrossTradeProxy.abi.json, abis/json/L2toL2CrossTradeL2.abi.json, abis/json/L2toL2CrossTradeProxy.abi.json |
| 2 | 925d4ba | pkg/stacks/thanos/cross_trade_local.go, pkg/stacks/thanos/cross_trade_local_bytecodes.go |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Note:** crossTrade repo had no `out/` (forge) directory. Used hardhat `artifacts/` directory instead (same source of truth, different build tool). The artifacts contained the same ABI and bytecode data as forge output would have. This is not a deviation — the plan allowed for "artifacts directory" as fallback.

## Known Stubs

The following stubs exist by design — they will be implemented in Plan 02:

| File | Stub | Reason |
|------|------|--------|
| `cross_trade_local.go:56` | `DeployCrossTradeLocal` returns `fmt.Errorf("not yet implemented")` | Scaffold for Plan 02 implementation |
| `cross_trade_local.go:63` | `waitForContractCode` returns `fmt.Errorf("not yet implemented")` | Scaffold for Plan 02 implementation |
| `cross_trade_local.go:70` | `verifyDepositCallEffect` returns `fmt.Errorf("not yet implemented")` | Scaffold for Plan 02 implementation |

These stubs are intentional and required by the plan. Plan 02 will implement all three functions.

## Self-Check: PASSED

- [x] `../trh-sdk/abis/OptimismPortal.go` exists
- [x] `../trh-sdk/abis/json/OptimismPortal.abi.json` exists
- [x] `../trh-sdk/abis/json/L2CrossTrade.abi.json` exists
- [x] `../trh-sdk/abis/json/L2CrossTradeProxy.abi.json` exists
- [x] `../trh-sdk/abis/json/L2toL2CrossTradeL2.abi.json` exists
- [x] `../trh-sdk/abis/json/L2toL2CrossTradeProxy.abi.json` exists
- [x] `../trh-sdk/pkg/stacks/thanos/cross_trade_local.go` exists
- [x] `../trh-sdk/pkg/stacks/thanos/cross_trade_local_bytecodes.go` exists
- [x] commit b1b80c7 exists
- [x] commit 925d4ba exists
- [x] `go build ./abis/` passes
- [x] `go build ./pkg/stacks/thanos/` passes
