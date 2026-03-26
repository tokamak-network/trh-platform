# Technology Stack - TRH SDK

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- Go 1.24.11 - Main SDK implementation language, contains all CLI and deployment logic

## Runtime

**Environment:**
- Go runtime (compiled binary)
- Supports: Linux (amd64, arm64), macOS (amd64, arm64), Windows

**Installation:**
- Binary distribution via GitHub releases (platform-specific builds)
- Installation via `setup.sh` script with configurable install modes (release, commit hash, main branch)

## Frameworks

**CLI Framework:**
- urfave/cli v3.0.0-beta1 - Command-line interface framework for trh-sdk commands

**Testing:**
- testify v1.10.0 - Testing assertions and mocking library
- gopsutil v3.21.11 - System and process monitoring

## Key Dependencies

**Critical:**
- github.com/ethereum/go-ethereum v1.15.2 - Ethereum blockchain interaction, contract ABIs, wallet operations
- github.com/tyler-smith/go-bip32 v1.0.0 - BIP32 hierarchical deterministic wallet support
- github.com/tyler-smith/go-bip39 v1.1.0 - BIP39 mnemonic seed phrase support
- github.com/holiman/uint256 v1.3.2 - 256-bit unsigned integer operations for blockchain values

**AWS Services:**
- github.com/aws/aws-sdk-go-v2 v1.41.1 - AWS SDK v2 base
- github.com/aws/aws-sdk-go-v2/config v1.32.7 - AWS credential/region configuration
- github.com/aws/aws-sdk-go-v2/credentials v1.19.7 - AWS credential handling
- github.com/aws/aws-sdk-go-v2/service/ec2 v1.279.0 - EC2 infrastructure management
- github.com/aws/aws-sdk-go-v2/service/s3 v1.79.1 - S3 object storage
- github.com/aws/aws-sdk-go-v2/service/dynamodb v1.53.5 - DynamoDB NoSQL database
- github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs v1.63.0 - CloudWatch log management
- github.com/aws/aws-sdk-go-v2/service/efs v1.41.10 - Elastic File System mount management
- github.com/aws/aws-sdk-go-v2/service/backup v1.54.6 - AWS Backup service
- github.com/aws/aws-sdk-go-v2/service/sts v1.41.6 - AWS Security Token Service

**Infrastructure & DevOps:**
- github.com/creack/pty v1.1.24 - Pseudo-terminal handling for process management
- golang.org/x/sync v0.11.0 - Synchronization primitives (waitgroups, singleflights, etc.)

**Logging:**
- go.uber.org/zap v1.27.0 - High-performance structured logging

**Configuration:**
- gopkg.in/yaml.v3 v3.0.1 - YAML parsing for configuration files

**Communication:**
- github.com/maldikhan/go.socket.io v0.1.1 - Socket.IO support (for real-time communication with services)

## Build & Distribution

**Package Manager:**
- Go modules (go.mod, go.sum)
- Lockfile: `go.sum` present (35.0K)

**Docker Support:**
- Base: `golang:1.24.11`
- Additional runtime: Node.js v20.16.0 (for contract interaction and build tooling)
- System packages: wget, gnupg, curl, unzip, jq, bc, git, build-essential
- Dockerfile: `Dockerfile` - Multi-stage build with Go and Node.js runtime

**Code Quality:**
- golangci-lint configuration: `.golangci.yml`
- Enabled linters: govet, unused
- Disabled: errcheck, staticcheck

## Configuration

**Environment:**
- Deployment config: `settings.json` file (generated, contains network/deployment parameters)
- AWS credentials: Loaded via AWS SDK v2 credential chain
- Private keys: Managed in deployment configuration (admin, sequencer, batcher, proposer, challenger)

**Build:**
- Go modules for dependency management
- Binary naming: `trh-sdk` (platform-specific: Darwin/Linux/Windows)

## Platform Requirements

**Development:**
- Go 1.24.11+
- Node.js v20.16.0 (for tooling)
- Docker (for container-based infrastructure)
- GNU build tools (make, gcc, etc.)

**Production / Runtime:**
- Docker Compose for local devnet deployment
- AWS account with appropriate IAM permissions for EKS/EC2 deployment
- L1 RPC provider (Alchemy, Infura, QuickNode, etc.)
- Beacon Chain RPC for testnet/mainnet deployments

---

*Stack analysis: 2026-03-26*
