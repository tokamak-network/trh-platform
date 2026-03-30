---
name: 260330-ub2 context
description: AA paymaster E2E smoke test — Playwright Full-stack, LocalNet 기준 USDC fee UserOp 검증
type: project
---

# Quick Task 260330-ub2: AA Paymaster End-to-End Smoke Test - Context

**Gathered:** 2026-03-30
**Status:** Ready for research

<domain>
## Task Boundary

s6r에서 완성된 AA paymaster 인프라(MultiTokenPaymaster [52:72] offset + genesis injection + 72-byte SDK)가
실제 LocalNet에서 end-to-end로 동작하는지 검증하는 Playwright smoke test를 작성한다.

검증 범위:
1. MultiTokenPaymaster bytecode가 genesis code namespace (0xc0d3...0067)에 올바르게 주입됐는지 (eth_getCode)
2. Alto bundler가 72-byte paymasterAndData를 처리하는지 (eth_sendUserOperation → bundler response)
3. MultiTokenPaymaster._validatePaymasterUserOp가 [52:72]에서 token을 읽는지 (UserOp 실행 성공으로 간접 확인)
4. USDC fee로 UserOp (approve + bridge)이 최종 실행되는지 (tx receipt)

</domain>

<decisions>
## Implementation Decisions

### 테스트 형태
- **Playwright E2E 스크립트**: bridge-live.spec.ts 패턴으로 새 spec 파일 추가
- 위치: `tests/e2e/paymaster-smoke.spec.ts`
- Playwright test runner 사용 (ethers.js 직접 import)

### 검증 범위
- **Full stack**: genesis injection → bytecode 확인 → Alto bundler → UserOp 실행까지 전 과정
- 각 단계를 순차적으로 확인하여 어느 레이어에서 실패하는지 파악 가능하도록 구성

### LocalNet 상태 가정
- **이미 떠있는 LocalNet** (Gaming preset)
- bridge-live.spec.ts와 동일한 사전 조건 (L1/L2 RPC endpoint, funded accounts 등)
- 환경변수: E2E_L2_RPC_URL, E2E_PRIVATE_KEY 등 기존 bridge-live.spec.ts 변수 재사용

### 실패 진단
- **revert reason 파싱**: bundler error message에서 AA93/AA31/AA33 등 ERC-4337 error code 파싱
- 각 단계 실패 시 어느 레이어(genesis/bundler/contract)에서 실패했는지 명확히 표시

### Claude's Discretion
- paymasterVerificationGasLimit, postOpGasLimit 값 (150000/50000 기본값 사용)
- USDC approve UserOp + bridge UserOp 중 어느 것을 smoke test 대상으로 할지 (approve UserOp 먼저 단순화)
- test timeout 값

</decisions>

<specifics>
## Specific Ideas

**Playwright spec 구조:**
```typescript
// tests/e2e/paymaster-smoke.spec.ts
test.describe('AA Paymaster Smoke Test', () => {
  test('MultiTokenPaymaster bytecode injected into genesis', async () => {
    // eth_getCode on 0xc0d3...0067
    // expect code != '0x' and length > 100
  })

  test('Alto bundler accepts 72-byte paymasterAndData', async () => {
    // buildPaymasterAndData(USDC_ADDRESS) -> 72 bytes
    // expect hexDataLength == 72
  })

  test('UserOp with USDC fee executes successfully', async () => {
    // 1. Build PackedUserOperation with paymasterAndData (72 bytes, USDC)
    // 2. eth_sendUserOperation to Alto bundler
    // 3. Poll for receipt (eth_getUserOperationReceipt)
    // 4. Assert success = true
  })
})
```

**ERC-4337 error code 파싱:**
```typescript
const AA_ERROR_CODES: Record<string, string> = {
  'AA93': 'invalid paymasterAndData (length < 52)',
  'AA31': 'paymaster deposit too low',
  'AA33': 'reverted: _validatePaymasterUserOp failed',
  'AA13': 'initCode failed or OOG',
  'AA21': 'didn\'t pay prefund',
}
```

</specifics>

<canonical_refs>
## Canonical References

- bridge-live.spec.ts (패턴 참고): `/Users/theo/workspace_tokamak/trh-platform/tests/e2e/bridge-live.spec.ts`
- paymaster-signer.ts: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts`
- MultiTokenPaymaster.sol: `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/contracts-bedrock/src/AA/MultiTokenPaymaster.sol`
- aa_paymaster_genesis.go: `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/aa_paymaster_genesis.go`
- Alto bundler endpoint: http://localhost:4337 (ERC-4337 v0.8)

</canonical_refs>
