# EFP Test Results — 2026-05-15

**Suite**: EFP-01 ~ EFP-11 (Electron Full Preset Features)
**Stack ID**: `773435b7-272d-4d4f-aa65-a8a047ee514d`
**Chain Name**: `efpfull1`
**L2 Chain ID**: `111551187746`
**L2 RPC**: `http://k8s-opgeth-7ae08a402e-1964192055.ap-northeast-2.elb.amazonaws.com`
**Admin Address**: `0x7220c734653ae8Ca014d4D82A84041EE4169499c`
**Result**: **11 passed (3.0m)**

---

## Test Results

| Test | Description | Result | Evidence |
|------|-------------|--------|----------|
| EFP-01 | Full Suite preset (USDC) deployment via AWS wizard | ✅ PASS | Stack reused: `773435b7-272d-4d4f-aa65-a8a047ee514d` |
| EFP-02 | Deployment complete — all 6 modules present | ✅ PASS | CrossTrade: Completed (1 poll), 6 modules verified |
| EFP-03 | Genesis predeploys bytecode (OP + DRB + AA) | ✅ PASS | 18 predeploy contracts verified |
| EFP-04 | Fault proof contracts (DGF, ASR, DelayedWETH) | ✅ PASS | gameCount=9, version=1.1.0 |
| EFP-05 | DRB — reader node L2 RPC + operator state + fee | ✅ PASS | fee=0.01 ETH, TCP skipped (EKS port 9600 not exposed) |
| EFP-06 | AA — predeploys + depositTo EntryPoint + balance | ✅ PASS | TX: `0xf0c827fd...` block 3547, +0.01 TON |
| EFP-07 | CrossTrade — L1→L2 ETH + L2→L2 ETH full cycles | ✅ PASS | L1→L2 request/provide/claim verified |
| EFP-08 | First dispute game created | ✅ PASS | gameCount=9, game at index 0 |
| EFP-09 | Game resolves DEFENDER_WINS, ASR anchors updated | ✅ PASS | l2BlockNumber=24, root=`0x4aee0666...` |
| EFP-10 | Thanos Bridge — L1→L2 ETH deposit | ✅ PASS | TX: `0xa0b6c86b...` block 10855149, 0.001 ETH |
| EFP-11 | Thanos Bridge — L2→L1 ETH withdrawal initiation | ✅ PASS | TX: `0x8fdf4a56...` block 3632, 0.0001 ETH |

---

## Transaction IDs

### EFP-06: AA depositTo EntryPoint

| Field | Value |
|-------|-------|
| TX Hash | `0xf0c827fdcc82ce59e983c7d0ad3d1cd0a1f8a289737b51b7edc2b2a9948300f2` |
| Block | 3547 (L2) |
| Amount | 0.01 TON |
| Target | EntryPoint `0x4200000000000000000000000000000000000067` |
| Balance after | 1.01 TON |

### EFP-07: CrossTrade L1→L2 full cycle

| Step | TX Hash | Network |
|------|---------|---------|
| L1→L2 requestNonRegisteredToken | `0xa1ae7cd370b9c24957b4d78fae426a985fd92cd150b13e4553d09625bf16f3da` | L1 (Sepolia) |
| L1→L2 saleOrder hash | `0xd46f1f8dbaa0702f74943a15b565ae74cabaa2a7a06d7add50d9972bf3a58ff5` | L2 |
| L2→L2 requestNonRegisteredToken | `0xe72ff3d18a77c42035046492f2193f92867406ebde9e27cb75fb0b1f42f2df58` | L2 |
| L1→L2 provideCT | `0x67a85c73b6bfebcc4598ce0a393fa5a04a4060265d9051a97bcf844ffdb0eef7` | L2 |
| L1→L2 ProviderClaimCT (event) | `0x7fcc8a80b6a33b6e5e9ffb4ad70d7c4b83988710e35e95f60dc1b50e0af036e3` | L2 |

> Note: L2→L2 provideCT skipped — single-L2 setup rejects same-chain provide (expected behavior)

### EFP-10: Thanos Bridge L1→L2 ETH deposit

| Field | Value |
|-------|-------|
| TX Hash | `0xa0b6c86bc3555f6e2dcb3b442243a075797332b8000d3f15e5dc6e6d3456a47c` |
| Block | 10855149 (L1 Sepolia) |
| Amount | 0.001 ETH |
| L1StandardBridge | `0xBa0CfB053E8453F5Db8e41627b37e17122610384` |

### EFP-11: Thanos Bridge L2→L1 ETH withdrawal

| Field | Value |
|-------|-------|
| TX Hash | `0x8fdf4a56781d109ece3fca9c86e818fded58ae446c9fedabdcbac5f9aeb1e253` |
| Block | 3632 (L2) |
| Amount | 0.0001 ETH |
| To | `0x7220c734653ae8Ca014d4D82A84041EE4169499c` |

---

## Contract Addresses

### CrossTrade

| Contract | Address |
|----------|---------|
| L2CrossTradeProxy | `0x984530AD8d9987ea1269426ABF99541F354ee850` |
| L2ToL2CrossTradeProxy | `0xF9c8f55e5F1853D6751222D39737797f9cec9f60` |
| L1CrossTradeProxy (L1) | `0xfea37d39bec823d503ed6fb9d3a6e151190821fb` |
| L2toL2CrossTradeL1 (L1) | `0xd038d89655f106d88c5bd56a9442d9ecee675c1c` |

### Fault Proof

| Contract | Address |
|----------|---------|
| DisputeGameFactory | `0x8D581a68d97a581E9D76eB042136C8E84EE33df6` |
| CANNON game | `0x0F81D3EA0702fAf501965954D818692b2A3eD1Ef` |
| L1StandardBridge | `0xBa0CfB053E8453F5Db8e41627b37e17122610384` |

### EFP-09 Dispute Game Result

| Field | Value |
|-------|-------|
| Game proxy | `0xBA1A266A3730Fb2e018B729e0a5C94ded82c6c9F` |
| Resolution | `DEFENDER_WINS` (status=2) |
| ASR l2BlockNumber | 24 |
| ASR root | `0x4aee06662910605ebd1ca3d87ffb61599dc30c56461b60277df6743a00325ff2` |

---

## Issues Encountered

See `efp-issue-20260515.md` for detailed issue log.

### Bug Fixed During Run

**`stack-resolver.ts` container name default**
- Bug: Default container name was `'trh-backend'`
- Fix: Changed to `'trh-platform-backend-1'` (Docker Compose naming convention)
- Impact: EFP-04 was failing to read deployment JSON via `docker exec`
- File: `tests/e2e/helpers/stack-resolver.ts:129`

### Known Limitations

- EFP-05: DRB TCP port (9600) not exposed on AWS EKS — skipped
- EFP-07: L2→L2 provideCT fails on single-L2 setup — expected behavior
- EFP-06/07/10/11: Blockscout not available (block-explorer integration not deployed on this stack)
- EFP-06: Bundler not available at localhost:4337 — skipped

---

## Raw Logs

- `efp-run-20260515-1113.log` — final successful run (all 11 passed)
