# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

**Untyped HTTP Response Handling:**
- Issue: Using `any` type for container state and health checks
- Files: `src/main/docker.ts` (lines 307-308)
- Impact: Type safety lost when parsing Docker Compose output; potential crashes if output format changes
- Fix approach: Create strict `DockerContainer` interface with `State` and `Health` properties, parse JSON with full type validation

**Environment Variable Reliance Without Validation:**
- Issue: `process.env` accessed directly throughout codebase without null checks
- Files: `src/main/docker.ts`, `src/main/aws-auth.ts`, `src/main/index.ts`
- Impact: Silent fallbacks that may mask configuration errors; PATH extended without defaults
- Fix approach: Create `Config` class with validated getters that throw on missing critical vars; validate on app startup

**Loose Error Type Assertions:**
- Issue: Casting errors to `any` to attach custom properties
- Files: `src/main/docker.ts` (lines 568-569): `(err as any).errorType = errorType;`
- Impact: Loss of type safety; custom properties not part of formal contract
- Fix approach: Create custom error classes (`DockerError`, `ConfigError`) extending Error with proper type fields

**Hardcoded Ports and URLs:**
- Issue: Magic numbers and strings scattered across files
- Files: `src/main/docker.ts` (REQUIRED_PORTS = [3000, 5433, 8000]), `src/main/index.ts` (UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000), `src/main/webview.ts` (PLATFORM_UI_URL)
- Impact: Difficult to configure for different deployments; duplicated values increase maintenance cost
- Fix approach: Centralize all constants in `src/main/config.ts` with environment override support

## Known Bugs

**Port Number Mismatch in Docker Port Check:**
- Symptoms: Backend health check may miss correct port when database is on non-standard port
- Files: `src/main/docker.ts` (line 13): `REQUIRED_PORTS = [3000, 5433, 8000]` but docker-compose.yml shows 5432
- Trigger: Running PostgreSQL on standard port 5432 instead of 5433
- Workaround: Verify REQUIRED_PORTS constant matches docker-compose.yml port configuration

**Weak Certificate Validation on WebView:**
- Symptoms: Self-signed certificates accepted on localhost WebView without proper domain verification
- Files: `src/main/webview.ts` (lines 77-87): Certificate bypass only checks `hostname` string
- Trigger: Any localhost or 127.0.0.1 URL bypasses certificate checks
- Potential Issue: Person-in-the-middle attacks possible if hostname validation is compromised
- Fix approach: Use stricter hostname comparison; validate certificate chain for production

**Race Condition in Image Update Check:**
- Symptoms: Update available flag may not be properly synced between checker and main window
- Files: `src/main/index.ts` (lines 305-347): `updateAvailable` state checked and modified across multiple async callbacks
- Trigger: Update check completes while Docker operation is in progress
- Fix approach: Use EventEmitter pattern for state management instead of boolean flag

## Security Considerations

**Private Key Injection into WebView:**
- Risk: Private keys are serialized into WebView via executeJavaScript, accessible to any JS code in web frontend
- Files: `src/main/webview.ts` (lines 188-230): `injectKeystoreAccounts()` sends private keys to injected variable
- Current mitigation: Keys only injected into localhost:3000 (owned by team), network guard blocks external requests
- Recommendations:
  1. Only pass public addresses, never private keys to WebView
  2. Create IPC endpoints for signing operations instead of exposing keys
  3. Add explicit audit logging for key access
  4. Consider hardware wallet integration to eliminate key storage entirely

**Admin Credentials Passed in Plain Memory:**
- Risk: Admin email/password stored in module-level variable accessible from multiple functions
- Files: `src/main/webview.ts` (line 22): `adminCredentials` global, `src/main/index.ts` (line 416-417): stored without encryption
- Current mitigation: Only stored temporarily, cleared on app restart
- Recommendations:
  1. Use `safeStorage` (already available in keystore.ts) to encrypt credentials at rest
  2. Add timeout to auto-clear credentials after use
  3. Mark credential variables with JSDoc comments warning about sensitive data

