# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
trh-sdk/
├── abis/                           # Smart contract ABIs and schemas
│   └── json/                       # JSON ABI files for contract interaction
├── cmd/                            # Command utilities (presently unused)
├── commands/                       # CLI action handlers for all commands
├── docs/                           # User documentation and guides
├── flags/                          # CLI flag definitions and environment variable bindings
├── pkg/                            # Core application packages
│   ├── cloud-provider/             # Cloud infrastructure abstractions
│   │   └── aws/                    # AWS-specific implementations (EC2, EKS, S3, STS)
│   ├── constants/                  # Global constants (networks, stacks, channels, versions)
│   ├── dependencies/               # Runtime requirement checking and installation
│   ├── logging/                    # Logging initialization (Zap dual-output setup)
│   ├── scanner/                    # Interactive CLI input utilities
│   ├── stacks/                     # Stack implementations (deployment patterns)
│   │   └── thanos/                 # Thanos stack (primary L2 rollup implementation)
│   │       ├── backup/             # EFS backup management operations
│   │       └── templates/          # Docker Compose templates for local deployments
│   ├── types/                      # Domain type definitions (19 files)
│   └── utils/                      # Utility functions for all operations
├── scripts/                        # Build and setup scripts
├── .gitignore                      # Git exclusions
├── .golangci.yml                   # Go linter configuration
├── AGENTS.md                       # Agent-specific documentation
├── Dockerfile                      # SDK binary build container
├── README.md                       # User setup and deployment guides
├── cli.go                          # CLI command tree definition
├── go.mod                          # Go module definition (Go 1.24.11)
├── go.sum                          # Dependency checksums
├── main.go                         # Binary entry point
├── setup.sh                        # Installation script
└── trh-sdk                         # Compiled binary (34MB)
```

## Directory Purposes

**abis/:**
- Purpose: Store Solidity contract ABIs for blockchain interaction
- Contains: JSON schema files for smart contracts
- Key files: Bridge, portal, token, and rollup contract definitions
- Auto-generated from tokamak-thanos repository during contract deployment

**commands/:**
- Purpose: Implement all user-facing CLI commands
- Contains: Action handler functions (one per command typically)
- Key files: `deploy.go`, `contracts.go`, `destroy.go`, `plugins.go`, `backup_manager.go`
- Pattern: Each returns `cli.ActionFunc` that parses flags and dispatches to ThanosStack methods

**pkg/cloud-provider/:**
- Purpose: Abstract cloud provider implementations
- Currently: Only AWS implemented (`aws.go`)
- Implements: AWS authentication, EC2/EKS operations, S3 client initialization
- Future-ready: Design allows adding GCP, Azure providers

**pkg/constants/:**
- Purpose: Define immutable configurations and enumerations
- Contains: Network definitions (localdevnet, testnet, mainnet), stack types (thanos), supported channels
- Key files: `network.go`, `stack.go`, `infra.go`, `docker_images.go`
- Usage: Validation checks, configuration defaults

**pkg/dependencies/:**
- Purpose: Verify system requirements and tool availability
- Contains: Installation checks for Docker, Kubernetes, Helm, Terraform, AWS CLI, Direnv, Git
- Key functions: `CheckDockerInstallation()`, `CheckK8sInstallation()`, `GetArchitecture()`
- Pattern: Returns boolean indicating installation status; prints check results to stdout

**pkg/logging/:**
- Purpose: Initialize structured logging for all operations
- Contains: Zap logger setup with dual output (console + JSON file)
- Key file: `zap.go` (single file, 49 lines)
- Usage: Called at start of each command to create file-based log with timestamp

**pkg/scanner/:**
- Purpose: Handle interactive CLI input from user
- Contains: Input readers for bool (y/n), string, int, float
- Key functions: `ScanBool()`, `ScanString()`, `ScanInt()`, `ScanFloat()`
- Pattern: Buffered stdin reader shared across calls to preserve input state

**pkg/stacks/:**
- Purpose: Implement deployment stack abstractions
- Contains: ThanosStack (primary), each method handles aspect of L2 deployment
- Thanos subdirectories:
  - `backup/`: EFS backup operations (snapshot, restore, configure, attach)
  - `templates/`: Docker Compose and configuration templates

**pkg/types/:**
- Purpose: Define all domain data structures
- Contains: 19 Go files with struct definitions for configuration, deployment, blockchain state
- Key types:
  - `Config`: Master deployment configuration
  - `ChainConfiguration`: L1/L2 parameters
  - `AWSConfig`, `AWSProfile`: Cloud provider config
  - `Contracts`: Smart contract addresses
  - `Account`: HD wallet account derivation
- Pattern: Structs with JSON tags for file I/O (`settings.json`, deployment exports)

**pkg/utils/:**
- Purpose: Provide reusable utilities across all packages
- Contains: 24 Go files for shell execution, file I/O, crypto, Kubernetes, Terraform
- Key functions:
  - `ExecuteCommand()`: Shell command wrapper with output capture
  - `GetAccountMap()`: BIP32/BIP39 HD wallet generation from seed phrase
  - `ReadConfigFromJSONFile()`: Load `settings.json` configuration
  - `ExecuteKubeCommand()`, `SwitchKubernetesContext()`: K8s operations
  - `ExecuteTerraform()`: Terraform execution wrapper
- Files: `command.go`, `utils.go`, `aws.go`, `docker.go`, `kubectl.go`, `terraform.go`, `crypto.go`

## Key File Locations

**Entry Points:**
- `main.go`: Binary entry point, Go version check, calls `Run()`
- `cli.go`: CLI command tree, all routes defined, calls into command handlers

**Configuration:**
- `go.mod`: Module definition, Go 1.24.11 requirement
- `flags/flags.go`: All CLI flag specifications with environment variable bindings
- `.golangci.yml`: Linter configuration

**Core Logic:**
- `pkg/stacks/thanos/thanos_stack.go`: Main ThanosStack struct definition
- `pkg/stacks/thanos/deploy_chain.go`: Deployment orchestration logic
- `pkg/stacks/thanos/destroy_chain.go`: Destruction and cleanup logic
- `pkg/types/configuration.go`: ChainConfiguration with validation logic

**Testing:**
- `pkg/stacks/thanos/deploy_chain_test.go`: Example test for deploy chain
- `pkg/utils/rds_test.go`: RDS utility tests
- `pkg/dependencies/`: Version checking tests

## Naming Conventions

**Files:**
- Snake case: `deploy_chain.go`, `backup_manager.go`, `tool_readiness.go`
- Action pattern: `commands/[action].go` (e.g., `deploy.go`, `contracts.go`)
- Test files: Parallel module name with `_test.go` suffix (e.g., `deploy_chain_test.go`)

**Directories:**
- Lowercase, multi-word with hyphens: `cloud-provider`, `op-bridge-config`
- Functional organization: `pkg/stacks/thanos/backup`, `pkg/cloud-provider/aws`

**Functions:**
- CamelCase, exported: `Deploy()`, `DeployContracts()`, `CheckDockerInstallation()`
- Unexported helpers: `deployLocalDevnet()`, `deployNetworkToAWS()`, `loginAWS()`
- Action pattern in commands: `ActionDeploy()`, `ActionDestroyInfra()`, `ActionVersion()`

**Types:**
- CamelCase struct names: `ThanosStack`, `ChainConfiguration`, `AWSConfig`, `Contracts`
- Interface-like types for abstraction: `ThanosStack` implements full deployment lifecycle
- JSON-tagged for serialization: `json:"field_name"` for file I/O

**Constants:**
- SCREAMING_SNAKE_CASE for true constants: `LocalDevnet`, `ThanosStack`, `AWS`
- Maps for enumerations: `SupportedNetworks[network]`, `SupportedStacks[stack]`

## Where to Add New Code

**New Deployment Command:**
- Implementation: `commands/[command_name].go` with `ActionCommandName()` function
- Flag definitions: Add to `flags/flags.go`
- Command registration: Add to command tree in `cli.go`
- ThanosStack logic: Add method to `pkg/stacks/thanos/thanos_stack.go`
- Types: Add to appropriate file in `pkg/types/` (create new if needed)

**New Cloud Provider (e.g., GCP):**
- Provider code: Create `pkg/cloud-provider/gcp/gcp.go`
- Auth wrapper: Implement login function matching AWS pattern
- Client initialization: Follow AWS S3Client pattern
- Type definitions: Add to `pkg/types/` (e.g., `gcp.go`)
- Integration: Update stack methods to support new provider via switch statements

**New Stack Implementation (e.g., Optimism):**
- Stack directory: Create `pkg/stacks/optimism/`
- Main file: `optimism_stack.go` with struct implementing deployment interface
- Implementation files: `deploy_chain.go`, `destroy_chain.go`, `deploy_contracts.go`
- Command routing: Add case to switch in command handlers

**Utility Functions:**
- File-based utilities: `pkg/utils/[domain].go` (e.g., `docker.go`, `terraform.go`)
- Tool checks: `pkg/dependencies/dependencies.go`
- Type definitions for utilities: Add to `pkg/types/` if needed

**Tests:**
- Unit tests: `[module]_test.go` alongside implementation
- Test location: Same package as code being tested
- Example: `pkg/utils/rds_test.go` tests RDS functions, `pkg/stacks/thanos/deploy_chain_test.go`

## Special Directories

**logs/:**
- Purpose: Store deployment and operation logs
- Generated: At runtime per command (not committed)
- Committed: No (should be in .gitignore)
- Pattern: `deploy_<stack>_<network>_<timestamp>.log`, JSON + console output

**testnet-0325/:**
- Purpose: Testnet deployment artifacts
- Generated: During `trh-sdk deploy-contracts` and `trh-sdk deploy`
- Committed: Yes (tracked in git)
- Contains: Clone of tokamak-thanos repo, deployment outputs, settings.json

**tokamak-thanos/** (when cloned locally):**
- Purpose: Source repository for smart contracts and L2 chain code
- Generated: At deployment time via git clone
- Committed: No (cloned on-demand, rebuilds for `--reuse-deployment=false`)
- Location: Determined at runtime; typically deployed directory or deployment path
- Contains: Contracts, l2-chain code, deployment scripts, Forge configs

## Configuration Flow

**Environment Variables:**
- Prefix: `TRH_SDK_` (defined in `flags/flags.go`)
- Examples: `TRH_SDK_STACK=thanos`, `TRH_SDK_NETWORK=testnet`, `TRH_SDK_ENABLE_FAULT_PROOF=true`
- Loading: Automatic via urfave/cli `Sources` mechanism

**File-Based Configuration:**
- Primary: `settings.json` in deployment directory (user-created or interactive)
- Reading: `utils.ReadConfigFromJSONFile(deploymentPath)`
- Schema: Matches `types.Config` struct with all deployment parameters
- Precedence: File values override defaults, CLI flags override file

**Runtime Generation:**
- Deployment files: Created during contract deployment (`deployment_<chainid>-deploy.json`)
- Genesis config: Generated during contract deployment for L2 genesis
- ABI files: Downloaded from tokamak-thanos repo, stored in `abis/json/`

---

*Structure analysis: 2026-03-26*
