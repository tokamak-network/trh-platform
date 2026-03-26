# Codebase Concerns - trh-backend

**Analysis Date:** 2026-03-26

## Security Issues

### CORS Configuration Overly Permissive

**Risk:** Allows requests from any origin
- Files: `main.go` (line 72)
- Current config: `AllowOrigins = []string{"*"}`
- Impact: Any website can make authenticated requests to this API if a user is logged in; enables CSRF attacks
- Recommendation: Configure CORS to only allow specific origins (frontend domain). Use environment variable for configuration:
  ```go
  config.AllowOrigins = []string{os.Getenv("CORS_ORIGINS")}  // e.g., "https://app.example.com"
  ```

### Credentials Passed in URLs/Logs

**Risk:** AWS credentials and private keys visible in logs
- Files: `pkg/services/thanos/integrations/*.go` (monitoring.go, cross_trade.go, bridge.go, etc.)
- Problem: Deployment configurations stored in JSON, printed to logs during errors
- Impact: Credentials leak into log files; if logs are exposed, AWS accounts are compromised
- Recommendation:
  - Implement credential masking in logging (redact secret keys before logging)
  - Store sensitive config in sealed/encrypted format
  - Use structured logging with separate secret fields marked as `[REDACTED]`

### Secrets in Dockerfile

**Risk:** Hardcoded paths and tool versions could expose information
- Files: `Dockerfile` (lines 40-77)
- Problem: Installs multiple tools (Foundry, Node.js) from public sources with fixed versions; no checksum verification
- Impact: Supply chain risk; if CDN is compromised, malicious binaries could be installed
- Recommendation:
  - Pin installation scripts to specific releases with SHA256 checksums
  - Use official package managers where possible instead of curl piping to bash
  - Consider pre-built base images with tools baked in

## Tech Debt

### Hardcoded TON Token Support Only

**Issue:** Only TON token is supported, others are stubs
- Files: `pkg/stacks/thanos/thanos_stack.go` (lines 153, 274, 283)
- Problem: Comments indicate TON-only implementation; multi-token support is incomplete
- Impact: Cannot deploy chains with other tokens; limits platform flexibility
- Fix approach: Implement full token abstraction layer with configurable token strategies; add tests for multiple token types

### Incomplete GetUsers Endpoint

**Issue:** Auth endpoint is not implemented
- Files: `pkg/api/handlers/auth.go` (lines 113-117)
- Problem: Returns placeholder message "to be implemented"; no actual user retrieval logic
- Impact: Admin cannot list users; blocks user management features
- Fix approach: Implement service method in `AuthService` to fetch paginated users from repository

### Nil Check After Status Check

**Issue:** Unreachable nil check in stack lifecycle
- Files: `pkg/services/thanos/integrations/monitoring.go` (lines 107-121)
- Problem: Checks `stack.Status != StackStatusDeployed` then later checks `if stack == nil` after already dereferencing `stack`
- Impact: Confusing code; nil check is never reached since stack is already used
- Fix approach: Move nil check to line 107, before status check

### Ignored Error in Integration Creation

**Issue:** Error from preset service not propagated
- Files: `pkg/services/thanos/stack_lifecycle.go` (lines 106-108)
- Problem: `presetSvc.GetByID()` error logged but execution continues; integration creation skipped silently
- Impact: User doesn't know preset wasn't applied; can cause mismatched deployments
- Fix approach: Return error to caller or use warning log level with clear messaging; consider failing the deployment if preset is invalid

## Error Handling Issues

### Generic Error Messages Hiding Actual Errors

**Issue:** Many handlers return "internal server error" without logging cause
- Files: `pkg/api/handlers/thanos/deployment.go`, `pkg/services/configuration/*.go`
- Pattern: `logger.Error(...)` then return generic message to client
- Impact: Debugging is harder; clients don't know what failed
- Recommendation: Create error response wrapper that logs full error internally but returns generic message to client (for security); never expose stack traces or detailed errors to API consumers

### Missing Error Wrapping

**Issue:** Errors not wrapped with context
- Files: `pkg/services/thanos/stack_lifecycle.go` (lines 27, 46, 65)
- Problem: `return nil, err` without wrapping; loses context about where error occurred
- Impact: Root cause analysis difficult; can't trace which operation failed
- Fix approach: Use `fmt.Errorf("failed to marshal config: %w", err)` throughout service layer

