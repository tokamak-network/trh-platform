# Quick Task 260330-s6r: MultiTokenPaymaster paymasterAndData offset fix — Research

**Researched:** 2026-03-30
**Domain:** ERC-4337 v0.8 MultiTokenPaymaster genesis injection, Solidity bytecode extraction
**Confidence:** HIGH (모든 소스 코드 직접 확인)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- MultiTokenPaymaster.sol 소스 수정: `paymasterAndData[20:40]` → `paymasterAndData[52:72]`
- bytecode 재주입 (genesis injection): forge build 후 새 bytecode를 genesis code namespace에 덮어쓰기
- usdc_genesis.go 패턴 따르기: trh-sdk에 `aa_paymaster_genesis.go` 신규 파일 추가
- predeploy 주소 `0x4200000000000000000000000000000000000067` 유지
- 72 bytes 표준 v0.8: `[paymaster(20)][verificationGasLimit(16)][postOpGasLimit(16)][token(20)]`
- paymaster-signer.ts도 72 bytes 포맷으로 업데이트 (현재는 52 bytes)

### Claude's Discretion
- verificationGasLimit, postOpGasLimit 기본값 (150000, 50000 등 적절한 값)
- MultiTokenPaymaster.sol 수정 최소화 (offset 상수화 또는 직접 수정)
- bytecode 로드 방식 (pre-extracted JSON 또는 forge-artifacts 직접 읽기)

### Deferred Ideas (OUT OF SCOPE)
- 없음
</user_constraints>

---

## Summary

이 task는 MultiTokenPaymaster Phase 1 설계 (paymasterAndData[20:40] = token)를 ERC-4337 v0.8 표준 오프셋(paymasterAndData[52:72] = token)으로 업그레이드한다.

**현재 상태 분석:**
- `MultiTokenPaymaster.sol` line 146: `paymasterAndData[20:40]`을 token으로 읽는 Phase 1 구현
- 이전 task(260330-rx9)에서 `paymaster-signer.ts`는 52 bytes 형식으로 수정됨 (token=[20:40], padding 12 bytes). EntryPoint require(length >= 52)를 통과하지만 paymasterVerificationGasLimit이 비정상값(token address 앞부분)으로 파싱됨
- 이 task는 근본 수정: MultiTokenPaymaster가 [52:72]를 읽도록 소스 수정 + genesis에 새 bytecode 주입 + paymaster-signer.ts 72 bytes 포맷으로 전환

**MultiTokenPaymaster proxy 구조 확인:**
- `0x4200000000000000000000000000000000000067`는 **proxy 컨트랙트** (EIP-1967 admin slot 있음, FiatTokenV2_2Proxy와 동일한 bytecode 패턴)
- code namespace (implementation): `0xc0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d30067`
- **현재 genesis에 code namespace implementation이 없음** — MultiTokenPaymaster는 proxy만 있고 impl이 없는 상태
- injectMultiTokenPaymasterBytecode() 함수로 code namespace에 새 implementation bytecode를 주입해야 함

**Primary recommendation:** MultiTokenPaymaster.sol을 한 줄 수정(line 146), forge build로 새 bytecode 생성, trh-sdk `aa_paymaster_genesis.go`에서 code namespace에 주입, paymaster-signer.ts를 72 bytes 포맷으로 업데이트.

---

## 1. MultiTokenPaymaster.sol 변경 사항

**파일:** `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol`

**변경 위치:** line 143-146

**현재 코드:**
```solidity
// paymasterAndData Phase 1 format: [paymaster(20)][token(20)] = 40 bytes total (no signature)
// Phase 2+: will include validUntil/validAfter/sig (see docs/TRH_MultiToken_Fee_Design.md Appendix A)
// validationData = 0: no signature verification in Phase 1
address token = address(bytes20(userOp.paymasterAndData[20:40]));
```

**변경 후 코드:**
```solidity
// paymasterAndData v0.8 standard format: [paymaster(20)][verGasLimit(16)][postOpGasLimit(16)][token(20)] = 72 bytes
// PAYMASTER_DATA_OFFSET = 52 (UserOperationLib constant): token address starts at offset 52
// Phase 2+: will include validUntil/validAfter/sig (see docs/TRH_MultiToken_Fee_Design.md Appendix A)
// validationData = 0: no signature verification in Phase 1
address token = address(bytes20(userOp.paymasterAndData[52:72]));
```

