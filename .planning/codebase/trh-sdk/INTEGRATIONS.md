# External Integrations - TRH SDK

**Analysis Date:** 2026-03-26

## APIs & External Services

**Blockchain RPC Providers:**
- L1 RPC (Ethereum/Sepolia) - What it's used for: Network interaction, contract deployment, state queries
  - Supported providers: Alchemy, Infura, QuickNode, debug_geth
  - Configuration: Env var `l1_rpc_url` in deployment config
  - Client: go-ethereum (github.com/ethereum/go-ethereum)

**Beacon Chain RPC:**
- L1 Beacon RPC - What it's used for: Beacon chain data for L2 finality
  - Configuration: Env var `l1_beacon_url` in deployment config
  - Client: Direct HTTP/JSON-RPC via go-ethereum

**L2 RPC:**
- L2 RPC URL - What it's used for: L2 network interaction after deployment
  - Configuration: Env var `l2_rpc_url` in deployment config
  - Client: go-ethereum (compatible endpoint)

## Data Storage

**Databases:**
- AWS DynamoDB
  - Purpose: State/configuration persistence for deployment
  - Client: github.com/aws/aws-sdk-go-v2/service/dynamodb v1.53.5
  - Connection: Via AWS IAM credentials and region config

**File Storage:**
- AWS S3
  - Purpose: Contract artifacts, deployment outputs storage
  - Client: github.com/aws/aws-sdk-go-v2/service/s3 v1.79.1
  - Configuration: AWS credentials, region

- AWS EFS (Elastic File System)
  - Purpose: Persistent L2 network storage for validator/node data
  - Client: github.com/aws/aws-sdk-go-v2/service/efs v1.41.10
  - Configuration: EFS mount IDs, Kubernetes PVC binding

- Local Filesystem
  - Purpose: Configuration files, logs, deployment artifacts during SDK execution
  - Location: Current working directory + `~/.trh-sdk/`

**Caching:**
- Not applicable - SDK is stateless CLI tool

## Authentication & Identity

**AWS Services:**
- Auth Provider: AWS IAM
  - Implementation: AWS SDK v2 credential chain (environment variables, IAM instance roles, credential files)
  - Services: EC2, S3, DynamoDB, EFS, CloudWatch, Backup, STS
  - Configuration: AWS access key, secret key, region (stored in deployment config)
  - MFA/STS: Supported via AWS STS (github.com/aws/aws-sdk-go-v2/service/sts v1.41.6)

**Blockchain Wallets:**
- HD Wallet Support: BIP32/BIP39 hierarchical deterministic wallets
  - Libraries: go-bip32, go-bip39
  - Purpose: Generating admin, sequencer, batcher, proposer, challenger private keys
  - Seed phrase support: BIP39 mnemonic generation and derivation

**Ethereum Contract Interaction:**
- go-ethereum (github.com/ethereum/go-ethereum v1.15.2)
  - Supports: Account management, smart contract ABI binding, transaction signing
  - Generated ABIs in `abis/`: Safe.go, L1BridgeRegistry.go, Layer2Manager.go, etc.

## Monitoring & Observability

**Error Tracking:**
- Not detected - SDK logs errors to files and console

**Logs:**
- Approach: Structured logging via go.uber.org/zap v1.27.0
- Implementation: `pkg/logging/zap.go`
  - Dual output: Console (human-readable) + JSON file logs
  - Log levels: DEBUG, INFO, WARN, ERROR with stack traces on errors
  - Configuration: Log path specified per command execution

**CloudWatch Integration:**
- AWS CloudWatch Logs
  - Purpose: Centralized log collection for deployed L2 services
  - Client: github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs v1.63.0
  - Command: `trh-sdk log-collection` - Manages CloudWatch log group settings
  - Sidecar support: AWS CLI-based log collection daemon

**Monitoring Plugins:**
- Block Explorer - Install via `trh-sdk install block-explorer`
- Monitoring Plugin - Install via `trh-sdk install monitoring`
- Bridge Plugin - Install via `trh-sdk install bridge`

