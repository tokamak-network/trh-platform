# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** CLI-driven orchestration framework with modular stack abstraction

**Key Characteristics:**
- Command-based architecture using urfave/cli v3
- Stack abstraction pattern (currently: Thanos) for L2 deployment workflows
- Multi-network support (local devnet, testnet, mainnet)
- Multi-infrastructure support (local Docker, AWS EKS with Terraform)
- Dependency injection of logging, configuration, and cloud providers
- Context-driven async operations for deployment tasks

## Layers

**CLI/Command Layer:**
- Purpose: Parse user input, route commands, manage action dispatch
- Location: `cli.go`, `commands/*.go`, `flags/flags.go`
- Contains: Command definitions, flag specifications, action handlers
- Depends on: Logging, Stack implementations, Types
- Used by: User via `trh-sdk` binary

**Stack Abstraction Layer:**
- Purpose: Provide unified interface for deployment, destruction, and chain operations
- Location: `pkg/stacks/thanos/thanos_stack.go` (core), related implementation files
- Contains: ThanosStack struct, deployment methods, network/infrastructure routing
- Depends on: Cloud provider abstractions, utilities, types, logging
- Used by: Command handlers, test code

**Infrastructure Provider Layer:**
- Purpose: Abstract cloud-specific operations (AWS EKS, local Docker)
- Location: `pkg/cloud-provider/aws/aws.go`, `pkg/stacks/thanos/local_network.go`, `pkg/stacks/thanos/terraform.go`
- Contains: AWS authentication, EC2/EKS operations, Terraform execution, local Docker operations
- Depends on: AWS SDK v2, utilities, types
- Used by: Stack implementations

**Type System Layer:**
- Purpose: Define data structures for configuration, deployment state, and entity relationships
- Location: `pkg/types/*.go` (19 domain files)
- Contains: Config, ChainConfiguration, AWSConfig, Contracts, StakingInfo, and 15+ other domain types
- Depends on: AWS SDK types, Ethereum types
- Used by: All layers for data structures

**Utilities Layer:**
- Purpose: Provide common operations (shell execution, file I/O, AWS operations, Kubernetes operations)
- Location: `pkg/utils/*.go` (24 files)
- Contains: Command execution, file management, crypto/account derivation, Docker operations, Terraform execution
- Depends on: Ethereum go-ethereum library, AWS SDK, system libraries
- Used by: All layers for infrastructure operations

**Support Layers:**
- **Logging:** `pkg/logging/zap.go` - Dual output (console + JSON file) using Zap
- **Scanner:** `pkg/scanner/scanner.go` - Interactive CLI input (bool, string, int, float)
- **Dependencies:** `pkg/dependencies/*.go` - Runtime requirement checks (Docker, Kubernetes, Terraform, AWS CLI)
- **Constants:** `pkg/constants/*.go` - Network/stack/channel definitions, supported configurations

## Data Flow

**Deployment Flow (Local Devnet):**

1. User runs `trh-sdk deploy`
2. Command handler (`commands/deploy.go::ActionDeploy`) reads `settings.json` (or defaults to devnet)
3. Creates ThanosStack instance with logger and deployment path
4. Calls `ThanosStack.Deploy(ctx, "localhost", nil)`
5. Routes to `deployLocalDevnet()`:
   - Clones `tokamak-thanos` repository
   - Executes `docker-compose up` for local-bedrock stack
   - Waits for container readiness (L1, L2, op-node, op-challenger)
   - Returns success

**Deployment Flow (Testnet/Mainnet to AWS):**

1. User runs `trh-sdk deploy-contracts` to deploy L1 contracts first
2. Command prompts for deployment parameters (preset, fee-token, fraud-proof settings)
3. ThanosStack.DeployContracts() executes:
   - Clones tokamak-thanos repo (if `--reuse-deployment=false`)
   - Builds and deploys Solidity contracts on L1
   - Generates deployment file and genesis config
   - Optionally registers candidate in DAO
4. User runs `trh-sdk deploy` to deploy L2 infrastructure
5. Command prompts for infrastructure provider (AWS or local)
6. For AWS:
   - Prompts for AWS credentials (access key, secret key, region)
   - Creates ThanosStack with AWSProfile (S3 client, account info)
   - Calls `deployNetworkToAWS()`:
     - Executes Terraform to provision EKS cluster and supporting resources
     - Deploys L2 chain components via Kubernetes (op-geth, op-node, op-batcher, op-proposer)
     - Configures monitoring (Prometheus, Grafana) and block explorer
