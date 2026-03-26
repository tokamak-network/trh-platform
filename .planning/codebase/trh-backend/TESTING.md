# Testing Patterns - TRH Backend

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Go standard testing package (no external test runner)
- Version: Go 1.24.11
- Command: `go test ./...`

**Test execution:**
- Tests disabled in golangci-lint configuration: `tests: false`
- Test files excluded from certain linters (gocyclo, errcheck, dupl, gosec in `.golangci.yml`)

**Test discovery:**
- Files ending in `_test.go` are recognized as test files
- Only one test file currently exists: `pkg/api/handlers/thanos/presets_test.go`

## Test File Organization

**Location:**
- Co-located with source code, same package or test-specific package
- Pattern: `pkg/api/handlers/thanos/presets_test.go` for `pkg/api/handlers/thanos/presets.go`

**Naming:**
- Test files: `{module}_test.go`
- Test functions: `Test{FunctionName}_{Scenario}` (e.g., `TestListPresets_Returns200WithFourPresets`)
- Subtests: `t.Run(name, func(t *testing.T) { ... })`

**Package organization:**
- Test-specific package: `thanos_test` (not `thanos`)
- Isolates test code from main package
- Allows access to exported symbols only

## Test Structure

**Setup pattern:**
```go
package thanos_test

import (
    "testing"
    "github.com/gin-gonic/gin"
    thanosHandler "github.com/tokamak-network/trh-backend/pkg/api/handlers/thanos"
)

func init() {
    gin.SetMode(gin.TestMode)
}

func newTestHandler() *thanosHandler.ThanosDeploymentHandler {
    return &thanosHandler.ThanosDeploymentHandler{}
}

func TestListPresets_Returns200WithFourPresets(t *testing.T) {
    // Test body
}
```

**HTTP testing pattern:**
```go
func TestListPresets_Returns200WithFourPresets(t *testing.T) {
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)
    c.Request, _ = http.NewRequest(http.MethodGet, "/presets", nil)

    h := newTestHandler()
    h.ListPresets(c)

    if w.Code != http.StatusOK {
        t.Fatalf("expected status 200, got %d", w.Code)
    }
}
```

**Response unmarshaling pattern:**
```go
var resp map[string]any
if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
    t.Fatalf("failed to decode response: %v", err)
}

data, ok := resp["data"].([]any)
if !ok {
    t.Fatalf("expected data to be an array, got %T", resp["data"])
}
```

## Test Patterns in Use

**Pattern - Subtests with table-driven approach:**
```go
func TestGetPresetByID_KnownID_Returns200(t *testing.T) {
    ids := []string{"general", "defi", "gaming", "full"}

    for _, id := range ids {
        t.Run(id, func(t *testing.T) {
            w := httptest.NewRecorder()
            c, _ := gin.CreateTestContext(w)
            c.Request, _ = http.NewRequest(http.MethodGet, "/presets/"+id, nil)
            c.Params = gin.Params{{Key: "presetId", Value: id}}

            h := newTestHandler()
            h.GetPresetByID(c)

            if w.Code != http.StatusOK {
                t.Errorf("expected 200 for preset %q, got %d", id, w.Code)
            }
        })
    }
}
```

**Pattern - HTTP test context setup:**
```go
w := httptest.NewRecorder()
c, _ := gin.CreateTestContext(w)
c.Request, _ = http.NewRequest(http.MethodGet, "/presets", nil)
// For path parameters:
c.Params = gin.Params{{Key: "presetId", Value: "general"}}
```

**Pattern - Error case testing:**
```go
func TestGetPresetByID_UnknownID_Returns404(t *testing.T) {
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)
    c.Request, _ = http.NewRequest(http.MethodGet, "/presets/unknown", nil)
    c.Params = gin.Params{{Key: "presetId", Value: "unknown"}}

    h := newTestHandler()
    h.GetPresetByID(c)

    if w.Code != http.StatusNotFound {
        t.Errorf("expected 404 for unknown preset, got %d", w.Code)
    }
}
```

**Pattern - Edge case testing:**
```go
func TestGetPresetByID_EmptyID_Returns404(t *testing.T) {
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)
    c.Request, _ = http.NewRequest(http.MethodGet, "/presets/", nil)
    c.Params = gin.Params{{Key: "presetId", Value: ""}}

    h := newTestHandler()
    h.GetPresetByID(c)

    if w.Code != http.StatusNotFound {
        t.Errorf("expected 404 for empty preset ID, got %d", w.Code)
    }
}
```

## Assertion Pattern

**Style:** Traditional Go testing without assertion libraries