**AWS Credentials Held in Memory:**
- Risk: Access tokens and session credentials kept in memory indefinitely
- Files: `src/main/aws-auth.ts` (lines 50, 53-54): `currentCredentials`, `ssoAccessToken`, `ssoRegion` held in module scope
- Current mitigation: Credentials cleared on logout; session tokens expire
- Recommendations:
  1. Implement credential rotation before expiration
  2. Clear credentials aggressively on any auth error
  3. Use OS keychain for persistent storage (safeStorage available)
  4. Add warning logs when credentials approach expiration

**Network Guard Whitelist Bypass Risk:**
- Risk: Dynamic hosts added via `addAllowedHost()` persist for session, no audit trail
- Files: `src/main/network-guard.ts` (lines 44-46): Set-based whitelist with no history/validation
- Current mitigation: Only called from controlled code paths
- Recommendations:
  1. Add audit logging for all host additions
  2. Require explicit approval/validation before adding hosts
  3. Implement TTL for dynamic hosts (auto-expire)
  4. Add UI notification when new hosts are allowed

**Electron Context Isolation Partially Disabled:**
- Risk: WebView has `sandbox: false` to support preload script execution
- Files: `src/main/webview.ts` (line 67): `sandbox: false` comment indicates necessary compromise
- Current mitigation: Preload script is loaded from trusted local path
- Recommendations:
  1. Audit preload script thoroughly for injection vectors
  2. Use strict Content Security Policy in webview
  3. Consider using Electron's contextBridge for safer IPC instead of direct preload

**Install Script Downloads Without Signature Verification:**
- Risk: Homebrew and curl-based installations trust redirect chains without verification
- Files: `install.sh` (lines 102, 130, 177, 190, 225, 244): Multiple curl invocations without checksum validation
- Current mitigation: Only runs on user machines, not in production
- Recommendations:
  1. Add SHA256 checksum verification for critical downloads
  2. Use official package managers (brew, apt) where possible
  3. Pin tool versions explicitly instead of accepting latest

## Performance Bottlenecks

**Docker Status Check on Every IPC Call:**
- Problem: `getDockerStatus()` spawns Docker compose process every time health checked
- Files: `src/main/docker.ts` (lines 278-320), called from `src/main/index.ts` multiple handlers
- Cause: No caching between checks; spawning subprocess is expensive
- Improvement path:
  1. Implement 1-second cache for status results
  2. Use Docker events API instead of polling for production
  3. Background status refresh (3s interval) instead of on-demand

**Image Digest Lookup During Every Update Check:**
- Problem: Calls `docker image inspect` for each image sequentially
- Files: `src/main/docker.ts` (lines 423-434): Promise.all would parallelize but sequential inspect calls
- Cause: Looping through UPDATE_IMAGES array with individual execPromise calls
- Improvement path:
  1. Cache digest results from previous pull
  2. Use `docker image ls` once and parse output (single subprocess)
  3. Skip check entirely if pull returned exit code 0

**Synchronous File System Operations in Main Thread:**
- Problem: `fs.readFileSync()`, `fs.writeFileSync()` block Electron main thread
- Files: `src/main/keystore.ts` (lines 60, 70, 140), `src/main/aws-auth.ts` (line 109)
- Cause: File I/O on main thread delays UI responsiveness
- Improvement path:
  1. Convert to async/await with fs.promises
  2. Move large file operations to worker thread
  3. Add async wrapper functions for backward compatibility

**Regex Parsing for Docker Compose Output:**
- Problem: Line-by-line regex matching for YAML parsing; fragile and slow
- Files: `src/main/docker.ts` (lines 322-345): Manual string parsing for service images
- Cause: Avoiding YAML library dependency, but regex is inefficient
- Improvement path:
  1. Load docker-compose.yml once at startup and cache
  2. Use proper YAML parser (js-yaml is minimal)
  3. Watch file for changes instead of re-parsing every pull

## Fragile Areas

**Docker Compose Integration:**
- Files: `src/main/docker.ts` (entire file), `src/main/index.ts` (IPC handlers)
- Why fragile: Heavy reliance on CLI subprocess output parsing; no Docker API client used
- Safe modification:
  1. Add comprehensive error logging for all subprocess output
  2. Test with different Docker/Compose versions
  3. Add timeout handling for hung processes
  4. Create integration tests with actual Docker Compose