**`PAYMASTER_DATA_OFFSET` 상수 사용 옵션 (더 명시적):**

MultiTokenPaymaster는 `using UserOperationLib for PackedUserOperation`이 이미 선언되어 있으므로 UserOperationLib의 상수를 참조할 수 있다:

```solidity
// import UserOperationLib.PAYMASTER_DATA_OFFSET = 52
address token = address(bytes20(userOp.paymasterAndData[UserOperationLib.PAYMASTER_DATA_OFFSET:UserOperationLib.PAYMASTER_DATA_OFFSET + 20]));
```

단, Solidity slice 문법에서 상수 표현식이 literal로 평가되어야 하는 경우 컴파일 오류 가능. 직접 `[52:72]` 리터럴 사용이 더 안전함.

**영향 범위 확인:**
```
grep 결과: paymasterAndData[20:40]은 MultiTokenPaymaster.sol 단 한 곳에만 존재
           paymasterAndData[52:72] 참조는 현재 소스에 없음
           VerifyingPaymaster.sol은 [20:52]를 주석으로만 언급 (실제 파싱은 offset 52 이후)
```

**다른 파일에서의 영향:** 없음. offset 가정 코드는 MultiTokenPaymaster.sol line 146 하나뿐.

---

## 2. forge build 및 bytecode 추출

**사전 조건:**
- forge 1.4.4-stable 설치됨 (`/Users/theo/.foundry/bin/forge`)
- foundry.toml: `out = 'forge-artifacts'` (컴파일 아티팩트 출력 디렉토리)

**컴파일 명령어:**
```bash
cd /path/to/deployment/tokamak-thanos/packages/tokamak/contracts-bedrock
forge build --contracts src/AA/MultiTokenPaymaster.sol
```

단일 파일만 빌드: `--contracts` 플래그로 MultiTokenPaymaster.sol만 컴파일 가능.

**아티팩트 위치:**
```
packages/tokamak/contracts-bedrock/forge-artifacts/MultiTokenPaymaster.sol/MultiTokenPaymaster.json
```

**아티팩트 JSON 구조:**
```json
{
  "abi": [...],
  "bytecode": { "object": "0x..." },
  "deployedBytecode": { "object": "0x..." },
  ...
}
```

genesis injection에 필요한 것은 `deployedBytecode.object` (런타임 bytecode).

**현재 deployedBytecode 길이:** 16500 chars (약 8250 bytes) — 소스 변경 후 재측정 필요.

**bytecode 추출 (Go 코드):**
```go
// forge-artifacts JSON 구조
type forgeArtifact struct {
    DeployedBytecode struct {
        Object string `json:"object"`
    } `json:"deployedBytecode"`
}
```

**pre-extracted bytecode 파일 방식 (usdc_genesis.go와 동일한 패턴):**

trh-sdk가 tokamak-thanos 로컬 clone에서 `forge-artifacts/MultiTokenPaymaster.sol/MultiTokenPaymaster.json`을 직접 읽는 방식을 사용.
usdc_genesis.go의 `bytecodeFile` 구조체 대신 `forgeArtifact` 구조체 사용.

**대안: bytecode/l2/ 디렉토리에 pre-extracted 파일 추가:**
```json
{
  "address": "0x4200000000000000000000000000000000000067",
  "name": "MultiTokenPaymaster",
  "bytecode": "0x...",
  "extracted_at": "2026-03-30",
  "network": "l2",
  "type": "implementation"
}
```
이 경우 `bytecodeFile` 구조체 재사용 가능. 단, forge build를 실행하고 수동으로 파일을 업데이트해야 하는 단점 있음.

**권장:** forge-artifacts 직접 읽기 방식 (소스 수정 → forge build → 자동 반영).

---

## 3. trh-sdk genesis injection 구조

### MultiTokenPaymaster proxy 구조