7. Registration metadata sent to GitHub if credentials provided

**State Management:**

- **Configuration:** Read from `settings.json` in deployment directory (network, stack, AWS/K8s config)
- **Logs:** Written to `logs/` directory with timestamps (deploy_<stack>_<network>_<timestamp>.log)
- **Terraform State:** Managed in-situ for AWS deployments (tracks infrastructure)
- **Deployment Artifacts:** Cloned repositories stored locally, reusable across deployments

## Key Abstractions

**ThanosStack:**
- Purpose: Encapsulate all L2 deployment logic for a single rollup
- Examples: `pkg/stacks/thanos/thanos_stack.go`, `deploy_chain.go`, `destroy_chain.go`
- Pattern: Object-oriented with method receivers, holds state (network, logger, config, AWS profile)
- Interface: Public methods (`Deploy`, `DeployContracts`, `Destroy`, `RegisterCandidate`, `ShowInformation`)

**Stack Pattern (Future-proofing):**
- Allows multiple stack implementations beyond Thanos
- Each stack implements full deployment lifecycle
- Routing via `constants.SupportedStacks` map and switch statements in commands

**CloudProvider Abstraction:**
- AWS auth (`LoginAWS`, static credentials provider)
- Infrastructure operations separated: `deployNetworkToAWS`, `destroyInfraOnAWS`, EFS backup management
- Kubernetes operations abstracted in utils (`SwitchKubernetesContext`, `ExecuteKubeCommand`)

**Configuration Types:**
- `ChainConfiguration`: L1/L2 block times, batch frequencies, challenge periods
- `DeployContractsConfig`: Contract deployment parameters (preset, fee-token, fault-proof flag)
- `Config`: Master deployment config from `settings.json` (credentials, RPC URLs, AWS config, K8s namespace)

## Entry Points

**Binary Entry Point:**
- Location: `main.go`
- Triggers: `trh-sdk` binary execution
- Responsibilities: Verify Go version match, call `Run()`

**CLI Router:**
- Location: `cli.go::Run()`
- Triggers: Called from main.go
- Responsibilities: Define command tree, wire flags to action handlers

**Command Actions:**
- Location: `commands/` directory (each command has an ActionXxx handler)
- Triggers: User selects command + provides flags
- Examples: `ActionDeploy()`, `ActionDeployContracts()`, `ActionDestroy()`, `ActionInstall()`, `ActionVersion()`
- Pattern: Returns `cli.ActionFunc` (context, cli.Command) → error

## Error Handling

**Strategy:** Explicit error propagation with contextual logging

**Patterns:**
- All functions return `(result, error)` pairs
- Errors logged with context using Zap's sugared logger
- Context cancellation handled explicitly (errors.Is(err, context.Canceled))
- Recovery operations: If deploy fails, automatically destroy infrastructure (cleanup)
- User-facing errors printed to stdout before returning

**Example (deploy_chain.go):**
```go
err := t.deployLocalDevnet(ctx)
if err != nil {
    if errors.Is(err, context.Canceled) {
        return nil  // User canceled, don't fail
    }
    t.logger.Error("Failed to deploy the devnet", "err", err)

    // Auto-cleanup on failure
    if destroyErr := t.destroyDevnet(ctx); destroyErr != nil {
        t.logger.Error("Failed to destroy the devnet after deploying the chain failed", "err", destroyErr)
    }
    return err
}
```

## Cross-Cutting Concerns

**Logging:**
- Initialized per command in main handler with filepath like `logs/deploy_<stack>_<network>_<timestamp>.log`
- Outputs simultaneously to stdout (console format) and file (JSON format) via Zap Tee
- Used throughout via `*zap.SugaredLogger` passed to ThanosStack

**Validation:**
- Chain configuration validation: `ChainConfiguration.Validate()` checks all required fields
- Mnemonic validation: `bip39.IsMnemonicValid()` for seed phrases
- Network/stack validation: Switch statements check against `constants.SupportedNetworks/Stacks` maps
- Infrastructure validation: `dependencies.Check*Installation()` for Docker, Kubectl, Terraform, AWS CLI

**Authentication:**
- AWS: Static credentials provider with access/secret keys from `AWSConfig`
- Ethereum: BIP32/BIP39 HD wallet derivation from seed phrase for account generation
- GitHub: Optional credentials for metadata registration

**Async Coordination:**
- Context passed through call chain (`context.Context`)
- Context cancellation properly handled in long-running operations
- No goroutine management visible at this level (delegated to subprocess calls)
