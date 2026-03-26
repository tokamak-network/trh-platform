# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Go built-in `testing` package (standard library)
- No external test runner (uses `go test` command)
- Config: None required (uses Go's standard conventions)

**Assertion Library:**
- Standard library `testing.T` methods
- `github.com/stretchr/testify/require` for assertions (used in `pkg/utils/tools_test.go`)
- Manual assertions with `t.Errorf()`, `t.Fatalf()`

**Run Commands:**
```bash
go test ./...                      # Run all tests
go test ./... -v                   # Verbose mode
go test ./... -run TestName        # Run specific test
go test ./... -race                # Detect race conditions
go test ./... -cover               # Show coverage
go test ./... -count=1             # Disable cache (run exactly once)
```

## Test File Organization

**Location:**
- Co-located with implementation: `foo.go` and `foo_test.go` in same directory
- Examples:
  - `pkg/utils/rds.go` → `pkg/utils/rds_test.go`
  - `pkg/utils/tools.go` → `pkg/utils/tools_test.go`
  - `pkg/stacks/thanos/deploy_chain.go` → `pkg/stacks/thanos/deploy_chain_test.go`

**Naming:**
- Pattern: `*_test.go`
- Package name includes `_test` suffix for separate test packages (rarely used)
- Most tests in same package: `package utils`, `package thanos`

**Structure:**
```
pkg/
├── utils/
│   ├── utils.go
│   ├── rds.go              # Implementation
│   ├── rds_test.go         # Tests for rds.go
│   ├── tools.go
│   └── tools_test.go       # Tests for tools.go
├── stacks/thanos/
│   ├── deploy_chain.go
│   └── deploy_chain_test.go
```

## Test Structure

**Suite Organization:**

From `pkg/utils/rds_test.go`:
```go
package utils

import (
	"strings"
	"testing"
)

func TestIsValidRDSPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		want     bool
	}{
		// Test cases...
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			// Assertion...
		})
	}
}
```

**Patterns:**

**Table-Driven Tests:**
- Every test uses table-driven approach with `t.Run()`
- Test case struct: `name`, expected value(s), and input parameters
- Example from `rds_test.go` line 8-149: 25 test cases covering valid/invalid passwords

**Test Setup Pattern:**
- Minimal setup: Most tests are pure functions
- Temporary files: Use `t.TempDir()` for file-based tests
  - Example: `pkg/stacks/thanos/deploy_chain_test.go` line 16-21
- Cleanup: Automatic via `t.TempDir()` or `defer` statements

**Teardown Pattern:**
- Rare explicit teardown
- Deferred cleanup for HTTP test servers:
  ```go
  // From tools_test.go line 31-35
  ts := httptest.NewServer(...)
  defer ts.Close()
  ```
- Cache clearing via helper functions:
  ```go
  // From tools_test.go line 40-44
  defer func() {
      chainListURL = originalURL
      clearChainListCache()
  }()
  ```

**Assertion Pattern:**
- `t.Run()` wraps each test case
- Assertions use `t.Errorf()` or `t.Fatalf()`
- Example from `preset_fee_token_test.go` line 49-50:
  ```go
  if tpl.NativeTokenName != tc.wantName {
      t.Errorf("NativeTokenName: got %q, want %q", tpl.NativeTokenName, tc.wantName)
  }
  ```
- Require assertions from testify:
  ```go
  // From tools_test.go line 10
  "github.com/stretchr/testify/require"
  // Usage: require.NoError(t, err)
  ```

## Mocking

**Framework:** `net/http/httptest` (standard library)

**Patterns:**

**HTTP Server Mocking:**
```go
// From tools_test.go line 74-78
ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write(jsonData)
}))
defer ts.Close()
```

**URL Injection:**
```go
// From tools_test.go line 38-39
originalURL := chainListURL
chainListURL = ts.URL
```

**Global State Restoration:**
```go
// From tools_test.go line 41-44
defer func() {
    chainListURL = originalURL
    clearChainListCache()
}()
```

**What to Mock:**
- External HTTP APIs: Chain list service, metadata registries
- File system operations: Use `t.TempDir()` for isolation
- Networking: Mock with httptest
- Time-dependent operations: Not observed in codebase

**What NOT to Mock:**
- Core business logic: Test real functions
- Type conversions: Test actual behavior
- Validation logic: Test with real validators
- Database operations: Not mocked (separate layer)

## Fixtures and Factories

**Test Data:**

**From preset_fee_token_test.go:**
```go
// Helper factory function
func makeTestInput(preset, feeToken string) *DeployContractsInput {
    return &DeployContractsInput{
        L1RPCurl: "http://localhost:8545",
        ChainConfiguration: &types.ChainConfiguration{
            L2BlockTime:              2,
            L1BlockTime:              12,
            BatchSubmissionFrequency: 1440,
            ChallengePeriod:          12,
            OutputRootFrequency:      240,
        },
        Preset:   preset,
        FeeToken: feeToken,
    }
}
```

**From deploy_chain_test.go:**
```go
// Inline fixture creation
proxyAddr := "0x4200000000000000000000000000000000000060"
adminSlot := "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
genesis := map[string]interface{}{
    "config": map[string]interface{}{
        "chainId": 12345,
    },
    "alloc": map[string]interface{}{
        proxyAddr: map[string]interface{}{
            "code":    "0x608060405234801561001057600080fd5b50",
            "balance": "0x0",
            "storage": map[string]string{
                adminSlot: proxyAdminAddr,
            },
        },
    },
}
```

**Location:**
- Inline in test functions (preferred for clarity)
- Helper factory functions in same file: `makeTestInput()`, `allocKeys()`
- No separate fixtures directory
- Constants from `pkg/constants/` imported directly

## Coverage

**Requirements:** Not enforced

**View Coverage:**
```bash
go test ./... -cover                 # Basic coverage percentage
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out     # View in browser
```

**Observed Coverage:**
- 3 test files found: `rds_test.go`, `tools_test.go`, `deploy_chain_test.go`, `preset_fee_token_test.go`, `drb_genesis_test.go`
- Coverage gaps identified (see CONCERNS.md) but no enforcement visible

## Test Types

**Unit Tests:**
- **Scope:** Single function/method validation
- **Approach:** Pure functions, table-driven tests
- **Examples:**
  - `TestIsValidRDSPassword()` - Input validation (25 cases)
  - `TestReadPrestateHash()` - File parsing (4 cases)
  - `TestPredeployToCodeNamespace()` - Address transformation (4 cases)

**Integration Tests:**
- **Scope:** Multi-function workflows, interaction between modules
- **Approach:** Setup temporary environment, test full flow
- **Examples:**
  - `TestPatchGenesisWithDRB()` - File creation + patching + verification
  - `TestCheckChainIDUsage()` - HTTP mock + cache + lookup
  - `TestInitDeployConfigTemplate_FeeTokenMapping()` - Config generation + field validation

**E2E Tests:**
- **Framework:** Not used (Docker-based E2E would be in separate suite)
- **Rationale:** Go test framework best for unit/integration; full deployment testing requires Docker/Kubernetes

## Common Patterns

**Async Testing:**
```go
// Goroutines tested indirectly
// Example: ExecuteCommandStream() spawns goroutines with WaitGroup
// Tests validate output, not goroutines directly
```

**Error Testing:**

**Expected Error Pattern:**
```go
// From deploy_chain_test.go line 74-80
err := stack.deployNetworkToAWS(context.Background(), &DeployInfraInput{ChainName: "test"})
if err == nil {
    t.Fatal("expected error when fault proof enabled without challenger key")
}
if !strings.Contains(err.Error(), "challenger private key is not set") {
    t.Errorf("unexpected error message: %v", err)
}
```

**Expected Success Pattern:**
```go
// From deploy_chain_test.go line 24-28
hash, err := readPrestateHash(path)
if err != nil {
    t.Fatalf("unexpected error: %v", err)
}
if hash != "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123" {
    t.Errorf("got %q, want expected hash", hash)
}
```

**File I/O Testing:**
```go
// From drb_genesis_test.go line 81-84
tmpDir := t.TempDir()
genesisPath := filepath.Join(tmpDir, "genesis.json")
if err := os.WriteFile(genesisPath, genesisJSON, 0644); err != nil {
    t.Fatal(err)
}
```

**JSON Unmarshaling Testing:**
```go
// From preset_fee_token_test.go line 68-76
var unmarshalled map[string]interface{}
if err := json.Unmarshal(data, &unmarshalled); err != nil {
    t.Fatal(err)
}
// Verify fields...
```

## Test Naming

**Convention:** `Test[FunctionName][Scenario]`

Examples:
- `TestIsValidRDSPassword` - Base function test
- `TestReadPrestateHash` - With nested `t.Run()` for scenarios:
  - "valid prestate json"
  - "missing file"
  - "empty pre field"
  - "invalid json"
- `TestDeployNetworkToAWSFaultProofValidation` - Specific behavior
- `TestInitDeployConfigTemplate_FeeTokenMapping` - Feature-specific

## Test Execution

**Command Reference:**
```bash
# Run all tests
go test ./...

# Run with verbose output
go test ./... -v

# Run specific package
go test ./pkg/utils

# Run specific test
go test ./pkg/utils -run TestIsValidRDSPassword

# Coverage report
go test ./... -cover
go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out

# Race condition detection
go test ./... -race
```

**CI/CD:** Not observed in codebase (would be in `.github/workflows/`)

---

*Testing analysis: 2026-03-26*
