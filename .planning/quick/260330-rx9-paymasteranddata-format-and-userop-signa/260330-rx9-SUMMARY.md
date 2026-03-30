# Quick Task 260330-rx9: paymasterAndData Format and UserOp Signature Fix — Summary

**Completed:** 2026-03-30
**Commit:** `44ee2b0eb2` (tokamak-thanos repo)

## What Was Fixed

### Fix 1: paymasterAndData 40 bytes → 52 bytes

`buildPaymasterAndData` 함수가 20(paymaster) + 20(token) = 40 bytes를 반환하고 있었음.
EntryPoint v0.8은 `require(paymasterAndData.length >= PAYMASTER_DATA_OFFSET)` (52 bytes)를 강제하므로
"AA93 invalid paymasterAndData" revert가 발생했음.

`PAYMASTER_PADDING = '0x000000000000000000000000'` (12 bytes zero)를 추가하여
`[paymaster(20)][token(20)][padding(12)]` = 52 bytes 형식으로 수정.

- MultiTokenPaymaster가 `[20:40]`에서 token address를 읽는 현재 소스와 호환
- EntryPoint `require(length >= 52)` 통과

### Fix 2: UserOp 서명 personal_sign → raw ECDSA

`signer.signMessage(arrayify(hash))`는 `personal_sign` RPC를 호출하여
`"\x19Ethereum Signed Message:\n32"` prefix가 붙은 hash를 서명함.
`Simple7702Account._checkSignature`는 `ECDSA.recover(hash, signature) == address(this)`로
raw ECDSA를 기대하므로 `SIG_VALIDATION_FAILED`가 발생했음.

`signUserOpHash` 헬퍼 함수를 추가:
- `ethers.Wallet`: `_signingKey().signDigest()` — 확실한 raw ECDSA
- `JsonRpcSigner` (wagmi): `eth_sign` RPC — MetaMask 기준 prefix 없는 raw ECDSA

두 곳의 `signer.signMessage(...)` 호출을 `signUserOpHash(signer, ...)` 로 교체:
- approve UserOp 서명 (line ~299)
- bridge UserOp 서명 (line ~361)

## Files Modified

| File | Change |
|------|--------|
| `packages/tokamak/sdk/src/paymaster-signer.ts` | PAYMASTER_PADDING 상수 추가, buildPaymasterAndData 수정, signUserOpHash 헬퍼 추가, signMessage 호출 2곳 교체 |

## Commit

```
44ee2b0eb2 fix(sdk): fix paymasterAndData to 52 bytes and use raw ECDSA signature
```

Repository: `/Users/theo/workspace_tokamak/tokamak-thanos`

## Verification

- `npx tsc --noEmit`: 에러 없음 (통과)
- `npx eslint src/paymaster-signer.ts`: 이슈 없음 (통과)
- pre-commit hook (lint-staged): 통과
