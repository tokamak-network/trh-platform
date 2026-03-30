---
name: 260330-s6r context
description: MultiTokenPaymaster paymasterAndData offset 근본 수정 — [20:40] → [52:72], 72 bytes 표준 v0.8 포맷
type: project
---

# Quick Task 260330-s6r: MultiTokenPaymaster paymasterAndData offset fix - Context

**Gathered:** 2026-03-30
**Status:** Ready for research

<domain>
## Task Boundary

MultiTokenPaymaster.sol이 paymasterAndData[20:40]을 token으로 읽는 Phase 1 설계를
ERC-4337 v0.8 표준 offset인 [52:72]로 업데이트한다.

이를 위해:
1. MultiTokenPaymaster.sol 소스 수정 (token offset [20:40] → [52:72])
2. forge build로 새 bytecode 생성
3. trh-sdk에서 새 bytecode를 genesis에 재주입 (usdc_genesis.go 패턴 참고)
4. paymaster-signer.ts paymasterAndData를 72 bytes 표준 포맷으로 업데이트

</domain>

<decisions>
## Implementation Decisions

### MultiTokenPaymaster 재배포 방식
- **bytecode 재주입 (genesis injection)**: 수정된 소스를 forge build 후 새 bytecode를 genesis에 덮어쓰기
- usdc_genesis.go 패턴 따르기: trh-sdk에 새 파일 추가 (aa_paymaster_genesis.go)
- predeploy 주소 `0x4200000000000000000000000000000000000067` 유지

### paymasterAndData 포맷 (paymaster-signer.ts)
- **72 bytes 표준 v0.8**: `[paymaster(20)][verificationGasLimit(16)][postOpGasLimit(16)][token(20)]`
- MultiTokenPaymaster가 `paymasterAndData[52:72]`를 token으로 읽도록 수정한 후 사용
- verificationGasLimit, postOpGasLimit은 Alto bundler에게 의미있는 값으로 설정

### Claude's Discretion
- verificationGasLimit, postOpGasLimit 기본값 (기존 150000, 50000 등 적절한 값)
- MultiTokenPaymaster.sol 수정 최소화 (offset 상수화 또는 직접 수정)
- bytecode 로드 방식 (컴파일된 artifact JSON에서 읽기)

</decisions>

<specifics>
## Specific Ideas

**MultiTokenPaymaster.sol 수정 (offset 변경):**
```solidity
// Before (Phase 1):
address token = address(bytes20(userOp.paymasterAndData[20:40]));

// After (ERC-4337 v0.8 standard):
// PAYMASTER_DATA_OFFSET = 52 (from UserOperationLib)
address token = address(bytes20(userOp.paymasterAndData[52:72]));
```

**72 bytes paymasterAndData (paymaster-signer.ts):**
```typescript
const buildPaymasterAndData = (
  tokenAddr: string,
  verificationGasLimit: bigint = 150000n,
  postOpGasLimit: bigint = 50000n
): string =>
  ethers.utils.hexConcat([
    MULTI_TOKEN_PAYMASTER,
    ethers.utils.hexZeroPad(ethers.BigNumber.from(verificationGasLimit).toHexString(), 16),
    ethers.utils.hexZeroPad(ethers.BigNumber.from(postOpGasLimit).toHexString(), 16),
    tokenAddr,
  ])
```

**trh-sdk bytecode 재주입 (aa_paymaster_genesis.go):**
- `injectMultiTokenPaymasterBytecode(genesis)` 함수
- deploy_contracts.go에서 setupAAPaymaster 전 호출

</specifics>

<canonical_refs>
## Canonical References

- MultiTokenPaymaster.sol: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol`
- UserOperationLib.sol: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/lib/UserOperationLib.sol`
- usdc_genesis.go (패턴 참고): `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/usdc_genesis.go`
- deploy_contracts.go: `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/deploy_contracts.go`
- paymaster-signer.ts: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts`

</canonical_refs>