### Unchecked Type Assertions

**Issue:** Type assertion on context values without validation
- Files: `pkg/api/handlers/auth.go` (line 78)
- Problem: `userIDStr.(string)` assumes type but doesn't check; panics if wrong type in context
- Impact: Server crashes if middleware sets wrong type
- Fix approach: Use safe type assertion with ok check:
  ```go
  userIDStr, ok := c.Get("user_id")
  if !ok {
      c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
      return
  }
  userID, err := uuid.Parse(userIDStr.(string))
  ```

## Performance & Scaling Issues

### Large Integration Files with Deep Nesting

**Issue:** Single integration files exceed 1300+ lines
- Files: `pkg/services/thanos/integrations/monitoring.go` (1382 lines)
- Problem: Mixed installation, uninstallation, task management, logging in one file; difficult to test and modify
- Impact: Cognitive overload; high risk when making changes; slow to navigate
- Fix approach:
  - Split into: `install.go`, `uninstall.go`, `cancel.go` packages
  - Extract task logic to separate concern
  - Create integration base class with common patterns

### Unbuffered Task Queue Drops Tasks

**Issue:** Task queue is full, tasks silently dropped
- Files: `pkg/taskmanager/task_manager.go` (lines 158-161)
- Problem: Channel buffer is 100 tasks; if queue fills, new tasks are dropped with warning log
- Impact: Long deployments may silently fail; user never knows task was dropped
- Fix approach:
  - Either increase queue buffer based on expected concurrency
  - Or block on full queue and add timeout to prevent hanging
  - Or return error to caller when queue is full

### No Connection Pool Lifecycle Management

**Issue:** Database connection pool not closed on shutdown
- Files: `main.go` (lines 97-107)
- Problem: Server shutdown doesn't close database connections gracefully
- Impact: Connections may not flush; data inconsistency possible; server hangs on shutdown
- Fix approach:
  ```go
  if err := server.Stop(); err != nil {
      logger.Error("Failed to stop deployments", zap.Error(err))
  }
  if sqlDB, err := postgresDB.DB(); err == nil {
      sqlDB.Close()
  }
  ```

## Fragile Areas

### Task Manager Context Usage

**Fragility:** Task contexts created with `context.Background()`
- Files: `pkg/taskmanager/task_manager.go` (lines 145, 171)
- Why fragile: `Background()` contexts don't inherit parent cancellation; if server shuts down, long-running tasks continue indefinitely
- Unsafe modifications: Don't assume task context auto-cancels on shutdown
- Safe approach: Reuse TaskManager's parent context as base:
  ```go
  ctx, cancel := context.WithCancel(tm.ctx)  // Inherit from manager context
  ```
- Test coverage: No integration tests for task cancellation on server shutdown

### Integration Status Transitions

**Fragility:** Integration status transitions have complex preconditions
- Files: `pkg/services/thanos/integrations/monitoring.go` (lines 147-164)
- Why fragile: Multiple status checks (AwaitingConfig, Pending, InProgress); logic branches based on count and individual statuses
- Unsafe modifications: Adding new status types requires checking all transition points; easy to create unreachable states
- Safe approach: Use state machine pattern; validate all transitions at one point
- Test coverage: Limited unit tests for status transitions; mostly integration tested only

### File Path Handling Without Validation

**Fragility:** Log paths created from user-provided stack ID without sanitization
- Files: `pkg/services/thanos/integrations/monitoring.go` (line 134), all integration files
- Why fragile: Path traversal vulnerability if stack ID contains `../`; can write logs anywhere
- Unsafe modifications: Don't append stack IDs directly to paths
- Safe approach: Validate stack ID format; use filepath.Join and ensure result is within expected directory:
  ```go
  if !filepath.HasPrefix(absPath, baseLogsDir) {
      return errors.New("path traversal detected")
  }
  ```
- Test coverage: No security tests for path traversal

## Concurrency Issues

### Race Condition in Integration Status Updates