- Test coverage: No unit tests for docker.ts functions; only manual integration testing

**WebView Injection System:**
- Files: `src/main/webview.ts` (lines 188-300): Multiple injection points for credentials/keys
- Why fragile: Uses `executeJavaScript()` to run arbitrary code; multiple injection points (navigate, finish-load, in-page-navigate)
- Safe modification:
  1. Consolidate all injections into single function
  2. Add guards to prevent multiple injections
  3. Implement injection state tracking
  4. Test injection behavior with slow-loading websites
- Test coverage: SetupPage.test.tsx covers UI, but no webview injection tests

**AWS Auth Flow (SSO + Device Authorization):**
- Files: `src/main/aws-auth.ts` (lines 210-335): Complex token exchange flow
- Why fragile: Multi-step async flow with intermediate state (ssoAccessToken, ssoRegion); error recovery unclear
- Safe modification:
  1. Add state machine for auth flow (enum of states)
  2. Implement timeout/retry logic for each step
  3. Add comprehensive error messages for each failure point
  4. Test with invalid credentials and network interruptions
- Test coverage: aws-auth.test.ts (280 lines) covers credential loading but not full SSO flow

**Admin Credentials Auto-Login:**
- Files: `src/main/webview.ts` (lines 279-300): `injectAutoLogin()` function injects username/password
- Why fragile: Hardcoded credential injection assumes form field names/IDs unchanged
- Safe modification:
  1. Verify backend form structure before injecting
  2. Add fallback if injection fails
  3. Implement retry with exponential backoff
  4. Add telemetry to track injection success/failure
- Test coverage: No tests for auto-login functionality

**Port Conflict Resolution:**
- Files: `src/main/docker.ts` (lines 160-187): `killPortProcesses()` forcefully kills processes
- Why fragile: Uses SIGTERM/SIGKILL without coordination; process.kill() may fail silently
- Safe modification:
  1. Add validation that processes actually died
  2. Implement graceful retry if kill failed
  3. Require user confirmation before killing unknown processes
  4. Add process name to confirmation dialog
- Test coverage: No unit tests; manual testing only

## Scaling Limits

**Update Check Interval:**
- Current capacity: 1 hour interval (UPDATE_CHECK_INTERVAL_MS = 3,600,000ms)
- Limit: If running 1000+ instances, Docker Hub rate limiting will trigger on concurrent pulls
- Scaling path:
  1. Implement exponential backoff with jitter for failed checks
  2. Add local version cache to skip remote check if recent
  3. Use Docker registry API instead of subprocess pull for checking

**Notification Store In-Memory Limit:**
- Current capacity: MAX_BLOCKED_LOG = 100 in network guard
- Limit: 100 blocked requests history; older entries discarded (line 31: `blockedRequests.shift()`)
- Scaling path:
  1. Implement persistent storage (SQLite) for audit trail
  2. Add configurable retention period
  3. Add export functionality for security audits

**Active Process Tracking:**
- Current capacity: Unbounded `activeProcesses` Set
- Limit: Memory grows with each spawned subprocess; manual cleanup required
- Scaling path:
  1. Implement automatic cleanup on process completion
  2. Add process timeout to kill hung children
  3. Monitor memory usage and warn if exceeded threshold

## Dependencies at Risk

**Electron 33.0.0 (Major Version):**
- Risk: Major version jump from 28.x; potential API breakage in future updates
- Impact: Preload script and WebContentsView API may change; security updates require rebuild
- Migration plan: Monitor Electron releases for EOL; plan migration path to 34.x 2 years out

**ethers 6.13.4 (Core Crypto Library):**
- Risk: Security updates critical for key derivation; library churn common
- Impact: Mnemonic validation, address derivation depends on this library
- Migration plan: Pin major version; subscribe to ethers security advisories; test before minor updates

**AWS SDK (@aws-sdk/client-sso*):**
- Risk: AWS SDK major versions lag behind Node.js; authentication flows may break
- Impact: SSO login broken if AWS changes auth endpoints or token formats
- Migration plan: Document AWS auth requirements; test quarterly against latest AWS SDK

