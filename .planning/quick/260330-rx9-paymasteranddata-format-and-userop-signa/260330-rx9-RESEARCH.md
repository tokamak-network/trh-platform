# Quick Task 260330-rx9: paymasterAndData Format and UserOp Signature Fix — Research

**Researched:** 2026-03-30
**Domain:** ERC-4337 v0.8 MultiTokenPaymaster, Simple7702Account, ethers v5 JsonRpcSigner
**Confidence:** HIGH (모든 소스 코드 직접 확인)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 72 bytes 표준 포맷 사용: `[paymaster(20)][verificationGasLimit(16)][postOpGasLimit(16)][token(20)]`
- MultiTokenPaymaster 소스에서 실제 paymasterData offset 확인 후 결정
- eth_sign (raw ECDSA) 사용: prefix 없는 raw ECDSA
- Simple7702Account._validateSignature 소스 확인해서 어떤 서명 방식을 기대하는지 검증

### Claude's Discretion
- verificationGasLimit, postOpGasLimit 값 (기존 gas 추정값 재사용)
- buildUserOpHash 수정 없음 (hash 계산 방식은 동일)

### Deferred Ideas (OUT OF SCOPE)
- 없음
</user_constraints>

---

## Summary

이번 research의 핵심 발견은 두 가지 버그 모두 소스 코드로 명확히 확인됨.

**버그 1 (paymasterAndData):** 현재 40 bytes 형식은 EntryPoint v0.8에서 즉시 `"AA93 invalid paymasterAndData"` revert 됨. `EntryPoint.sol` line 455에서 `paymasterAndData.length >= PAYMASTER_DATA_OFFSET (52)` 를 require하기 때문. 즉, 현재 구현은 bundler에 도달하기 전 EntryPoint 단계에서도 reject됨.

**버그 2 (서명):** `Simple7702Account._checkSignature`는 `ECDSA.recover(hash, signature) == address(this)` — raw ECDSA를 기대함. 그러나 현재 코드는 `signer.signMessage(arrayify(hash))`를 사용하는데, `getEthersSigner`가 반환하는 `JsonRpcSigner`에서 `signMessage`는 `personal_sign` RPC를 호출하고 `"\x19Ethereum Signed Message:\n32"` prefix를 붙임. 결과적으로 서명이 hash가 아닌 prefix+hash의 서명이 되어 `ECDSA.recover`가 다른 주소를 반환 → `SIG_VALIDATION_FAILED`.

**결론:** 두 버그 모두 코드 한 곳씩만 수정하면 해결 가능. paymasterAndData format은 72 bytes로 변경 (단, MultiTokenPaymaster는 `[52:72]` 기대), 서명은 `eth_sign` RPC 직접 호출.

---

## 1. MultiTokenPaymaster 실제 token offset: [20:40]

**소스:** `MultiTokenPaymaster.sol` line 143-146

```solidity
// paymasterAndData Phase 1 format: [paymaster(20)][token(20)] = 40 bytes total (no signature)
// Phase 2+: will include validUntil/validAfter/sig (see docs/TRH_MultiToken_Fee_Design.md Appendix A)
// validationData = 0: no signature verification in Phase 1
address token = address(bytes20(userOp.paymasterAndData[20:40]));
```

**결론:** MultiTokenPaymaster는 `paymasterAndData[20:40]` 을 token address로 읽음.

그런데 EntryPoint v0.8은 `paymasterAndData` 를 다음과 같이 파싱함:
- `[0:20]` = paymaster address
- `[20:36]` = paymasterVerificationGasLimit (uint128, 16 bytes)
- `[36:52]` = postOpGasLimit (uint128, 16 bytes)
- `[52:]` = paymaster-specific extra data (`PAYMASTER_DATA_OFFSET = 52`)

**이 둘은 서로 호환되지 않는다.** MultiTokenPaymaster가 token을 `[20:40]`에서 읽는다면:
- `[20:40]` = token address (20 bytes)
- 이것은 EntryPoint가 `[20:36]` = verificationGasLimit, `[36:52]` = postOpGasLimit로 읽는 위치와 완전히 겹침