## CI/CD & Deployment

**Hosting:**
- AWS EKS (Elastic Kubernetes Service) for testnet/mainnet deployments
- Docker Compose for local devnet deployments
- AWS EC2 for infrastructure provisioning

**Infrastructure as Code:**
- Kubernetes manifests - Deployed to EKS clusters
- Terraform - Used for EC2 provisioning (via remote execution)
- Docker Compose - Local development (`docker-compose.yml` equivalent)

**Deployment Infrastructure:**
- AWS EC2 (github.com/aws/aws-sdk-go-v2/service/ec2 v1.279.0)
  - Purpose: Instance management, security groups, key pairs
- AWS Backup (github.com/aws/aws-sdk-go-v2/service/backup v1.54.6)
  - Purpose: EFS snapshot management, backup restoration

**Process Management:**
- pty (github.com/creack/pty v1.1.24) - Pseudo-terminal handling for child process execution
- gopsutil (github.com/shirou/gopsutil v3.21.11) - System resource monitoring

## Environment Configuration

**Required Environment Variables (Deployment Config `settings.json`):**
- `admin_private_key` - L1 admin account private key
- `sequencer_private_key` - L2 sequencer operations account
- `batcher_private_key` - L2 batch submission account
- `proposer_private_key` - L2 state proof submission account
- `challenger_private_key` - L2 fraud proof challenger (optional)
- `l1_rpc_url` - L1 RPC endpoint URL
- `l1_beacon_url` - L1 Beacon chain RPC
- `l1_rpc_provider` - RPC provider type (debug_geth, etc.)
- `l1_chain_id` - L1 network ID (11155111 for Sepolia testnet, 1 for mainnet)
- `l2_chain_id` - L2 network ID (custom value)
- `l2_rpc_url` - L2 RPC endpoint URL
- `deployment_path` - Path to L1 contract deployment file
- `stack` - Stack name (thanos)
- `network` - Network type (devnet, testnet, mainnet)
- `enable_fraud_proof` - Boolean for fraud proof system
- `chain_name` - User-defined L2 chain name

**AWS Configuration Nested in Settings:**
```json
{
  "aws": {
    "secret_key": "AWS secret access key",
    "access_key": "AWS access key ID",
    "region": "AWS region (us-east-1, etc.)",
    "default_format": "json"
  },
  "k8s": {
    "namespace": "Kubernetes namespace for deployment"
  }
}
```

**Secrets Storage:**
- Private keys stored in deployment config (JSON file, should be protected)
- AWS credentials stored in deployment config or system credential chain
- No .env files detected - Configuration via single `settings.json` file

## Webhooks & Callbacks

**Incoming:**
- Not detected - SDK is CLI-only, no HTTP server

**Outgoing:**
- Socket.IO connections: github.com/maldikhan/go.socket.io v0.1.1
  - Purpose: Real-time communication with deployed services (logs, status updates)
  - Used in: Plugin management, service monitoring

## Contract Interaction

**Smart Contracts:**
- Generated ABIs in `abis/` directory:
  - Safe.go - Gnosis Safe contract bindings
  - L1BridgeRegistry.go - L1 Bridge registry contract
  - L1ContractVerification.go - L1 contract verification
  - Layer2Manager.go - L2 manager contract
  - TON.go - TON token contract

**Deployment Configuration:**
- Reads deployment artifacts from: `tokamak-thanos/contracts-bedrock/deployments/{chainId}-deploy.json`
- Deploys to L1 chain via configured RPC provider
- Generates genesis.json and rollup configuration for L2

## Supported Networks

**Local Devnet:**
- Docker Compose based
- Includes L1 test chain, L2 services, op-node, op-challenger containers

**Testnet:**
- Ethereum Sepolia (chain ID: 11155111) as L1
- Custom L2 chain ID configurable
- Requires Sepolia ETH for deployment

**Mainnet:**
- Ethereum Mainnet (chain ID: 1) as L1
- Requires actual ETH for deployment and operation

---

*Integration audit: 2026-03-26*
