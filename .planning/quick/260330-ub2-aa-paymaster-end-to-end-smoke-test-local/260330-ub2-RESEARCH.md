# Quick Task 260330-ub2: AA Paymaster E2E Smoke Test - Research

**Researched:** 2026-03-30
**Domain:** ERC-4337 v0.8 UserOp on LocalNet (Gaming preset, USDC fee token)
**Confidence:** HIGH

## Summary

LocalNet Gaming preset에서 AA paymaster (MultiTokenPaymaster v0.8) 전체 파이프라인을 검증하는 Playwright spec 작성에 필요한 기술 조사. paymaster-signer.ts의 모든 핵심 함수가 테스트에서 직접 사용 가능하며, bridge-tx.live.spec.ts 패턴을 따라 ethers v5(SDK)로 RPC 직접 호출 방식의 smoke test를 구성한다.

**Primary recommendation:** paymaster-signer.ts를 직접 import하지 말고, 핵심 로직(buildPaymasterAndData, packUint128x2, sendRawUserOp, waitForReceipt)을 테스트 내에서 인라인 구현한다. SDK는 ethers v5이고 프로젝트 테스트는 ethers v6 기반이므로 호환성 충돌 위험이 있다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Playwright E2E 스크립트: bridge-live.spec.ts 패턴으로 `tests/e2e/paymaster-smoke.spec.ts` 생성
- Full stack 검증: genesis injection -> bytecode 확인 -> Alto bundler -> UserOp 실행
- 이미 떠있는 LocalNet (Gaming preset) 가정
- 기존 bridge-tx.live.spec.ts 환경변수 패턴 재사용
- revert reason 파싱: AA93/AA31/AA33 등 ERC-4337 error code

### Claude's Discretion
- paymasterVerificationGasLimit, postOpGasLimit 값 (150000/50000 기본값)
- approve UserOp vs bridge UserOp 중 smoke test 대상 선택
- test timeout 값

### Deferred Ideas (OUT OF SCOPE)
없음
</user_constraints>

## Finding 1: bridge-tx.live.spec.ts 패턴 분석

**Confidence: HIGH** (소스 직접 확인)

### 환경변수 / 상수 구조
bridge-tx.live.spec.ts는 환경변수를 사용하지 않고 **상수로 하드코딩**:
```typescript
const L1_RPC   = 'https://eth-sepolia.g.alchemy.com/v2/...';
const L2_RPC   = 'http://localhost:8545';
const ADMIN_KEY = '679d88a9fb...';  // Gaming preset admin key
```

### 사용 패턴
- `import { test, expect } from '@playwright/test'`와 `import { ethers } from 'ethers'` 병용
- Playwright `test.describe` + `test.beforeAll`에서 트랜잭션 전송
- `ethers.JsonRpcProvider` (ethers v6 API) 사용
- `pollUntil()` 헬퍼로 비동기 대기
- `page` fixture는 Blockscout UI 확인에만 사용 (순수 RPC 테스트에는 불필요)

### Playwright config 참고
`playwright.config.ts`는 `webServer`로 trh-platform-ui를 3009 포트에 띄우지만, live spec들은 이미 떠있는 서비스(localhost:8545 등)에 직접 연결한다. paymaster smoke test도 `page` fixture 없이 ethers RPC만으로 동작 가능.

## Finding 2: paymaster-signer.ts API 분석

**Confidence: HIGH** (소스 직접 확인)

### 핵심 함수들
| 함수 | Export | 용도 |
|------|--------|------|
| `buildPaymasterAndData(tokenAddr)` | 내부(미export) | 72-byte paymasterAndData 생성 |
| `packUint128x2(high, low)` | 내부(미export) | bytes32로 두 uint128 pack |
| `buildUserOpHash(userOp, chainId)` | 내부(미export) | ERC-4337 userOpHash 계산 |
| `signUserOpHash(signer, hash)` | 내부(미export) | Raw ECDSA 서명 (ethers.Wallet or JsonRpcSigner) |
| `sendRawUserOp(bundlerUrl, userOp)` | 내부(미export) | eth_sendUserOperation JSON-RPC |
| `waitForReceipt(bundlerUrl, hash)` | 내부(미export) | eth_getUserOperationReceipt 폴링 |
| `wrapWithPaymaster(signer, opts)` | **export** | Proxy signer 래핑 (public API) |
| `sendAsUserOp(signer, tx, opts)` | 내부(미export) | UserOp 빌드+서명+전송+대기 |