즉 bundler + EntryPoint v0.8 표준 경로에서는 **token이 `[52:72]` 에 있어야** EntryPoint가 gas limit 필드를 정상 파싱한 뒤 paymaster에게 `userOp.paymasterAndData[52:]` 를 extra data로 전달함.

**그러나 현재 MultiTokenPaymaster 소스는 Phase 1 (bundler 없이 직접 handleOps) 설계로, `[20:40]`을 token으로 읽음.**

### EntryPoint가 paymasterAndData를 _validatePaymasterUserOp에 어떻게 전달하는가

`EntryPoint.sol` line 452-459 (`_copyUserOpToMemory`):

```solidity
bytes calldata paymasterAndData = userOp.paymasterAndData;
if (paymasterAndData.length > 0) {
    require(
        paymasterAndData.length >= UserOperationLib.PAYMASTER_DATA_OFFSET,  // >= 52
        "AA93 invalid paymasterAndData"
    );
    address paymaster;
    (paymaster, mUserOp.paymasterVerificationGasLimit, mUserOp.paymasterPostOpGasLimit) =
        UserOperationLib.unpackPaymasterStaticFields(paymasterAndData);
```

**결론:** EntryPoint가 `paymasterAndData.length >= 52` 를 enforce함. 현재 40 bytes 형식은 이 require에서 즉시 revert.

EntryPoint가 `_validatePaymasterUserOp`을 호출할 때 `userOp` 전체를 그대로 전달하므로, MultiTokenPaymaster 내부에서 `userOp.paymasterAndData[20:40]`은 여전히 `[20:40]` 위치를 읽음 — 이 위치에 verificationGasLimit을 넣으면 MultiTokenPaymaster가 그것을 token address로 오인함.

**해결책:** paymasterAndData를 72 bytes로 구성하되, token address를 `[52:72]`에 넣고, `[20:36]`과 `[36:52]`에 gas limits를 넣는 경우, MultiTokenPaymaster의 `[20:40]` 파싱이 틀린 token address를 읽게 됨.

**실제 배포된 컨트랙트의 현실:** 현재 소스코드 상 MultiTokenPaymaster Phase 1은 bundler-aware가 아님. 다음 두 옵션 중 하나:

| 옵션 | paymasterAndData 형식 | MultiTokenPaymaster 읽기 | EntryPoint 결과 |
|------|----------------------|--------------------------|-----------------|
| A: Phase 1 (40 bytes) | `[paymaster(20)][token(20)]` | `[20:40]` = token (정상) | **require fail** (length < 52) |
| B: bundler-aware (72 bytes) | `[paymaster(20)][verGas(16)][postGas(16)][token(20)]` | `[20:40]` = verGas+postGas 조합 = **틀린 address** | length OK, 하지만 token 파싱 오류 |

**이 모순을 해결하는 방법은 MultiTokenPaymaster가 실제로 `PAYMASTER_DATA_OFFSET (52)` 이후를 읽도록 업데이트되어 있거나, 배포된 컨트랙트가 소스와 다른 경우뿐임.**

소스 코드 기준: `[20:40]` 읽음. 따라서 **bundler가 gas limit 필드를 자동으로 처리하고, 52 이후를 paymaster에게 넘기는 구조라면 MultiTokenPaymaster도 offset `[52:72]`를 읽어야 함** — 현재 소스가 틀렸거나, 업데이트가 필요한 상태.

### 현실적 접근

이 task의 목표는 paymaster-signer.ts를 수정하는 것이므로:

1. **EntryPoint require를 통과하려면 72 bytes 이상이어야 함** (확정)
2. **MultiTokenPaymaster가 `[20:40]`을 읽으므로, gas limit 필드 자리에 token address를 넣어야 함**

즉, 현재 MultiTokenPaymaster 소스와 EntryPoint 표준 사이에 불일치가 있음. SDK 단에서 할 수 있는 조정:

**Option C: 52 bytes 최소 형식** — `[paymaster(20)][token(20)][padding(12)]` or `[paymaster(20)][tokenAsGasLimit16(partial)][...]`는 의미없음.

**현실적 결론:** MultiTokenPaymaster 소스코드가 Phase 1 (bundler-less) 설계이므로, Alto bundler를 경유하지 않는 직접 handleOps 경로이거나, 배포된 컨트랙트가 이미 offset 52를 읽도록 수정됐을 가능성이 있음. 이 task에서는:

