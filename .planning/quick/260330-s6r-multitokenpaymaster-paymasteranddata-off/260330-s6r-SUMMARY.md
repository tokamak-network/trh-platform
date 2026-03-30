---
phase: quick
plan: 260330-s6r
subsystem: AA / MultiTokenPaymaster
tags: [paymaster, ERC-4337, v0.8, genesis-injection, solidity, typescript, go]
dependency_graph:
  requires: [260330-rx9]
  provides: [MultiTokenPaymaster-v0.8-offset, genesis-impl-injection, 72-byte-paymasterAndData]
  affects: [trh-sdk-genesis-deploy, tokamak-thanos-AA, paymaster-signer]
tech_stack:
  added: []
  patterns: [forge-artifacts-genesis-injection, predeployToCodeNamespace]
key_files:
  created:
    - trh-sdk/pkg/stacks/thanos/aa_paymaster_genesis.go
  modified:
    - tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol
    - trh-sdk/pkg/stacks/thanos/deploy_contracts.go
    - tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts
decisions:
  - "forge-artifacts를 git에 커밋하지 않음 (gitignore 대상) — forge build 시 자동 생성"
  - "aa_paymaster_genesis.go는 implementation 코드만 주입 (proxy code는 이미 genesis에 존재)"
  - "PAYMASTER_VERIFICATION_GAS_LIMIT=150000, PAYMASTER_POST_OP_GAS_LIMIT=50000 기본값 설정"
metrics:
  duration: "~15 minutes"
  completed: "2026-03-30"
  tasks_completed: 3
  files_changed: 4
  files_created: 1
---

# Quick Task 260330-s6r: MultiTokenPaymaster paymasterAndData Offset Fix Summary

**One-liner:** ERC-4337 v0.8 표준으로 MultiTokenPaymaster token 오프셋을 [20:40]에서 [52:72]로 수정하고, genesis code namespace에 새 implementation bytecode 주입 파이프라인을 추가했다.

---

## Objective

MultiTokenPaymaster.sol이 `paymasterAndData[20:40]`에서 token address를 읽어 EntryPoint의 `paymasterVerificationGasLimit`이 token address 앞 16 bytes로 오파싱되는 근본 문제를 수정한다. ERC-4337 v0.8 표준 72 bytes 포맷 (`[paymaster(20)][verGasLimit(16)][postOpGasLimit(16)][token(20)]`)으로 전환.

---

## Tasks Completed

### Task 1: MultiTokenPaymaster.sol offset 수정 + forge build
**Commit (tokamak-thanos):** `4aef7ac112`

- `MultiTokenPaymaster.sol` line 143-147: 주석 및 코드 업데이트
  - Before: `address token = address(bytes20(userOp.paymasterAndData[20:40]));`
  - After: `address token = address(bytes20(userOp.paymasterAndData[52:72]));`
- forge build 실행 — `forge-artifacts/MultiTokenPaymaster.sol/MultiTokenPaymaster.json` 재생성 (16500 chars, 8250 bytes)
- forge-artifacts는 .gitignore 대상이므로 sol 파일만 커밋

### Task 2: trh-sdk aa_paymaster_genesis.go 신규 파일 + deploy_contracts.go 호출 추가
**Commit (trh-sdk):** `84f1d8d`

신규 파일: `pkg/stacks/thanos/aa_paymaster_genesis.go`
- `injectMultiTokenPaymasterBytecode(genesisPath, deploymentPath string) error`
  - forge-artifacts에서 deployedBytecode 로드
  - `predeployToCodeNamespace(0x4200...0067)` = `0xc0d3...0067`에 implementation 주입
  - genesis.json alloc에 code namespace entry 추가/덮어쓰기
- `loadForgeArtifactBytecode(path string) (string, error)`
  - forge artifact JSON의 `deployedBytecode.object` 필드 추출

`deploy_contracts.go` 수정:
- STEP 5.2 (injectUSDCIntoGenesis) 직후, STEP 5.3 (updateRollupGenesisHash) 직전에 STEP 5.2b 삽입
- `go build ./...` 통과 확인