| 항목 | 값 |
|------|-----|
| Proxy 주소 | `0x4200000000000000000000000000000000000067` |
| Code namespace (impl) | `0xc0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d30067` |
| Proxy 타입 | Transparent Proxy (EIP-1967 admin slot 있음) |
| ProxyDisabled | false (addresses.go에 ProxyDisabled 미설정) |
| 현재 genesis 상태 | proxy code 있음, impl (code namespace) **없음** |

`predeployToCodeNamespace(0x4200...0067)`:
- prefix: `0xc0D3C0d3C0d3C0D3c0d3C0d3c0D3C0d3c0d30000`
- bytes[18], bytes[19] from proxy: `0x00`, `0x67`
- result: `0xc0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d30067`

### aa_paymaster_genesis.go 신규 파일 구조

usdc_genesis.go 패턴을 따라 작성:

```go
package thanos

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "strings"

    "github.com/ethereum/go-ethereum/common"
)

const (
    multiTokenPaymasterAddress = "0x4200000000000000000000000000000000000067"
)

// forgeArtifact represents the JSON structure of a forge build artifact.
type forgeArtifact struct {
    DeployedBytecode struct {
        Object string `json:"object"`
    } `json:"deployedBytecode"`
}

// injectMultiTokenPaymasterBytecode injects the updated MultiTokenPaymaster implementation
// into genesis.json at the predeploy code namespace address.
// It loads the deployedBytecode from the forge-artifacts directory in the
// tokamak-thanos clone, enabling genesis-level bytecode update without redeployment.
func injectMultiTokenPaymasterBytecode(genesisPath, deploymentPath string) error {
    data, err := os.ReadFile(genesisPath)
    if err != nil {
        return fmt.Errorf("failed to read genesis file: %w", err)
    }

    var genesis map[string]json.RawMessage
    if err := json.Unmarshal(data, &genesis); err != nil {
        return fmt.Errorf("failed to parse genesis JSON: %w", err)
    }

    var alloc map[string]json.RawMessage
    if err := json.Unmarshal(genesis["alloc"], &alloc); err != nil {
        return fmt.Errorf("failed to parse alloc section: %w", err)
    }

    // Detect alloc key format (with or without 0x prefix)
    has0xPrefix := false
    for key := range alloc {
        if strings.HasPrefix(key, "0x") || strings.HasPrefix(key, "0X") {
            has0xPrefix = true
        }
        break
    }

    formatAddr := func(addr string) string {
        lower := strings.ToLower(addr)
        if !has0xPrefix {
            return strings.TrimPrefix(lower, "0x")
        }
        return lower
    }

    // Load deployedBytecode from forge-artifacts
    artifactPath := filepath.Join(
        deploymentPath,
        "tokamak-thanos", "packages", "tokamak", "contracts-bedrock",
        "forge-artifacts", "MultiTokenPaymaster.sol", "MultiTokenPaymaster.json",
    )
    implBytecode, err := loadForgeArtifactBytecode(artifactPath)
    if err != nil {
        return fmt.Errorf("failed to load MultiTokenPaymaster bytecode: %w", err)
    }

    // Set implementation at code namespace address
    proxyAddr := common.HexToAddress(multiTokenPaymasterAddress)
    codeAddr := predeployToCodeNamespace(proxyAddr)
    codeAddrKey := formatAddr(codeAddr.Hex())

    implEntry, err := json.Marshal(map[string]interface{}{
        "code":    implBytecode,
        "balance": "0x0",
    })
    if err != nil {
        return fmt.Errorf("failed to marshal implementation entry: %w", err)
    }
    alloc[codeAddrKey] = implEntry

    // Write back genesis.json
    allocJSON, err := json.Marshal(alloc)
    if err != nil {
        return fmt.Errorf("failed to marshal alloc: %w", err)
    }
    genesis["alloc"] = allocJSON

    output, err := json.MarshalIndent(genesis, "", "  ")
    if err != nil {
        return fmt.Errorf("failed to marshal genesis: %w", err)
    }

    fmt.Println("Injected MultiTokenPaymaster implementation into genesis code namespace at", codeAddr.Hex())
    return os.WriteFile(genesisPath, output, 0644)
}

// loadForgeArtifactBytecode reads a forge build artifact JSON and returns the deployedBytecode.
func loadForgeArtifactBytecode(path string) (string, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return "", fmt.Errorf("failed to read artifact %s: %w", path, err)
    }

    var artifact forgeArtifact
    if err := json.Unmarshal(data, &artifact); err != nil {
        return "", fmt.Errorf("failed to parse artifact %s: %w", path, err)
    }

    if artifact.DeployedBytecode.Object == "" {
        return "", fmt.Errorf("empty deployedBytecode in %s", path)
    }

    return artifact.DeployedBytecode.Object, nil
}
```