**Node.js >= 18.0.0:**
- Risk: Node.js 18 EOL: 2025-04-30 (approaching); 20 EOL: 2026-10-18 (current LTS)
- Impact: Security patches will stop; package compatibility issues
- Migration plan: Document required Node.js version; update to Node 20 LTS before April 2025; CI should test against current LTS

## Missing Critical Features

**No Offline Mode Support:**
- Problem: App requires Docker to be running; no graceful degradation
- Blocks: Using app when Docker not available; development without containers
- Suggested solution: Cache last-known state; show warning but allow read-only navigation

**No Backup/Restore for Seed Phrase:**
- Problem: Only stored on single machine; loss = loss of keys
- Blocks: Key recovery if machine fails; portable key management
- Suggested solution: Export encrypted backup file; password-protected import

**No Credential Rotation Strategy:**
- Problem: AWS credentials accumulate in history; no way to invalidate old tokens
- Blocks: Key compromise response; credential lifecycle management
- Suggested solution: Add "revoke all tokens" button; implement credential versioning

**No Audit Log Export:**
- Problem: Network guard blocks requests but no persistent audit trail
- Blocks: Security incident investigation; compliance reporting
- Suggested solution: Add export button for blocked requests; implement persistent audit table

## Test Coverage Gaps

**Docker Integration (docker.ts):**
- What's not tested:
  - Port conflict detection and resolution (`getPortConflicts()`, `killPortProcesses()`)
  - Image pull with network failures and retries
  - Container startup error handling and recovery
  - Docker daemon status transitions
- Files: `src/main/docker.ts` (770 lines total)
- Risk: Core functionality for platform startup untested; refactoring without confidence
- Priority: High — Docker integration is critical path for all users

**WebView Injection System (webview.ts):**
- What's not tested:
  - Private key injection into web page
  - Auto-login credential injection
  - AWS credentials injection
  - Navigation event handling and listener cleanup
  - Memory leaks from WebContentsView lifecycle
- Files: `src/main/webview.ts` (477 lines total)
- Risk: Credential leakage or injection failures silently break workflows
- Priority: High — Direct security and user experience impact

**AWS SSO Authentication Flow (aws-auth.ts):**
- What's not tested:
  - Full SSO login flow (device auth → token exchange → credentials)
  - Profile loading from .aws/credentials and .aws/config
  - Token refresh and expiration handling
  - Error recovery (invalid credentials, network timeouts)
  - INI file parsing with edge cases (comments, empty lines, malformed entries)
- Files: `src/main/aws-auth.ts` (456 lines total); test file covers only 280 lines with limited scope
- Risk: Auth failures cause unclear error messages; edge cases crash silently
- Priority: High — AWS deployment is critical feature; users blocked if auth breaks

**Installer Script (install.sh):**
- What's not tested:
  - Download retry logic for failed installations
  - Duplicate installation (idempotency)
  - Architecture detection for arm64/x86_64
  - Shell detection (zsh/bash switching)
  - Multi-step rollback on partial failure
- Files: `install.sh` (352 lines)
- Risk: Installation failures leave system in inconsistent state; no rollback
- Priority: Medium — Only runs once per machine, but failure is high-friction

**Keystore Encryption (keystore.ts):**
- What's not tested:
  - OS keychain unavailability (Windows/Linux fallback)
  - Corrupted keystore file recovery
  - Concurrent access to keystore file
  - Large mnemonic phrases (edge case: non-standard word counts)
  - Memory buffer cleanup after key derivation
- Files: `src/main/keystore.ts` (147 lines); test file covers 201 lines but mocks safeStorage
- Risk: Encryption failures or memory leaks expose seed phrases
- Priority: High — Core to key security model

**Network Guard (network-guard.ts):**
- What's not tested:
  - Malformed URL handling in request interception
  - Regex pattern matching with edge cases
  - Dynamic host allowlist persistence
  - Blocked request logging and circular buffer behavior
- Files: `src/main/network-guard.ts` (94 lines)
- Risk: URLs that bypass whitelist may leak credentials to unexpected hosts
- Priority: Medium — Security-critical but unlikely edge cases

---

*Concerns audit: 2026-03-26*
