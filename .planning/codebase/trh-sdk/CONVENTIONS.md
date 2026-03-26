# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Lowercase with underscores: `deploy_chain.go`, `backup_manager.go`, `alert_customization.go`
- Test files end with `_test.go`: `deploy_chain_test.go`, `preset_fee_token_test.go`, `rds_test.go`
- Type definition files use lowercase: `account.go`, `deployment.go`, `configuration.go`
- Grouped by function: `pkg/stacks/thanos/backup/snapshot.go`, `pkg/stacks/thanos/backup/restore.go`

**Functions:**
- PascalCase for exported functions: `Deploy()`, `CheckDockerInstallation()`, `GenerateBatchInboxAddress()`
- camelCase for unexported functions: `deployNetworkToAWS()`, `deployLocalDevnet()`, `cloneSourcecode()`
- Descriptive names with clear verb-noun structure: `ExecuteCommand()`, `InitLogger()`, `ReadPrestateHash()`
- Action-based naming for commands: `ActionDeploy()`, `ActionBackupManager()`, `ActionLogCollection()`

**Variables:**
- camelCase for local variables and function parameters: `ctx`, `inputPath`, `deploymentPath`, `l1ChainID`
- Short names for loop counters: `i`, `j`, `r`
- Compound names for grouped related vars: `l2ChainID`, `l1BeaconURL`, `createTime`
- PascalCase for struct field names: `Address`, `PrivateKey`, `DeploymentPath`, `ChainName`

**Types:**
- PascalCase for struct names: `Account`, `Deployment`, `ThanosStack`, `DeployContractsInput`
- PascalCase for interface names: `Reader`, `Writer` (standard library convention)
- Constant names in UPPERCASE: `PresetGeneral`, `FeeTokenTON`, `LocalDevnet`
- Enum-like constants grouped by purpose: See `pkg/constants/chain.go` with `Preset*`, `FeeToken*` patterns

**Constants:**
- UPPERCASE with underscores for constants: Used in `pkg/constants/` directory
- Grouped constants by feature/module: `PresetGeneral`, `PresetDeFi`, `PresetGaming`, `PresetFull` (chains.go line 6-10)
- Magic number constants extracted: `ErrorPseudoTerminalExist = "read /dev/ptmx: input/output error"` (command.go line 18)

## Code Style

**Formatting:**
- Line length: Standard Go convention (~100 lines per file average check)
- Tab indentation: 2-space indentation observed in test tables
- Brace style: Opening brace on same line (Go standard)
- Function signatures: Parameters grouped logically on single line when possible

**Linting:**
- Tool: golangci-lint (`.golangci.yml` at root)
- Enabled linters:
  - `govet` - Catches common Go mistakes
  - `unused` - Detects unused variables and functions
- Disabled linters:
  - `errcheck` - Not required (explicit error handling preferred)
  - `staticcheck` - Disabled in favor of explicit checks
- No enforced line length or complexity limits

**Import Organization:**

Order observed in `pkg/utils/utils.go`:
1. Standard library: `context`, `crypto/rand`, `errors`, `fmt`, `log`, `math/big`, `net/http`, `regexp`, `strings`, `time`
2. Third-party: `github.com/tyler-smith/go-bip32`, `github.com/ethereum/go-ethereum/*`
3. Local SDK: `github.com/tokamak-network/trh-sdk/pkg/constants`, `github.com/tokamak-network/trh-sdk/pkg/types`

**Path Aliases:**
- No path aliases used
- Full import paths: `github.com/tokamak-network/trh-sdk/pkg/constants`

## Error Handling

**Patterns:**

**Explicit Error Returns:**
```go
// From pkg/utils/utils.go line 72-74
if !bip39.IsMnemonicValid(seedPhrase) {
    return nil, errors.New("invalid mnemonic seed phrase")
}
```

**Wrapped Errors with Context:**
```go
// From pkg/utils/docker.go line 34
if err != nil {
    return nil, fmt.Errorf("failed to get docker containers: %w", err)
}
```

**Error-First Checks:**
```go
// From command.go: Check context cancellation
if ctx.Err() != nil {
    return "", ctx.Err()
}
```

**Conditional Error Handling:**
```go
// From deploy_chain.go line 32-42
if errors.Is(err, context.Canceled) {
    return nil
}
t.logger.Error("Failed to deploy the devnet", "err", err)
```

**Silent Failure Permitted for Non-Critical Operations:**
```go
// From command.go line 95
defer func() {
    _ = ptmx.Close()  // Intentional discard
}()
```

**Guidelines:**
- Always return errors explicitly, do not ignore them unless intentional
- Use `fmt.Errorf()` with `%w` verb for error wrapping
- Use `errors.Is()` for error type comparison
- Log error context via zap logger before returning
- For commands/CLI, print user-friendly messages with fmt.Printf
- In concurrent operations, handle errors in goroutines explicitly