### 직접 import 불가 이유
1. 핵심 helper 함수들(buildPaymasterAndData 등)이 **export 되지 않음** -- `wrapWithPaymaster`만 export
2. **ethers v5** 사용: `ethers.utils.hexConcat`, `ethers.BigNumber` 등 v5 API. trh-platform 테스트는 **ethers v6** (`ethers.JsonRpcProvider`, `ethers.formatEther` 등)
3. SDK 패키지의 빌드 경로가 복잡하여 테스트에서 직접 import 시 의존성 해결이 어려움

### 권장: 테스트 내 인라인 구현
paymaster-signer.ts 로직이 간단(hexConcat + fetch)하므로 ethers v6로 동등한 로직을 테스트 파일에 직접 작성:

```typescript
// ethers v6 equivalent of buildPaymasterAndData
function buildPaymasterAndData(tokenAddr: string): string {
  return ethers.concat([
    MULTI_TOKEN_PAYMASTER,                           // 20 bytes
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16), // verificationGasLimit: 16 bytes
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),  // postOpGasLimit: 16 bytes
    tokenAddr,                                        // 20 bytes
  ]);
  // Total: 72 bytes
}
```

## Finding 3: Alto Bundler RPC 인터페이스

**Confidence: HIGH** (paymaster-signer.ts 소스 확인)

### Endpoint
- **URL:** `http://localhost:4337` (CONTEXT.md에서 확인, paymaster-signer.ts의 `DEFAULT_BUNDLER_URL`과 일치)
- JSON-RPC 2.0 프로토콜

### eth_sendUserOperation
```json
{
  "jsonrpc": "2.0", "id": 1,
  "method": "eth_sendUserOperation",
  "params": [
    {
      "sender": "0x...",
      "nonce": "0x...",
      "initCode": "0x",
      "callData": "0x...",
      "accountGasLimits": "0x...",
      "preVerificationGas": "0x...",
      "gasFees": "0x...",
      "paymasterAndData": "0x...",
      "signature": "0x..."
    },
    "0x4200000000000000000000000000000000000063"  // EntryPoint v0.8
  ]
}
```
- 응답: `{ result: "<userOpHash>" }` 또는 `{ error: { message, code } }`

### eth_getUserOperationReceipt
```json
{
  "jsonrpc": "2.0", "id": 1,
  "method": "eth_getUserOperationReceipt",
  "params": ["<userOpHash>"]
}
```
- 응답: `{ result: { receipt: { transactionHash: "0x..." } } }` 또는 `{ result: null }` (pending)
- 폴링: 3초 간격, 최대 20회 (60초)

## Finding 4: MultiTokenPaymaster Bytecode 검증 주소

**Confidence: HIGH** (aa_paymaster_genesis.go + drb_genesis.go 확인)

### 주소 매핑
| 역할 | 주소 | 확인 대상 |
|------|------|-----------|
| Proxy (predeploy) | `0x4200000000000000000000000000000000000067` | storage slot에 impl pointer만 있음 |
| Implementation (code namespace) | `0xc0D3C0d3C0d3C0D3c0d3C0d3c0D3C0d3c0d30067` | **실제 bytecode 확인 대상** |

### Code namespace 계산
`predeployToCodeNamespace` 로직: `(addr & 0xffff) | 0xc0D3C0d3C0d3C0D3c0d3C0d3c0D3C0d3c0d30000`
- `0x...0067` -> `0xc0D3...0067`

### 검증 방법
```typescript
// 두 주소 모두 확인
const proxyCode = await provider.getCode('0x4200000000000000000000000000000000000067');
const implCode = await provider.getCode('0xc0D3C0d3C0d3C0D3c0d3C0d3c0D3C0d3c0d30067');

// Proxy: ERC-1967 minimal proxy (짧음, ~50 bytes)
expect(proxyCode).not.toBe('0x');
// Implementation: MultiTokenPaymaster 전체 bytecode (수천 bytes)
expect(implCode.length).toBeGreaterThan(200);
```

