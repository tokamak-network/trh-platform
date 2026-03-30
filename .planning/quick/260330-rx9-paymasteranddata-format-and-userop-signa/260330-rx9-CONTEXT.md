---
name: 260330-rx9 context
description: Decisions for paymasterAndData format fix and UserOp signature method fix
type: project
---

# Quick Task 260330-rx9: paymasterAndData format and UserOp signature fix - Context

**Gathered:** 2026-03-30
**Status:** Ready for research

<domain>
## Task Boundary

260330-r5m에서 구현한 paymaster-signer.ts의 두 가지 알려진 리스크를 해결:

1. **paymasterAndData format**: 현재 40 bytes Phase 1 포맷 → 72 bytes ERC-4337 v0.8 표준 포맷으로 수정
2. **UserOp signature**: 현재 signMessage (personal_sign, prefix 있음) → eth_sign (raw ECDSA)으로 수정

대상 파일: `tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts`

</domain>

<decisions>
## Implementation Decisions

### paymasterAndData format
- **72 bytes 표준 포맷 사용**: `[paymaster(20)][verificationGasLimit(16)][postOpGasLimit(16)][token(20)]`
- MultiTokenPaymaster 소스에서 실제 paymasterData offset 확인 필수
  - Phase 1 설계: `paymasterAndData[20:40]` = token → bundler gas 필드와 겹침
  - 실제로 bundler-aware 버전으로 업데이트됐을 수 있음 → `[52:72]` offset 확인
- research 결과로 실제 offset 결정

### UserOp Signature
- **eth_sign (raw ECDSA)**: prefix 없는 raw ECDSA 사용
- 구현 방법: `signer._signingKey().signDigest(ethers.utils.arrayify(userOpHash))`
  - `await signer.provider!.send('eth_sign', [sender, userOpHash])` 대안도 확인
- Simple7702Account._validateSignature 소스 확인해서 어떤 서명 방식을 기대하는지 검증

### Claude's Discretion
- verificationGasLimit, postOpGasLimit 값 (기존 gas 추정값 재사용)
- buildUserOpHash 수정 없음 (hash 계산 방식은 동일)

</decisions>

<specifics>
## Specific Ideas

**72 bytes paymasterAndData 인코딩:**
```typescript
const paymasterAndData = ethers.utils.defaultAbiCoder.encode(
  // 또는 hexConcat with hexZeroPad
)
// [paymaster_addr(20)][verificationGasLimit uint128(16)][postOpGasLimit uint128(16)][token_addr(20)]
```

**Raw ECDSA 서명:**
```typescript
// Option A: _signingKey() (ethers v5 Wallet only)
const sig = signer._signingKey().signDigest(ethers.utils.arrayify(userOpHash))
const signature = ethers.utils.joinSignature(sig)

// Option B: eth_sign RPC
const signature = await signer.provider!.send('eth_sign', [await signer.getAddress(), userOpHash])
```

</specifics>

<canonical_refs>
## Canonical References

- paymaster-signer.ts: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts`
- MultiTokenPaymaster: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol`
- Simple7702Account: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/Simple7702Account.sol`
- BaseAccount/_validateSignature: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/lib/BaseAccount.sol`
- EntryPoint: tokamak-thanos AA 디렉토리

</canonical_refs>
