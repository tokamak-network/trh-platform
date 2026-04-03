# Live Deployment Matrix Tests

Health check test suite that verifies deployed L2 stacks across preset and fee token combinations.

## Prerequisites

- Stack must be **already deployed** and running (Docker Compose or remote)
- Backend API accessible at `http://localhost:8000` (or `LIVE_BACKEND_URL`)
- Admin credentials: admin@gmail.com / admin (default)

## Quick Start

### Single Stack Test

```bash
# Test a specific deployed stack
LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC npx playwright test --config playwright.live.config.ts tests/e2e/matrix/

# With custom chain name
LIVE_PRESET=gaming LIVE_FEE_TOKEN=USDC LIVE_CHAIN_NAME=my-custom-stack npx playwright test --config playwright.live.config.ts tests/e2e/matrix/
```

### Full P0 Matrix

```bash
# Dry run (see what would execute)
npm run test:matrix -- --dry-run

# Run all 4 P0 combinations (assumes stack is deployed for each)
npm run test:matrix
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVE_PRESET` | `gaming` | Preset: general, defi, gaming, full |
| `LIVE_FEE_TOKEN` | `USDC` | Fee token: TON, ETH, USDT, USDC |
| `LIVE_CHAIN_NAME` | `{token}-{preset}` | Chain name to look up in backend API |
| `LIVE_BACKEND_URL` | `http://localhost:8000` | Backend API URL |

## Test Tiers

| Tier | Scope | Tests | Execution |
|------|-------|-------|-----------|
| **P0 / Tier 1** | Core chain, bridge, explorer | core-chain, bridge-health, explorer-health | All presets |
| **P1 / Tier 2** | Module health checks | monitoring, uptime, drb, aa-health | Conditional per preset |
| **P2 / Tier 3** | Transaction-level | bridge-tx, paymaster-smoke | Separate specs (not in matrix/) |

### Conditional Execution

Tests skip automatically based on preset module availability:

| Module | General | DeFi | Gaming | Full |
|--------|---------|------|--------|------|
| bridge | YES | YES | YES | YES |
| blockExplorer | YES | YES | YES | YES |
| monitoring | - | YES | YES | YES |
| uptimeService | - | YES | YES | YES |
| drb | - | - | YES | YES |
| AA (non-TON) | YES | YES | YES | YES |

## P0 Matrix Combinations

| Preset | Fee Token | Chain Name | Why |
|--------|-----------|------------|-----|
| General | TON | ton-general | Minimal preset, native token, no AA |
| DeFi | USDT | usdt-defi | Mid-tier, ERC20 fee token |
| Gaming | ETH | eth-gaming | Full modules, ETH fee |
| Full | USDC | usdc-full | All modules, USDC fee |

## Spec Files

| File | Tests | Condition |
|------|-------|-----------|
| core-chain.live.spec.ts | L2 RPC, chain ID, blocks, op-node, transfer | Always |
| bridge-health.live.spec.ts | Bridge UI, fee token display | Always |
| explorer-health.live.spec.ts | Blockscout API, frontend | Always |
| monitoring-health.live.spec.ts | Grafana, Prometheus | Skip General |
| uptime-health.live.spec.ts | Uptime Kuma | Skip General |
| drb-health.live.spec.ts | DRB leader, contract | Skip General, DeFi |
| aa-health.live.spec.ts | Paymaster, EntryPoint, bundler | Skip TON |