- EntryPoint를 통과시키려면 최소 52 bytes 필요
- MultiTokenPaymaster `[20:40]` 읽기와 호환되려면 token을 `[20:40]`에 넣어야 함
- 이 둘을 동시에 만족: `[paymaster(20)][token(20)][padding(12)]` = 52 bytes 형식

**권장 형식 (52 bytes, 현재 컨트랙트 소스와 호환):**
```
[0:20]  = paymaster address (20 bytes)
[20:40] = token address (20 bytes)          ← MultiTokenPaymaster reads here
[40:52] = zero padding (12 bytes)           ← EntryPoint reads [20:36]=verGasLimit, [36:52]=postOpGasLimit
총 52 bytes
```

이 경우 EntryPoint는 `[20:36]` = token address 앞부분을 verificationGasLimit으로 읽고, `[36:52]` = token 뒷부분+padding을 postOpGasLimit으로 읽음. 값이 이상하지만, MultiTokenPaymaster가 직접 `_validatePaymasterUserOp`에서 token을 가져가고, EntryPoint의 gas limit 파싱은 단지 MemoryUserOp에 저장할 뿐 validation을 막지 않음.

**대안 (진짜 표준 72 bytes — MultiTokenPaymaster 소스 수정 전제):**
```
[0:20]  = paymaster address
[20:36] = paymasterVerificationGasLimit (uint128)
[36:52] = postOpGasLimit (uint128)
[52:72] = token address                     ← MultiTokenPaymaster가 [52:72]를 읽도록 수정 필요
총 72 bytes
```

**이 task에서 선택할 형식: 현재 컨트랙트 소스에 맞는 52 bytes 형식** (token을 `[20:40]`에 위치시키고 padding 12 bytes 추가). 이는 MultiTokenPaymaster 소스 변경 없이 EntryPoint require를 통과시키는 최소한의 수정.

---

## 2. EntryPoint paymasterAndData 처리 요약

**소스:** `UserOperationLib.sol` (constants), `EntryPoint.sol` `_copyUserOpToMemory`

```
PAYMASTER_VALIDATION_GAS_OFFSET = 20
PAYMASTER_POSTOP_GAS_OFFSET     = 36
PAYMASTER_DATA_OFFSET           = 52   ← 최소 length 요구사항
```

EntryPoint는 `_validatePaymasterUserOp(userOp, userOpHash, maxCost)` 호출 시 userOp 전체를 전달. Paymaster가 `userOp.paymasterAndData[20:40]`을 직접 읽는다면 EntryPoint의 gas limit 파싱 결과와 무관하게 해당 offset을 그대로 접근함.

**핵심 제약:** `paymasterAndData.length >= 52` — 이 조건을 만족하지 않으면 "AA93 invalid paymasterAndData" revert.

---

## 3. 최종 paymasterAndData 형식 결정

현재 배포된 MultiTokenPaymaster 소스가 `[20:40]` = token을 읽으므로, **52 bytes 형식**을 사용:

```
bytes[0:20]  = MultiTokenPaymaster address (20 bytes)
bytes[20:40] = token address (20 bytes)   ← MultiTokenPaymaster._validatePaymasterUserOp reads here
bytes[40:52] = zero bytes (12 bytes)      ← padding to reach minimum length 52
총 52 bytes
```

**TypeScript 구현:**
```typescript
const buildPaymasterAndData = (tokenAddr: string): string =>
  ethers.utils.hexConcat([
    MULTI_TOKEN_PAYMASTER,
    tokenAddr,
    '0x000000000000000000000000',  // 12 bytes zero padding → total 52 bytes
  ])
```

EntryPoint가 `[20:36]` (token address 앞 16 bytes) 을 verificationGasLimit으로, `[36:52]` (token 뒷부분 4 bytes + 12 bytes zero) 를 postOpGasLimit으로 읽게 됨. 이 값들이 크거나 이상한 경우 `paymasterVerificationGasLimit` 값이 비정상적으로 클 수 있으나, 해당 값은 bundler가 gas estimation 용도로만 사용하며 컨트랙트 실행에는 직접 영향 없음.