## Logging

**Framework:** `go.uber.org/zap` (structured logging)

**Initialization:**
```go
// From pkg/logging/zap.go
func InitLogger(logPath string) (*zap.SugaredLogger, error) {
    // Dual output: console (text) + file (JSON)
}
```

**Console Output:** Text format
**File Output:** JSON format for structured parsing

**Patterns:**

**Info Level (normal operations):**
```go
// From deploy_chain.go line 121
t.logger.Info("Starting the devnet...")
t.logger.Info("✅ Devnet started successfully!")
```

**Error Level (failures):**
```go
// From deploy_chain.go line 125-126
t.logger.Error("❌ Failed to start devnet!")
t.logger.Error("Failed to deploy the devnet", "err", err)
```

**Warning Level (degraded state):**
```go
// From deploy_chain.go line 50
t.logger.Warn("Deployment canceled")
```

**Emoji Usage:**
- ✅ for success messages
- ❌ for errors
- ⚠️ for warnings
- Used in CLI output (from `pkg/dependencies/dependencies.go`)

**Log Field Format:**
- Named fields: `"err", err` or `"msg", message`
- Use SugaredLogger for named fields: `t.logger.Error("message", "key", value)`

## Comments

**When to Comment:**
- Complex algorithm explanation: Not observed (code is generally self-documenting)
- Non-obvious intent: Seen in `pkg/utils/utils.go` lines 27-29 for `CleanPasswordInput`
- Important constraints: Documented in types
- TODOs and FIXMEs: None found in codebase (suggests good code quality)

**JSDoc/GoDoc:**
- Function exports have minimal doc comments
- Package-level documentation: Present but minimal
- Parameter documentation: Implicit through type names
- Return value documentation: Implicit through type signatures

**Observed Comment Style:**
```go
// CleanPasswordInput cleans up password input by removing unwanted characters
// This function removes all whitespace characters including spaces, which is critical for
// Gmail app passwords that are displayed with spaces (e.g., "abcd efgh ijkl mnop")
// but must be used without spaces (e.g., "abcdefghijklmnop")
func CleanPasswordInput(password string) string {
```

## Function Design

**Size:**
- Functions typically 10-50 lines
- Complex operations broken into smaller helpers
- Example: `Deploy()` is 84 lines but handles top-level orchestration; sub-functions handle specifics

**Parameters:**
- Context first: `func(..., ctx context.Context, ...)`
- Logger second (when needed): `func(ctx context.Context, l *zap.SugaredLogger, ...)`
- Input structs used for multiple parameters: `*DeployInfraInput`, `*DeployContractsInput`
- Avoid boolean flags; use input structs instead

**Return Values:**
- Always return errors: `(T, error)`, `(bool, error)`, `(string, error)`
- Single value returns for simple operations: `CheckDockerInstallation() bool`
- Structs returned by pointer for large types: `(*Account, error)`
- Explicit nil checks: `if err != nil { ... }`

**Input Struct Pattern:**
```go
// From deploy_chain.go
type DeployInfraInput struct {
    ChainName          string
    L1BeaconURL        string
    GithubCredentials  *types.GithubCredentials  // optional
    MetadataInfo       *types.MetadataInfo        // optional
}
```

## Module Design

**Exports:**
- Exported functions use PascalCase: `Deploy()`, `ActionDeploy()`, `ReadPrestateHash()`
- Unexported functions use camelCase: `deployNetworkToAWS()`, `readPrestateHash()`
- Exported types in `pkg/types/`: `Account`, `Deployment`, `Config`
- Exported constants in `pkg/constants/`: `LocalDevnet`, `PresetGeneral`

**Barrel Files:**
- Not used; each file has single responsibility
- Example: `pkg/stacks/thanos/backup/` has separate files for each operation

**Package Organization:**
- `pkg/constants/` - Configuration constants and lookup tables
- `pkg/types/` - Struct definitions and data models
- `pkg/utils/` - Utility functions (command execution, helpers)
- `pkg/logging/` - Logging initialization
- `pkg/stacks/thanos/` - Implementation of Thanos stack operations
- `pkg/dependencies/` - Dependency checking and installation
- `commands/` - CLI command handlers

**Receiver Methods:**
```go
// From deploy_chain.go
func (t *ThanosStack) Deploy(ctx context.Context, infraOpt string, inputs *DeployInfraInput) error {
    // Methods on ThanosStack for orchestration
}
```

**Interface Design:**
- Minimal interfaces (none explicitly defined in codebase)
- Dependency injection via function parameters
- Logger passed as parameter, not stored globally

**Global State:**
- Avoided; one exception in `pkg/utils/tools.go`:
  - `chainListCache` and `chainListCacheTime` (encapsulated with `clearChainListCache()` helper)

---

*Convention analysis: 2026-03-26*