**Pattern:**
```go
// Fatal-level assertions (stop on failure)
if w.Code != http.StatusOK {
    t.Fatalf("expected status 200, got %d", w.Code)
}

// Error-level assertions (log but continue)
if len(data) != 4 {
    t.Errorf("expected 4 presets in response, got %d", len(data))
}

// Type assertion with ok check
data, ok := resp["data"].([]any)
if !ok {
    t.Fatalf("expected data to be an array, got %T", resp["data"])
}
```

## Field Validation Testing

**Pattern - Testing required fields in response:**
```go
func TestListPresets_ResponseContainsRequiredFields(t *testing.T) {
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)
    c.Request, _ = http.NewRequest(http.MethodGet, "/presets", nil)

    h := newTestHandler()
    h.ListPresets(c)

    var resp map[string]any
    json.Unmarshal(w.Body.Bytes(), &resp)
    data := resp["data"].([]any)

    for _, item := range data {
        preset := item.(map[string]any)
        for _, field := range []string{"ID", "Name", "Description", "Modules", "ChainDefaults"} {
            if _, ok := preset[field]; !ok {
                t.Errorf("preset missing field %q: %v", field, preset)
            }
        }
    }
}
```

## Mocking

**Current approach:** Minimal mocking observed

**Pattern - Testing without external dependencies:**
```go
func newTestHandler() *thanosHandler.ThanosDeploymentHandler {
    // ListPresets and GetPresetByID do not use ThanosDeploymentService,
    // so a zero-value handler is sufficient.
    return &thanosHandler.ThanosDeploymentHandler{}
}
```

**What to Mock (guidance for future tests):**
- Database connections (use in-memory database or test doubles)
- External service calls (AWS, blockchain RPCs)
- File I/O operations
- HTTP calls to external APIs

**What NOT to Mock:**
- Gin framework components (use httptest + gin.CreateTestContext)
- Standard library functions
- Own business logic (test the logic, not around it)

## Test File Locations

**Source location:** `pkg/api/handlers/thanos/presets_test.go`

**Current coverage:**
- Handler tests only (no service or repository tests found)
- HTTP layer tested at integration level (handlers with real response bodies)

**Expected future test locations:**
- Services: `pkg/services/{service}_test.go`
- Repositories: `pkg/infrastructure/postgres/repositories/{entity}_test.go`
- DTOs: `pkg/api/dtos/{entity}_test.go`
- Middleware: `pkg/api/middleware/{middleware}_test.go`
- Utils: `internal/{package}/{file}_test.go`

## Test Coverage

**Current status:** No test coverage enforced

**Recommendations:**
- Consider using `go test -cover ./...` to measure coverage
- Target minimum coverage for critical paths: auth, database operations, validation

**Coverage gaps identified:**
- No service layer tests
- No repository tests
- No middleware tests
- No DTO validation tests
- No error handling tests
- Integration tests absent

## Running Tests

**All tests:**
```bash
go test ./...
```

**Specific package:**
```bash
go test ./pkg/api/handlers/thanos
```

**Specific test:**
```bash
go test -run TestListPresets_Returns200WithFourPresets ./pkg/api/handlers/thanos
```

**Verbose output:**
```bash
go test -v ./...
```

**With coverage:**
```bash
go test -cover ./...
```

## Test Data & Fixtures

**Current approach:** Hardcoded test data in tests

**Pattern - Known IDs testing:**
```go
ids := []string{"general", "defi", "gaming", "full"}

for _, id := range ids {
    t.Run(id, func(t *testing.T) {
        // Test each preset ID
    })
}
```

**Recommendations for fixtures:**
- Create `testdata/` directories with JSON fixtures
- Use `testdata` package in tests for loading sample data
- Consider factory pattern for creating test entities:
  ```go
  func newTestUser() *schemas.User {
      return &schemas.User{
          ID:    uuid.New(),
          Email: "test@example.com",
          Role:  entities.UserRoleUser,
      }
  }
  ```

## Package-Level Test Setup

**Init function for Gin test mode:**
```go
func init() {
    gin.SetMode(gin.TestMode)
}
```

**Use of helper functions:**
```go
func newTestHandler() *thanosHandler.ThanosDeploymentHandler {
    // Centralized handler creation for tests
}
```

## Linting Exemptions

**From `.golangci.yml`:**
- Test files excluded from: gocyclo, errcheck, dupl, gosec
- Allows more lenient code in tests (longer functions, unchecked errors)

## Testing Best Practices (Not Yet Applied)

**For future test implementation:**

1. **Test isolation:** Each test should be independent
2. **Clean up:** Use `defer` for cleanup operations
3. **Descriptive names:** Test names should describe what's being tested and the expected outcome
4. **Single responsibility:** Test one behavior per test function
5. **No test interdependencies:** Tests should not depend on running in specific order
6. **Use t.Helper():** For helper functions to improve error reporting
7. **Table-driven tests:** Already partially used (see `TestGetPresetByID_KnownID_Returns200`)

---

*Testing analysis: 2026-03-26*