**`predeployToCodeNamespace` 함수 재사용:** `drb_genesis.go`에 이미 정의되어 있으므로 같은 package에서 직접 참조.

---

## 4. deploy_contracts.go 호출 위치

`injectMultiTokenPaymasterBytecode()` 호출은 **STEP 5.2 (injectUSDCIntoGenesis) 이후, STEP 5.3 (updateRollupGenesisHash) 이전**에 추가:

```go
// STEP 5.2: Inject USDC (FiatTokenV2_2) predeploy into genesis for ALL presets
if err := injectUSDCIntoGenesis(genesisPath, t.deploymentPath); err != nil {
    t.logger.Error("❌ Failed to inject USDC into genesis!", "err", err)
    return err
}

// STEP 5.2b: Inject updated MultiTokenPaymaster implementation into genesis
// Replaces [20:40] Phase 1 token parsing with v0.8 standard [52:72] offset
t.logger.Info("Injecting MultiTokenPaymaster (v0.8 paymasterAndData offset) into genesis...")
if err := injectMultiTokenPaymasterBytecode(genesisPath, t.deploymentPath); err != nil {
    t.logger.Error("❌ Failed to inject MultiTokenPaymaster bytecode!", "err", err)
    return err
}

// STEP 5.3: Update rollup.json genesis hash after ALL genesis modifications
if err := updateRollupGenesisHash(t.logger, genesisPath, rollupPath); err != nil {
    ...
}
```

**위치:** `deploy_contracts.go` lines 496-509 사이.

---

## 5. MultiTokenPaymaster proxy 구조 — proxy vs non-proxy

**결론: proxy 구조 (code namespace에 implementation 주입 필요)**

| 항목 | 확인 결과 |
|------|----------|
| `0x4200...0067` 코드 | Transparent Proxy bytecode (5c60da1b 시그니처 포함) |
| storage | EIP-1967 admin slot (`0xb53127...`) = `0x4200...0018` (ProxyAdmin) |
| EIP-1967 impl slot (`0x360894...`) | 없음 (Optimism-style: code namespace 방식 사용) |
| code namespace (`0xc0d3...0067`) | **현재 genesis에 없음** → 주입 필요 |
| addresses.go ProxyDisabled | 미설정 (false) — proxy 구조 확인 |

**주의:** usdc_genesis.go는 proxy code + implementation code 둘 다 주입했다. MultiTokenPaymaster의 경우 proxy code는 이미 genesis에 있으므로, **implementation (code namespace) 만 주입**하면 된다.

---

## 6. paymaster-signer.ts 변경 사항 (72 bytes 포맷)

**현재 상태 (260330-rx9에서 이미 수정됨):**
```typescript
// 12 bytes zero padding → total 52 bytes (EntryPoint PAYMASTER_DATA_OFFSET minimum)
const PAYMASTER_PADDING = '0x000000000000000000000000'
const buildPaymasterAndData = (tokenAddr: string): string =>
  ethers.utils.hexConcat([MULTI_TOKEN_PAYMASTER, tokenAddr, PAYMASTER_PADDING])
// 현재: paymaster(20) + token(20) + padding(12) = 52 bytes
// MultiTokenPaymaster가 [20:40]을 읽으므로 token은 [20:40]에 위치 — 현재 소스와 호환
// BUT: paymasterVerificationGasLimit = token address 앞 16 bytes = 비정상값
```

