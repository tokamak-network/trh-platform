# CrossTrade Integration — Technical Stack Decisions

Source: research/STACK.md (GSD phase research)

## Core Libraries (all already in trh-sdk go.mod)

| Library | Version | Purpose |
|---------|---------|---------|
| go-ethereum/ethclient | v1.17.1 | L1 RPC, tx signing, receipt polling |
| go-ethereum/accounts/abi | v1.17.1 | ABI encoding for depositTransaction() calldata |
| go-ethereum/accounts/abi/bind | v1.17.1 | bind.WaitMined, abigen-generated bindings |
| go-ethereum/crypto | v1.17.1 | ECDSA key handling, Keccak256 |
| abigen | matching v1.17.1 | Go bindings for OptimismPortal, L1CrossTrade, L2toL2CrossTradeL1 |
| holiman/uint256 | v1.3.2 | 256-bit math for gas/value encoding |
| go.uber.org/zap | v1.27.0 | Structured logging (follow `t.logger.Infof` pattern) |

## Key Decisions

### ABI Encoding
- **OptimismPortal**: abigen bindings → type-safe `DepositTransaction(opts, _to, _value, _gasLimit, _isCreation, _data)`
- **L2 inner calldata** (setSelectorImplementations2, initialize, setChainInfo, registerToken): `abi.JSON` + `abi.Pack` pattern (matches `drb_genesis.go`)
- **L1 setChainInfo** (Backend-side): abigen bindings for L1CrossTradeProxy and L2toL2CrossTradeL1

### Transaction Pattern
- Use `bind.TransactOpts` + `bind.WaitMined` (NOT raw `types.NewTransaction`)
- Reference: `sendTxAndWait` in `aa_setup.go` lines 87-114

### L1→L2 Deposit Tracking
- Poll L2 `eth_getCode` at predicted address (NOT sourceHash computation — too complex)
- L2 CREATE address: standard EVM formula; nonce tracking must be correct

### Docker dApp Inclusion
- Separate compose file: `docker-compose.crosstrade.yml` (NOT profiles — requires Compose v3.9+; current is v3.8)
- Backend constructs `docker compose -f docker-compose.yml -f docker-compose.crosstrade.yml` dynamically

## What NOT to Use

| Technology | Reason |
|------------|--------|
| optimism monorepo Go packages | Massive dep tree; version conflicts with go-ethereum v1.17.1 |
| Foundry/forge for local deploy | External binary dep; PRD requires pure Go |
| Genesis predeploy | Explicitly rejected: constructor not executed, bridge invariant violation |
| go-ethereum SimulatedBackend | Doesn't support deposit tx type 0x7E |

## Gas Estimates

| Operation | L1 Gas | L2 Gas Limit |
|-----------|--------|--------------|
| depositTransaction (creation) | ~100k–150k | 3,000,000 |
| depositTransaction (function call) | ~60k–80k | 500,000 |
| L1 setChainInfo | ~80k–120k | N/A (direct L1) |

## ABI Sources
- **OptimismPortal**: OP Stack contracts-bedrock artifacts
- **L1CrossTrade, L2toL2CrossTradeL1**: `crossTrade/abi/` directory