## Finding 5: EIP-7702 Delegation 선결 조건

**Confidence: HIGH** (aa_setup.go 확인)

### setupAAPaymaster가 수행하는 5단계
1. `EntryPoint.depositTo(MultiTokenPaymaster)` -- EntryPoint에 gas 보증금 예치
2. `SimplePriceOracle.updatePrice(initialPrice)` -- 토큰 가격 오라클 설정
3. `MultiTokenPaymaster.addToken(tokenAddr, oracle, markupPct, decimals)` -- 토큰 등록
4. 백그라운드 price updater 시작
5. **EIP-7702 delegation**: admin EOA -> Simple7702Account (SetCode tx type 0x04)

### 테스트 시 전제 조건
LocalNet이 이미 Gaming preset으로 떠있으면 위 5단계가 **이미 완료**된 상태.
paymaster-signer.ts의 `sendAsUserOp`는 **Step 5의 EIP-7702 delegation을 검증**:
```typescript
const code = await provider.getCode(sender);
if (!code.startsWith('0xef0100')) {
  throw new Error('EIP-7702 delegation not set');
}
```

### USDC 잔액 확인
- USDC predeploy: `0x4200000000000000000000000000000000000778`
- Gaming preset admin이 genesis에서 USDC를 배정받는지 확인 필요
- `balanceOf(adminAddr)` on USDC contract로 확인
- Allowance: paymaster-signer.ts가 자동 approve 처리 (allowance == 0이면 approve UserOp 먼저 전송)

### Admin key
bridge-tx.live.spec.ts에서 사용하는 값: `679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9`

## Finding 6: ethers v5 vs v6 주요 차이점 (테스트 작성 시)

| 기능 | ethers v5 (SDK) | ethers v6 (테스트) |
|------|-----------------|-------------------|
| Provider | `new ethers.providers.JsonRpcProvider(url)` | `new ethers.JsonRpcProvider(url)` |
| BigNumber | `ethers.BigNumber.from(x)` | `BigInt(x)` 또는 native bigint |
| hexConcat | `ethers.utils.hexConcat([...])` | `ethers.concat([...])` |
| hexZeroPad | `ethers.utils.hexZeroPad(hex, len)` | `ethers.zeroPadValue(hex, len)` |
| keccak256 | `ethers.utils.keccak256(data)` | `ethers.keccak256(data)` |
| ABI encode | `ethers.utils.defaultAbiCoder.encode(...)` | `ethers.AbiCoder.defaultAbiCoder().encode(...)` |
| Wallet | `new ethers.Wallet(key, provider)` | `new ethers.Wallet(key, provider)` (동일) |
| signDigest | `wallet._signingKey().signDigest(hash)` | `wallet.signingKey.sign(hash)` |
| joinSignature | `ethers.utils.joinSignature(sig)` | `ethers.Signature.from(sig).serialized` |

## Common Pitfalls

### Pitfall 1: ethers v5/v6 혼용
**What:** SDK가 ethers v5, 테스트가 ethers v6를 사용. import 시 API 불일치.
**How to avoid:** paymaster-signer.ts를 import하지 말고 ethers v6로 동일 로직 재구현.

### Pitfall 2: UserOp signature prefix
**What:** ERC-4337 v0.8에서 Simple7702Account는 raw ECDSA 서명(no EIP-191 prefix)을 기대함. `wallet.signMessage()`를 사용하면 `\x19Ethereum Signed Message` prefix가 붙어 실패.
**How to avoid:** `wallet.signingKey.sign(ethers.getBytes(userOpHash))` 사용.

### Pitfall 3: EIP-7702 delegation 미설정
**What:** `sendAsUserOp`가 sender의 code가 `0xef0100`으로 시작하는지 확인. 미설정이면 실패.
**How to avoid:** smoke test 첫 단계에서 `getCode(adminAddr)`로 delegation 확인하고, 미설정이면 test.skip().