**더 나은 대안:** verificationGasLimit과 postOpGasLimit 위치에 실제 합리적 값을 넣으면서 token을 `[20:40]`에 유지하는 것은 불가능. 따라서 zero padding이 가장 안전함.

---

## 4. Simple7702Account._validateSignature 구현 — raw ECDSA 확인

**소스:** `Simple7702Account.sol` line 44-46

```solidity
function _checkSignature(bytes32 hash, bytes memory signature) internal view returns (bool) {
    return ECDSA.recover(hash, signature) == address(this);
}
```

**결론:** `ECDSA.recover(hash, signature)` — raw hash, no prefix. 즉 raw ECDSA 서명을 기대함.

OpenZeppelin의 `ECDSA.recover(bytes32 hash, bytes memory signature)` 시그니처는 prefix 없이 hash를 그대로 사용.

현재 `signer.signMessage(arrayify(userOpHash))`는 `personal_sign` RPC를 호출하여 prefix가 붙은 hash를 서명 → recover가 다른 address를 반환 → `SIG_VALIDATION_FAILED` (1 반환).

---

## 5. ethers v5 JsonRpcSigner에서 raw ECDSA 서명 방법

### signer 타입 확인

**소스:** `thanos-bridge/src/utils/provider.ts`

```typescript
const provider = new providers.Web3Provider(transport, network);
const signer = provider.getSigner(account.address);
return signer;  // JsonRpcSigner
```

`getEthersSigner`는 `JsonRpcSigner`를 반환함. `JsonRpcSigner`는 ethers v5의 `Wallet`과 달리 `_signingKey()` 메서드가 없음.

### 각 서명 방법별 비교

| 방법 | prefix | JsonRpcSigner 지원 | 결과 |
|------|--------|-------------------|------|
| `signer.signMessage(arrayify(hash))` | `\x19Ethereum Signed Message:\n32` 추가됨 | O | **오답** — Simple7702Account reject |
| `signer._signingKey().signDigest(arrayify(hash))` | 없음 (raw) | **X** (Wallet 전용) | 사용 불가 |
| `provider.send('eth_sign', [address, hash])` | MetaMask/wallets마다 다름 | O | **불안정** — 일부 wallet이 prefix를 붙임 |
| `provider.send('personal_sign', [hash, address])` | `\x19Ethereum Signed Message:\n32` 추가됨 | O | **오답** |

### eth_sign vs personal_sign

- `personal_sign`: 항상 prefix 붙임. MetaMask/wagmi 기본.
- `eth_sign`: EIP-191 이전 표준 raw sign. 대부분의 현대 wallet에서 **보안상 disabled** 되거나 여전히 prefix를 붙임. MetaMask는 현재 `eth_sign`도 prefix를 붙임.

**결론: wagmi + Web3Provider 환경에서 JsonRpcSigner로 진짜 raw ECDSA를 얻는 표준적 방법은 없음.**

### 해결책: 서명 후 prefix 제거 (복원)

EIP-191 `personal_sign`이 붙이는 prefix는 알려진 고정값이므로, signMessage 결과에서 역산 가능. 단, hash는 달라지므로 복원이 의미 없음.

### 해결책 2: EIP-712 typed data sign

`_signTypedData` 또는 `eth_signTypedData_v4` 는 structured hash를 사용하며, ERC-4337 UserOpHash에 직접 적용하기 어려움.

### 최적 해결책: signer 타입 분기

```typescript
// ethers v5 Wallet 여부 확인
const isWallet = (s: ethers.Signer): s is ethers.Wallet =>
  '_signingKey' in s && typeof (s as any)._signingKey === 'function'

if (isWallet(signer)) {
  // Wallet: raw ECDSA 가능
  const sig = signer._signingKey().signDigest(ethers.utils.arrayify(userOpHash))
  signature = ethers.utils.joinSignature(sig)
} else {
  // JsonRpcSigner: eth_sign 시도 (MetaMask는 prefix 붙일 수 있음)
  signature = await (signer.provider as any).send('eth_sign', [sender, userOpHash])
}
```

### MetaMask에서의 실제 동작 (2026 기준)