### Task 3: paymaster-signer.ts 72 bytes v0.8 포맷으로 업데이트
**Commit (tokamak-thanos):** `47d76875d0`

- `PAYMASTER_PADDING` 상수 제거 (Phase 1 52-byte 포맷)
- 추가: `PAYMASTER_VERIFICATION_GAS_LIMIT = BigInt(150000)`, `PAYMASTER_POST_OP_GAS_LIMIT = BigInt(50000)`
- `buildPaymasterAndData` 함수: 72 bytes 포맷으로 교체
  ```typescript
  ethers.utils.hexConcat([
    MULTI_TOKEN_PAYMASTER,                         // 20 bytes
    hexZeroPad(BigNumber.from(150000).toHexString(), 16),  // 16 bytes
    hexZeroPad(BigNumber.from(50000).toHexString(), 16),   // 16 bytes
    tokenAddr,                                     // 20 bytes
  ])  // total: 72 bytes
  ```
- 라인 376 주석도 72 bytes v0.8 포맷으로 업데이트
- `npx tsc --noEmit` 통과 확인

---

## paymasterAndData 오프셋 변환 요약

```
Phase 1 (이전, 52 bytes):
  [0:20]  = paymaster address
  [20:40] = token address       ← MultiTokenPaymaster reads here (구)
  [40:52] = zero padding (12 bytes)
  EntryPoint: verGasLimit = token 앞 16 bytes = 비정상값

v0.8 표준 (이후, 72 bytes):
  [0:20]  = paymaster address
  [20:36] = verificationGasLimit (uint128) = 150000
  [36:52] = postOpGasLimit (uint128) = 50000
  [52:72] = token address       ← MultiTokenPaymaster reads here (신)
  EntryPoint: 모든 필드 정상 파싱
```

---

## Commit Summary

| Repo | Commit | Description |
|------|--------|-------------|
| tokamak-thanos | `4aef7ac112` | fix(AA): update MultiTokenPaymaster paymasterData token offset to v0.8 standard [52:72] |
| trh-sdk | `84f1d8d` | feat(genesis): inject MultiTokenPaymaster v0.8-compatible bytecode into L2 genesis |
| tokamak-thanos | `47d76875d0` | fix(sdk): update paymasterAndData to 72 bytes v0.8 standard format |

---

## Deviations from Plan

### forge-artifacts git 커밋 불가 (Rule 3 - Blocked Issue)
- **Found during:** Task 1 Step 1c
- **Issue:** `forge-artifacts/` 디렉토리가 `.gitignore`에 포함되어 있어 `git add` 불가
- **Fix:** forge-artifacts는 빌드 산출물이므로 git에 추가하지 않음. `MultiTokenPaymaster.sol` 소스 파일만 커밋. forge build는 배포 시 자동 실행되므로 artifact는 런타임에 생성됨.
- **Impact:** 플랜의 "forge-artifacts/MultiTokenPaymaster.sol/ git add" 단계 스킵

---

## Verification Results

- `grep paymasterAndData[52:72] MultiTokenPaymaster.sol` — 확인
- `deployedBytecode length: 16500 chars (8250 bytes)` — 확인
- `injectMultiTokenPaymasterBytecode`, `loadForgeArtifactBytecode` 함수 구현 — 확인
- `deploy_contracts.go` STEP 5.2b 삽입 위치 확인
- `go build ./...` in trh-sdk — PASSED
- `npx tsc --noEmit` in tokamak-thanos/packages/tokamak/sdk — PASSED
- `PAYMASTER_PADDING` 상수 제거 확인

## Self-Check: PASSED

- `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol` — FOUND
- `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/aa_paymaster_genesis.go` — FOUND
- tokamak-thanos commit `4aef7ac112` — FOUND
- tokamak-thanos commit `47d76875d0` — FOUND
- trh-sdk commit `84f1d8d` — FOUND