**Issue:** Integration status updated without locking
- Files: `pkg/services/thanos/integrations/monitoring.go` (lines 246, 279, 417)
- Problem: Multiple goroutines may update same integration status; no synchronization
- Impact: Race condition causes lost updates; deployment status becomes inconsistent
- Fix approach: Implement optimistic locking with version numbers or use database transactions with proper isolation level

### Task Manager Progress Updates Not Atomic

**Issue:** TaskProgress fields updated in sequence without locks held
- Files: `pkg/taskmanager/task_manager.go` (lines 225-235)
- Problem: Multiple fields (Status, Percentage, Message) updated separately; reader could see partial state
- Impact: Clients see inconsistent progress (e.g., status "failed" with 50% progress)
- Fix approach: Use struct-level locking or atomic fields:
  ```go
  tm.progressMu.Lock()
  p.Status = status
  p.Percentage = pct
  p.Message = msg
  p.UpdatedAt = time.Now().Format(time.RFC3339)
  tm.progressMu.Unlock()
  ```

### Goroutine Leaks on Context Cancellation

**Issue:** Ingest goroutines not fully cancelled on context cancellation
- Files: `pkg/services/thanos/integrations/cross_trade.go` (lines 289-290, 412-413)
- Problem: Creates child context from task context; if parent cancels, child cancellation may not propagate to all goroutines
- Impact: Leaked goroutines accumulate; memory leak over time
- Fix approach: Ensure all spawned goroutines check context.Done() in their loops; add sync.WaitGroup tracking

## Dependencies at Risk

### go-ethereum Vulnerability Surface

**Risk:** Large Ethereum library with many transitive dependencies
- Package: `github.com/ethereum/go-ethereum v1.15.2` (go.mod line 6)
- Risk: Ethereum library has complex cryptography; potential bugs in signature verification
- Impact: Could compromise key derivation or transaction signing
- Monitoring: Subscribe to Ethereum Go security advisories; run `go mod graph` to audit transitive deps

### AWS SDK Unused but Included

**Risk:** AWS SDK v2 dependencies in go.mod but not directly imported
- Packages: `github.com/aws/aws-sdk-go-v2/*` (go.mod lines 33-57)
- Risk: Bloats binary; increases attack surface; may be outdated indirect dependencies
- Impact: ~4MB added to final Docker image
- Fix approach: Run `go mod tidy` to remove unused; explicitly require only AWS services actually used in code

## Missing Critical Features

### No Rate Limiting

**Problem:** No API rate limiting configured
- Files: `pkg/api/routes/route.go`, `pkg/api/servers/server.go`
- Impact: Vulnerable to DDoS; malicious actors can spam API causing resource exhaustion
- Solution: Implement per-IP rate limiter using middleware (e.g., `gin-contrib/rate_limiter`)

### No Request Logging/Auditing

**Problem:** HTTP requests not logged for audit trail
- Files: `pkg/api/middleware/`
- Impact: Cannot track who performed what actions; compliance failure
- Solution: Add middleware that logs request (without sensitive data), response codes, execution time

### No Input Validation for File Paths

**Problem:** Deployment paths and log paths not validated
- Files: `pkg/services/thanos/stack_lifecycle.go` (line 25)
- Impact: Path traversal vulnerability; can create files outside expected directory
- Solution: Validate paths against allowlist; ensure no `../` or absolute paths

## Test Coverage Gaps

### Integration Tests Missing

**Untested area:** Full deployment lifecycle not tested end-to-end
- Files: `pkg/services/thanos/`, integration service files
- Risk: Deployment failures not caught until production
- Priority: High
- Approach: Add integration tests with test database that exercise full stack creation → monitoring install → uninstall flow

### Nil Pointer Dereference Not Guarded

**Untested area:** Insufficient null checks before dereferencing pointers
- Files: `pkg/services/thanos/integrations/monitoring.go` (line 115, checks stack after using it)
- Risk: Panics in production
- Priority: High
- Approach: Add static analysis (`go vet`) to CI; review all pointer dereferences

### Context Cancellation Handling

**Untested area:** Behavior when contexts are cancelled during execution
- Files: `pkg/taskmanager/task_manager.go`, all integration service task functions
- Risk: Zombie tasks, goroutine leaks
- Priority: Medium
- Approach: Add tests that cancel contexts at various stages and verify cleanup

---

*Concerns audit: 2026-03-26*