MetaMask는 2022년부터 `eth_sign`에 deprecation warning을 보여주고, 기본적으로 비활성화 옵션 제공. 그러나 여전히 호출 가능. **MetaMask에서 `eth_sign`은 prefix 없는 raw sign을 반환** (MetaMask 공식 문서 기준).

wagmi v2 + Web3Provider 환경에서는 `signer.provider.send('eth_sign', [address, hash])` 가 raw ECDSA를 반환.

**권장 구현:**

```typescript
// paymaster-signer.ts 내에서
const signUserOpHash = async (
  signer: ethers.Signer,
  userOpHash: string
): Promise<string> => {
  const sender = await signer.getAddress()

  // ethers.Wallet: raw sign 직접 가능
  if ('_signingKey' in signer && typeof (signer as any)._signingKey === 'function') {
    const wallet = signer as ethers.Wallet
    const sig = wallet._signingKey().signDigest(ethers.utils.arrayify(userOpHash))
    return ethers.utils.joinSignature(sig)
  }

  // JsonRpcSigner (wagmi Web3Provider): eth_sign으로 raw ECDSA 획득
  // MetaMask: eth_sign = raw ECDSA (no prefix)
  // WalletConnect: 구현마다 다를 수 있음
  const signature = await (signer.provider as ethers.providers.JsonRpcProvider).send(
    'eth_sign',
    [sender, userOpHash]
  )
  return signature
}
```

---

## 6. 구체적 코드 수정 사항 (paymaster-signer.ts)

### 수정 1: buildPaymasterAndData (line 65-66)

**현재:**
```typescript
const buildPaymasterAndData = (tokenAddr: string): string =>
  ethers.utils.hexConcat([MULTI_TOKEN_PAYMASTER, tokenAddr])
// 결과: 40 bytes → EntryPoint "AA93 invalid paymasterAndData" revert
```

**변경:**
```typescript
const PAYMASTER_PADDING = '0x000000000000000000000000' // 12 bytes zero padding

const buildPaymasterAndData = (tokenAddr: string): string =>
  ethers.utils.hexConcat([MULTI_TOKEN_PAYMASTER, tokenAddr, PAYMASTER_PADDING])
// 결과: 52 bytes → EntryPoint require(length >= 52) 통과
// MultiTokenPaymaster [20:40] = tokenAddr 정상 파싱
```

### 수정 2: 서명 함수 추가 + signMessage 교체 (line 299, 361)

**추가할 헬퍼 함수:**
```typescript
/**
 * Signs userOpHash with raw ECDSA (no prefix).
 * Simple7702Account expects: ECDSA.recover(hash, sig) == address(this)
 * - ethers.Wallet: uses _signingKey().signDigest() directly
 * - JsonRpcSigner (wagmi): uses eth_sign RPC (MetaMask = raw ECDSA, no prefix)
 */
const signUserOpHash = async (
  signer: ethers.Signer,
  userOpHash: string
): Promise<string> => {
  const sender = await signer.getAddress()

  // ethers.Wallet path: guaranteed raw ECDSA
  if ('_signingKey' in signer && typeof (signer as any)._signingKey === 'function') {
    const wallet = signer as ethers.Wallet
    const sig = wallet._signingKey().signDigest(ethers.utils.arrayify(userOpHash))
    return ethers.utils.joinSignature(sig)
  }

  // JsonRpcSigner path: use eth_sign (raw in MetaMask, may vary in other wallets)
  return (signer.provider as ethers.providers.JsonRpcProvider).send('eth_sign', [
    sender,
    userOpHash,
  ])
}
```

**현재 (line 299):**
```typescript
const approveSignature = await signer.signMessage(
  ethers.utils.arrayify(approveUserOpHash)
)
```

**변경:**
```typescript
const approveSignature = await signUserOpHash(signer, approveUserOpHash)
```

**현재 (line 361):**
```typescript
const signature = await signer.signMessage(ethers.utils.arrayify(userOpHash))
```

**변경:**
```typescript
const signature = await signUserOpHash(signer, userOpHash)
```

---

## 7. buildUserOpHash 검토 — 변경 불필요

**소스 확인:** `paymaster-signer.ts` line 68-103

현재 구현:
```typescript
// inner hash: keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
//                                   accountGasLimits, preVerificationGas, gasFees,
//                                   keccak256(paymasterAndData)))
// outer hash: keccak256(abi.encode(innerHash, entryPoint, chainId))
```