**이 task에서 변경 후:**
```typescript
// ERC-4337 v0.8 standard: 72 bytes
// [paymaster(20)][verificationGasLimit(16)][postOpGasLimit(16)][token(20)]
const PAYMASTER_VERIFICATION_GAS_LIMIT = 150000n  // paymasterVerificationGasLimit
const PAYMASTER_POST_OP_GAS_LIMIT = 50000n         // postOpGasLimit

const buildPaymasterAndData = (tokenAddr: string): string =>
  ethers.utils.hexConcat([
    MULTI_TOKEN_PAYMASTER,
    ethers.utils.hexZeroPad(ethers.BigNumber.from(PAYMASTER_VERIFICATION_GAS_LIMIT).toHexString(), 16),
    ethers.utils.hexZeroPad(ethers.BigNumber.from(PAYMASTER_POST_OP_GAS_LIMIT).toHexString(), 16),
    tokenAddr,
  ])
// 결과: 72 bytes, token은 [52:72]에 위치
// MultiTokenPaymaster가 [52:72]를 읽도록 수정된 후 호환
```

**PAYMASTER_PADDING 상수 제거:** 더 이상 사용하지 않음.

**변경 위치:** `paymaster-signer.ts` lines 65-69 (PAYMASTER_PADDING + buildPaymasterAndData).

---

## 7. forge build 실행 전제 조건

`injectMultiTokenPaymasterBytecode()`는 forge-artifacts에 이미 컴파일된 artifact가 있다고 가정한다. trh-sdk 배포 흐름에서 forge build는 언제 실행되는가?

**deploy_contracts.go flow 확인:**
```
deploy_contracts.go → deployContracts() → forge build 실행
  → STEP 5.1: injectDRBIntoGenesis
  → STEP 5.2: injectUSDCIntoGenesis
  → STEP 5.2b: injectMultiTokenPaymasterBytecode ← 여기서 forge-artifacts 읽기
```

forge build는 STEP 5 이전에 실행되므로, forge-artifacts/MultiTokenPaymaster.sol/MultiTokenPaymaster.json이 이미 존재한다.

**확인 방법:**
```bash
ls /path/to/deployment/tokamak-thanos/packages/tokamak/contracts-bedrock/forge-artifacts/MultiTokenPaymaster.sol/
```

---

## 8. 전체 task 범위 요약

### 변경 파일 목록

| 저장소 | 파일 | 변경 유형 | 내용 |
|--------|------|----------|------|
| tokamak-thanos | `packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol` | 1줄 수정 | line 146: `[20:40]` → `[52:72]` |
| tokamak-thanos | `forge-artifacts/MultiTokenPaymaster.sol/MultiTokenPaymaster.json` | forge build 재생성 | 소스 수정 후 `forge build` 실행 |
| trh-sdk | `pkg/stacks/thanos/aa_paymaster_genesis.go` | 신규 파일 | `injectMultiTokenPaymasterBytecode()` 함수 |
| trh-sdk | `pkg/stacks/thanos/deploy_contracts.go` | 2줄 추가 | STEP 5.2b 호출 추가 |
| tokamak-thanos | `packages/tokamak/sdk/src/paymaster-signer.ts` | ~5줄 수정 | 52 bytes → 72 bytes 포맷, PAYMASTER_PADDING 제거 |

**총 5개 파일, 2개 저장소.**

### 실행 순서

1. `MultiTokenPaymaster.sol` line 146 수정 (`[20:40]` → `[52:72]`)
2. `forge build` 실행 → forge-artifacts 갱신
3. `aa_paymaster_genesis.go` 신규 생성
4. `deploy_contracts.go` STEP 5.2b 추가
5. `paymaster-signer.ts` 72 bytes 포맷으로 업데이트

---

## 9. 주의사항 및 잠재적 문제

### paymasterVerificationGasLimit 값 설정
72 bytes 포맷에서 `[20:36]` = verificationGasLimit (uint128). EntryPoint가 이 값을 `mUserOp.paymasterVerificationGasLimit`으로 저장. bundler가 gas estimation에 사용하므로 합리적인 값이어야 함. 권장: 150000 (0x000000000000000000000000000000000249F0).

### forge build 시 lib 의존성
MultiTokenPaymaster.sol은 OpenZeppelin, BasePaymaster 등을 의존. forge build가 lib submodule 없이 실패할 수 있음. `--no-auto-detect` 대신 단순 `forge build`로 전체 컴파일하거나, `forge build --contracts src/AA/MultiTokenPaymaster.sol`로 단일 파일만 컴파일.