### Pitfall 4: USDC 잔액 부족
**What:** admin 계정에 USDC가 없으면 paymaster가 fee 청구 불가.
**How to avoid:** 테스트 시작 시 `balanceOf(adminAddr)` > 0 확인.

### Pitfall 5: paymasterAndData 길이
**What:** MultiTokenPaymaster v0.8은 정확히 72 bytes를 기대. 짧거나 길면 AA93 revert.
**How to avoid:** `ethers.dataLength(paymasterAndData) === 72` 단언.

## Code Examples

### 72-byte paymasterAndData 빌드 (ethers v6)
```typescript
const MULTI_TOKEN_PAYMASTER = '0x4200000000000000000000000000000000000067';
const USDC_ADDRESS = '0x4200000000000000000000000000000000000778';
const ENTRYPOINT_V08 = '0x4200000000000000000000000000000000000063';

function buildPaymasterAndData(tokenAddr: string): string {
  return ethers.concat([
    MULTI_TOKEN_PAYMASTER,
    ethers.zeroPadValue(ethers.toBeHex(150000n), 16),
    ethers.zeroPadValue(ethers.toBeHex(50000n), 16),
    tokenAddr,
  ]);
}
```

### packUint128x2 (ethers v6)
```typescript
function packUint128x2(high: bigint, low: bigint): string {
  const packed = (high << 128n) | low;
  return ethers.zeroPadValue(ethers.toBeHex(packed), 32);
}
```

### UserOp hash 계산 (ethers v6)
```typescript
function buildUserOpHash(userOp: PackedUserOp, chainId: number): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ['address','uint256','bytes32','bytes32','bytes32','uint256','bytes32','bytes32'],
    [
      userOp.sender, userOp.nonce,
      ethers.keccak256(userOp.initCode), ethers.keccak256(userOp.callData),
      userOp.accountGasLimits, userOp.preVerificationGas,
      userOp.gasFees, ethers.keccak256(userOp.paymasterAndData),
    ]
  );
  const innerHash = ethers.keccak256(encoded);
  return ethers.keccak256(
    coder.encode(['bytes32','address','uint256'], [innerHash, ENTRYPOINT_V08, chainId])
  );
}
```

### Raw ECDSA 서명 (ethers v6)
```typescript
function signUserOpRaw(wallet: ethers.Wallet, userOpHash: string): string {
  const sig = wallet.signingKey.sign(ethers.getBytes(userOpHash));
  return ethers.Signature.from(sig).serialized;
}
```

### Alto bundler RPC (ethers v6 / fetch)
```typescript
async function sendUserOp(bundlerUrl: string, userOp: SerializedUserOp): Promise<string> {
  const res = await fetch(bundlerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_sendUserOperation',
      params: [userOp, ENTRYPOINT_V08],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Bundler: ${data.error.message}`);
  return data.result;
}
```

## Sources

### Primary (HIGH confidence)
- `/Users/theo/workspace_tokamak/tokamak-thanos/packages/tokamak/sdk/src/paymaster-signer.ts` -- SDK UserOp 빌드/전송 전체 로직
- `/Users/theo/workspace_tokamak/trh-platform/tests/e2e/bridge-tx.live.spec.ts` -- 기존 live E2E 패턴
- `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/aa_setup.go` -- setupAAPaymaster 5단계
- `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/aa_paymaster_genesis.go` -- genesis bytecode injection
- `/Users/theo/workspace_tokamak/trh-sdk/pkg/stacks/thanos/drb_genesis.go` -- predeployToCodeNamespace 계산
- `/Users/theo/workspace_tokamak/trh-sdk/pkg/constants/l2_contracts.go` -- predeploy 주소 상수

## Metadata

**Confidence breakdown:**
- Predeploy addresses: HIGH -- Go 소스 직접 확인
- UserOp 빌드 로직: HIGH -- paymaster-signer.ts 전체 분석
- Alto bundler RPC: HIGH -- sendRawUserOp/waitForReceipt 소스 확인
- ethers v5->v6 변환: HIGH -- 양쪽 API 패턴 확인

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (LocalNet 인프라 안정)
