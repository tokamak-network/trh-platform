---
phase: quick-260330-ub2
plan: 01
subsystem: testing
tags: [erc-4337, aa, paymaster, ethers-v6, playwright, alto-bundler, eip-7702, usdc]

requires:
  - phase: quick-260330-s6r
    provides: "MultiTokenPaymaster v0.8 [52:72] offset + genesis injection + 72-byte SDK format"
provides:
  - "AA paymaster end-to-end smoke test covering genesis -> delegation -> bundler -> UserOp execution"
affects: [aa-paymaster, localnet-testing]

tech-stack:
  added: []
  patterns: [inline-erc4337-helpers, raw-ecdsa-signing, packed-userop-v08]

key-files:
  created:
    - tests/e2e/paymaster-smoke.spec.ts
  modified: []

key-decisions:
  - "Inline all ERC-4337 helpers (ethers v6) instead of importing from SDK (ethers v5 incompatible)"
  - "Raw ECDSA signing via wallet.signingKey.sign() — no EIP-191 prefix for ERC-4337 compliance"
  - "72-byte paymasterAndData with [52:72] token offset matching MultiTokenPaymaster v0.8"

patterns-established:
  - "ERC-4337 smoke test pattern: genesis bytecode -> delegation check -> preconditions -> UserOp execution"
  - "AA error code parsing for diagnostic clarity (AA93, AA31, AA33, etc.)"

requirements-completed: [SMOKE-01]

duration: 2min
completed: 2026-03-30
---

# Quick Task 260330-ub2: AA Paymaster E2E Smoke Test Summary

**4-stage Playwright smoke test verifying full AA paymaster pipeline (genesis injection, EIP-7702 delegation, USDC fee token UserOp) on LocalNet Gaming preset via Alto bundler**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T13:02:40Z
- **Completed:** 2026-03-30T13:04:24Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created 360-line Playwright spec with 4 test cases covering the full AA paymaster pipeline
- Inline ethers v6 ERC-4337 helpers: buildPaymasterAndData, packUint128x2, buildUserOpHash, signUserOpRaw
- Alto bundler JSON-RPC integration with eth_sendUserOperation and eth_getUserOperationReceipt polling
- AA error code diagnostic parsing (AA93, AA31, AA33, AA13, AA21, AA25)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create paymaster-smoke.spec.ts with full-stack AA verification** - `4dc43fa` (test)

## Files Created/Modified
- `tests/e2e/paymaster-smoke.spec.ts` - 4-stage AA paymaster smoke test (genesis bytecode, EIP-7702 delegation, USDC/deposit preconditions, UserOp execution via Alto bundler)

## Decisions Made
- Inline all ERC-4337 helpers in ethers v6 rather than importing from SDK (ethers v5 API incompatible)
- Raw ECDSA signing (wallet.signingKey.sign) — wallet.signMessage() adds EIP-191 prefix that breaks ERC-4337 verification
- 72-byte paymasterAndData format: [0:20] paymaster, [20:36] verGasLimit, [36:52] postOpGasLimit, [52:72] token
- PackedUserOp v0.8 format with accountGasLimits and gasFees as packed uint128x2 bytes32

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - tests require a running LocalNet Gaming stack (L2 at localhost:8545, Alto bundler at localhost:4337).

## Next Phase Readiness
- Smoke test ready to run against any LocalNet Gaming preset deployment
- Can be extended with additional fee token tests (WETH, other ERC-20s)

---
*Quick task: 260330-ub2*
*Completed: 2026-03-30*