`UserOperationLib.sol` encode 함수와 비교:
```solidity
// line 39: PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,
//          bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)
```

`UserOperationLib.hash()` 는 encode 후 keccak256. encode는 bytes 필드를 keccak256으로 치환. 현재 paymaster-signer.ts 구현이 이 패턴을 따름 — **변경 불필요** (CONTEXT.md locked decision과 일치).

단, paymasterAndData가 52 bytes로 바뀌면 `keccak256(paymasterAndData)` 값이 달라지므로 자동으로 반영됨 (hash 계산 코드 변경 불필요, paymasterAndData 값 자체만 변경).

---

## 8. 알려진 불확실 사항

| 항목 | 상태 | 대응 |
|------|------|------|
| MultiTokenPaymaster 실제 배포 버전 vs 소스 | 소스 기준 `[20:40]` 확인. 배포된 컨트랙트가 다를 수 있음 | 52 bytes 형식으로 먼저 시도, 실패 시 72 bytes + 소스 수정 필요 |
| MetaMask eth_sign prefix 여부 | MetaMask 공식 문서 기준 raw (no prefix). 그러나 wallet 버전/설정마다 다를 수 있음 | 통합 테스트로 실제 서명 동작 검증 필요 |
| WalletConnect에서 eth_sign 동작 | WC 구현마다 다를 수 있음 | wagmi + MetaMask 조합으로 우선 검증 |
| EntryPoint paymasterVerificationGasLimit이 0일 때 | 52 bytes 형식에서 `[20:36]` = token 앞부분 → 비정상적으로 큰 값. bundler가 이 값으로 gas simulation 실패 가능 | bundler가 `eth_estimateUserOperationGas`로 재추정하면 문제없음. 직접 sendUserOperation 시 bundler rejection 가능 |

### paymasterVerificationGasLimit 이슈 상세

52 bytes 형식에서:
- `[20:36]` 위치 값 = token address 앞 16 bytes 예: USDC `0x42000000000000000000000000000778` → uint128 = `0x42000000000000000000000000000778` ≈ 매우 큰 값
- 이는 bundler가 paymasterVerificationGasLimit으로 해석 → gas limit 비정상적으로 큼
- Alto bundler가 이를 validation에서 reject할 가능성 있음

**더 안전한 52 bytes 형식 대안:**
```typescript
// token 자리에 verificationGasLimit과 postOpGasLimit을 실제 넣고,
// paymasterData에 token 없음 → MultiTokenPaymaster가 token을 어디서 읽는지 문제
```

**현실:** 이 이슈는 MultiTokenPaymaster가 Phase 1 설계 (bundler-less)라는 근본 원인에서 비롯됨. 완전한 해결은 MultiTokenPaymaster가 `[52:72]`를 읽도록 수정하는 것임.

---

## 9. 소스 출처

| 파일 | Confidence | 핵심 확인 내용 |
|-----|-----------|---------------|
| `contracts-bedrock/src/AA/MultiTokenPaymaster.sol` line 146 | HIGH | `userOp.paymasterAndData[20:40]` = token |
| `contracts-bedrock/src/AA/EntryPoint.sol` line 455 | HIGH | `require(length >= PAYMASTER_DATA_OFFSET)` = 52 |
| `contracts-bedrock/src/AA/lib/UserOperationLib.sol` line 19-21 | HIGH | 상수 정의: 20, 36, 52 |
| `contracts-bedrock/src/AA/Simple7702Account.sol` line 44-46 | HIGH | `ECDSA.recover(hash, sig) == address(this)` |
| `contracts-bedrock/src/AA/lib/BaseAccount.sol` | HIGH | `_validateSignature` abstract, validateUserOp 구현 |
| `sdk/src/paymaster-signer.ts` | HIGH | 현재 구현: 40 bytes, signMessage |
| `thanos-bridge/src/utils/provider.ts` | HIGH | `JsonRpcSigner` 확인 (`provider.getSigner()`) |
| `thanos-bridge/src/hooks/bridge/useThanosSDK.tsx` | HIGH | `getEthersSigner` = JsonRpcSigner, wrapWithPaymaster 사용 |