### genesis 재생성 시 멱등성
`injectMultiTokenPaymasterBytecode()`는 code namespace entry를 항상 덮어쓴다. 기존에 없으면 새로 추가, 있으면 업데이트. usdc_genesis.go처럼 "이미 있으면 skip" 처리가 필요할 수 있음 — 그러나 소스 변경 시마다 bytecode가 달라지므로 **항상 덮어쓰기**가 맞음.

### paymaster-signer.ts 하위 호환성
72 bytes로 변경하면 기존 52 bytes 형식의 테스트가 실패할 수 있음. 테스트 코드에서 `buildPaymasterAndData` 결과를 직접 검증하는 경우 업데이트 필요.

---

## 10. 핵심 offset 관계 정리

```
paymasterAndData 바이트 레이아웃 비교:

Phase 1 (현재, 52 bytes):
 [0:20]  = paymaster address (MultitTokenPaymaster)
 [20:40] = token address          ← MultiTokenPaymaster reads here (현재 소스)
 [40:52] = zero padding (12 bytes)
EntryPoint 해석:
 [0:20]  = paymaster address
 [20:36] = paymasterVerificationGasLimit ← token 앞 16 bytes = 비정상값
 [36:52] = postOpGasLimit               ← token 뒷 4 bytes + zero 12 bytes

v0.8 표준 (이 task 후, 72 bytes):
 [0:20]  = paymaster address (MultiTokenPaymaster)
 [20:36] = paymasterVerificationGasLimit (uint128) = 150000
 [36:52] = postOpGasLimit (uint128) = 50000
 [52:72] = token address          ← MultiTokenPaymaster reads here (수정 후)
EntryPoint 해석:
 [0:20]  = paymaster address
 [20:36] = paymasterVerificationGasLimit ← 정상값
 [36:52] = postOpGasLimit               ← 정상값
 [52:72] = paymasterData (extra)         ← MultiTokenPaymaster가 token으로 읽음
```

---

## Sources

### Primary (HIGH confidence)
- `tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol` line 146 — 직접 확인
- `tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/lib/UserOperationLib.sol` lines 19-21 — PAYMASTER_DATA_OFFSET = 52 상수 확인
- `tokamak-thanos/op-bindings/predeploys/addresses.go` lines 205-207 — MultiTokenPaymaster ProxyDisabled 미설정 확인
- `tokamak-thanos/packages/tokamak/contracts-bedrock/genesis/thanos-sepolia-test/genesis.json` — proxy code 있음, code namespace 없음 확인
- `trh-sdk/pkg/stacks/thanos/usdc_genesis.go` — genesis injection 패턴 확인
- `trh-sdk/pkg/stacks/thanos/deploy_contracts.go` lines 480-509 — STEP 5 injection 호출 위치 확인
- `trh-sdk/pkg/stacks/thanos/drb_genesis.go` lines 324-333 — `predeployToCodeNamespace()` 함수 확인
- `tokamak-thanos/forge-artifacts/MultiTokenPaymaster.sol/MultiTokenPaymaster.json` — deployedBytecode 구조 확인
- `tokamak-thanos/packages/tokamak/contracts-bedrock/bytecode/l2/FiatTokenV2_2.json` — pre-extracted bytecode 파일 형식 확인
- `tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts` lines 65-69 — 현재 52 bytes 상태 확인

### Context
- 이전 task 260330-rx9 RESEARCH.md — EntryPoint paymasterAndData 파싱 로직 확인, 52 bytes 패딩 방식 결정 과정

---

## Metadata

**Confidence breakdown:**
- MultiTokenPaymaster 수정 사항: HIGH — 소스 코드 직접 확인, 1줄 변경
- forge build 및 bytecode 추출: HIGH — forge-artifacts 구조 확인, foundry.toml 확인
- genesis injection 패턴: HIGH — usdc_genesis.go/drb_genesis.go 패턴 직접 확인
- proxy 구조 분석: HIGH — genesis alloc 직접 파싱, addresses.go 확인
- deploy_contracts.go 호출 위치: HIGH — 소스 코드 직접 확인

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable)
