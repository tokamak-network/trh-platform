# Codebase Concerns: trh-sdk

**Analysis Date:** 2026-03-26

## Tech Debt

**Panic-based error handling in critical paths:**
- Issue: Multiple unrecoverable panic calls instead of proper error returns for invalid state
- Files: `pkg/types/configuration.go` (lines 37, 44, 51), `pkg/stacks/thanos/input.go` (line 1468), `pkg/utils/tools.go` (line 111)
- Impact: CLI crashes ungracefully when configuration fields are missing. Should return errors instead to allow recovery or user-friendly messaging
- Fix approach: Replace panics with explicit error returns in `GetL2OutputOracleSubmissionInterval()`, `GetMaxChannelDuration()`, `GetFinalizationPeriodSeconds()`, and panic in `SelectAccounts()`. Add validation at call sites

**Hard-coded SMTP configuration:**
- Issue: Gmail SMTP endpoint `smtp.gmail.com:587` is hard-coded in `pkg/stacks/thanos/input.go` (line 907)
- Files: `pkg/stacks/thanos/input.go` (lines 906-908)
- Impact: Prevents using alternative email providers (Sendgrid, Office 365, etc.). Users are locked into Gmail even if they use different email services
- Fix approach: Add configurability to email provider selection. Make SMTP host/port user-selectable or environment-driven with Gmail as default

**Incomplete WTON feature:**
- Issue: WTON staking feature is not implemented; UI prompts for it but code explicitly rejects it
- Files: `pkg/stacks/thanos/input.go` (lines 1214-1218)
- Impact: Users attempting WTON staking receive cryptic error. Feature appears to exist but doesn't work
- Fix approach: Either implement WTON support or remove the UI prompt entirely to avoid user confusion

**Unvalidated contract addresses for mainnet:**
- Issue: Mainnet addresses for `L1VerificationContractAddress`, `L2ManagerAddress`, `L1BridgeRegistry`, and `TON` token are all set to zero address `0x0000...0000`
- Files: `pkg/constants/chain.go` (lines 128, 142-145)
- Impact: Mainnet deployments will fail or send transactions to null contracts. This is a critical blocker for mainnet launch
- Fix approach: Obtain real mainnet contract addresses from team, update constants, add validation to prevent deployment if addresses are zeros

**Underspecified K8s resource limits:**
- Issue: Helm values for CPU/memory limits have TODO comment indicating they may be insufficient
- Files: `pkg/utils/helm.go` (line 45)
- Impact: Deployments may experience resource contention or pod evictions under load. No documented basis for current limits
- Fix approach: Profile real deployments to determine actual resource requirements, document rationale, add monitoring

## Known Bugs

**Incomplete state resumption validation:**
- Symptoms: `deploy-contracts` command allows resume when intermediate build artifacts may be stale, leading to failed builds from incomplete cache
- Files: `pkg/stacks/thanos/deploy_contracts.go` (lines 125-151)
- Trigger: Run `deploy-contracts`, interrupt during build, run again with resume=true
- Workaround: Disable resume by passing `--reuse-deployment=false` to force clean rebuild
- Root cause: Resume logic does not verify integrity of intermediate artifacts (forge cache, prestate, op-node binaries)

**Forge cache invalidation incomplete:**
- Symptoms: After patching contracts, old build artifacts may be used if cache is not properly invalidated
- Files: `pkg/stacks/thanos/artifacts_download.go` (lines 303-320), `pkg/stacks/thanos/deploy_contracts.go` (lines 637-655)
- Trigger: Deploy contracts, patch contracts-bedrock, deploy again → cached artifacts used despite changes
- Workaround: Manually delete `.forge-cache` directory before deploying
- Root cause: `invalidateCacheEntry()` only removes individual file entries, not handling nested dependency changes

**Unsafe goroutine error handling in PTY fallback:**
- Symptoms: If PTY startup fails and fallback to StdoutPipe is used, goroutine may write to closed reader after context cancellation
- Files: `pkg/utils/command.go` (lines 89-149)
- Trigger: Long-running deployment command that times out or gets cancelled
- Workaround: Increase timeout in deployment commands
- Root cause: Goroutine launched without checking if context was cancelled during PTY setup fallback; no error channel to signal goroutine before Wait()

## Security Considerations

**Sensitive data in state files:**
- Risk: Private keys and AWS credentials are stored in plain text in `settings.json` and deployment configuration files
- Files: `pkg/types/configuration.go`, `commands/shutdown.go`, state file locations at current working directory
- Current mitigation: File permissions set to 0644 (readable by all) in some cases, 0o600 (owner only) in others - inconsistent
- Recommendations:
  1. Enforce 0o600 (owner-read-only) for all credential files
  2. Add encryption at rest for sensitive fields (private keys, AWS secrets)
  3. Document that deployment directory should not be committed to git or shared
  4. Add warning when settings.json is readable by group/others

**Implicit shell command construction:**
- Risk: Multiple commands use `bash -c` with string interpolation that could be vulnerable to injection if user input is not properly escaped
- Files: `pkg/stacks/thanos/deploy_contracts.go` (lines 574-710 contain shell scripts), `pkg/utils/tools.go`
- Current mitigation: Some commands properly use `exec.CommandContext()` without shell; others construct shell strings
- Recommendations:
  1. Audit all bash -c invocations for user input handling
  2. Prefer direct exec.Command calls over shell wrappers where possible
  3. Add input validation/escaping for any dynamic shell commands

**AWS credentials passed as CLI flags:**
- Risk: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY may appear in process listings when passed via environment or CLI
- Files: `pkg/cloud-provider/aws/aws.go`, deployment commands
- Current mitigation: Credentials should be configured via AWS credentials file (~/.aws/credentials)
- Recommendations:
  1. Document that credentials must come from standard AWS credential chain (not CLI args)
  2. Add warning if attempting to pass credentials as environment variables
  3. Validate that credentials are not logged

## Performance Bottlenecks

**Parallel deployment tracks with arbitrary limits:**
- Problem: `deploy-contracts` uses `errgroup.WithContext()` for parallel canon prestate + source build, but no limit on concurrency
- Files: `pkg/stacks/thanos/deploy_contracts.go` (lines 251-350)
- Cause: Unbounded parallelism with memory-intensive tasks (forge builds, cannon compilation). On memory-constrained systems, excessive swapping occurs
- Improvement path:
  1. Add semaphore/limiter to errgroup (use `golang.org/x/sync/semaphore`)
  2. Monitor memory usage during parallel builds
  3. Document resource requirements (minimum 8GB RAM recommended)

**Slow K8s readiness check with fixed retry count:**
- Problem: `CheckK8sReady()` retries 10 times with 20-second interval = ~3-4 minute timeout, too long for development workflow
- Files: `pkg/utils/helm.go` (lines 44-70)
- Cause: Fixed backoff schedule doesn't adapt to actual system startup time
- Improvement path:
  1. Make maxRetries configurable via constants or flags
  2. Implement exponential backoff instead of fixed 20s interval
  3. Add early-exit on success to avoid unnecessary sleeps

**Repository cloning on every deploy-contracts (even with --reuse-deployment):**
- Problem: Repository is always cloned, even when `--reuse-deployment=true`, defeating purpose of artifact reuse
- Files: `pkg/stacks/thanos/deploy_contracts.go` (lines 141-147)
- Cause: Clone is marked as "always required" but no explanation why
- Improvement path:
  1. Evaluate whether clone can be skipped when artifacts already exist
  2. If clone is truly required, document why (e.g., deploy scripts in repository)
  3. Add option to reuse repository if it already exists locally

## Fragile Areas

**Resume state machine complexity:**
- Files: `pkg/stacks/thanos/deploy_contracts.go` (entire deployment state machine)
- Why fragile: Multiple state transitions (NotStarted → InProgress → Completed/Failed), each with different code paths. Resume logic must handle all states correctly
- Safe modification:
  1. Add explicit state enum instead of magic strings
  2. Add test cases for each state transition
  3. Document state diagram before modifying resume logic
- Test coverage: Basic resume tested; edge cases (partial builds, network failures mid-resume) untested

**Shell script patching inline in Go code:**
- Files: `pkg/stacks/thanos/deploy_contracts.go` (lines 574-760 contain embedded shell scripts with string replacements)
- Why fragile: If tokamak-thanos repository changes script structure, regex-based patching breaks silently
- Safe modification:
  1. Extract shell script patches to separate files
  2. Add validation to confirm patches applied successfully
  3. Add CI tests that verify patches work against target repository versions
- Test coverage: No tests for patch operations; patches only verified manually during deployment

**Configuration cascading from L1 chain ID:**
- Files: `pkg/constants/chain.go` (L1ChainConfigurations map), `pkg/stacks/thanos/deploy_contracts.go` (line 90-98 chain ID lookup)
- Why fragile: If L1 chain ID lookup fails silently, defaults are used without warning. Code assumes all chains exist in constants
- Safe modification:
  1. Validate chain ID exists in L1ChainConfigurations before proceeding
  2. Provide clear error if chain is unsupported
  3. Add chain configuration versioning to handle network upgrades

## Scaling Limits

**Single deployment directory for state:**
- Current capacity: One L2 deployment per execution directory
- Limit: Deploying multiple L2s requires different directories/workspaces; no support for multi-tenant or batch deployments
- Scaling path: Refactor to store deployments in versioned directory structure (e.g., `deployments/{L2_CHAIN_ID}/settings.json`)

**Hard-coded namespace for Kubernetes:**
- Current capacity: One Kubernetes deployment per cluster
- Limit: Cannot run multiple L2s in same EKS cluster (namespace collision)
- Scaling path: Add namespace generation/management to support multiple L2s per EKS cluster

## Dependencies at Risk

**tokamak-thanos submodule coupling:**
- Risk: SDK tightly coupled to specific commit/branch of tokamak-thanos. Script changes break deployments
- Impact: Network upgrades in tokamak-thanos require SDK updates. Divergent versions cause deploy failures
- Migration plan:
  1. Version tokamak-thanos submodule pinning
  2. Add compatibility matrix (SDK version X supports tokamak-thanos versions Y-Z)
  3. Document upgrade process for network changes

**urfave/cli v3 beta:**
- Risk: CLI framework is marked as beta; API may change in final release
- Impact: Future versions may require breaking changes to command handling
- Migration plan:
  1. Pin to specific beta version
  2. Monitor upstream for breaking changes
  3. Plan migration to stable release or alternative (cobra)

## Missing Critical Features

**No dry-run / validation mode:**
- Problem: Users cannot preview deployment configuration without executing it. No way to validate config before committing to cloud costs
- Blocks: Cannot audit deployment parameters before executing. Risk of misconfiguration costs
- Recommendation: Add `--dry-run` flag that prints deployment plan without creating infrastructure

**No backup of settings.json before deployment:**
- Problem: If deployment succeeds but settings.json is corrupted, recovery is difficult
- Blocks: Cannot safely retry interrupted deployments if state file is lost
- Recommendation: Auto-backup `settings.json` before each modification with timestamped versions

**No migration tool for configuration upgrades:**
- Problem: If deployment config structure changes (new required fields), old settings.json files are incompatible
- Blocks: Users cannot upgrade SDK without manual config rewriting
- Recommendation: Add migration script that updates old config schemas automatically

## Test Coverage Gaps

**No integration tests for deployment resume:**
- What's not tested: Resume from each deployment stage (pre-build, mid-build, pre-deploy, post-deploy)
- Files: `pkg/stacks/thanos/deploy_contracts.go`, state machine logic
- Risk: Resume bugs only discovered during actual mainnet deployments
- Priority: High - resume is critical path for long deployments

**No tests for AWS cleanup on failure:**
- What's not tested: Partial resource cleanup if deployment fails midway
- Files: `pkg/utils/aws_cleanup.go` (cleanup functions), destroy command
- Risk: Orphaned AWS resources, unexpected costs, manual cleanup required
- Priority: High - financial impact of cleanup failures

**No tests for concurrent K8s operations:**
- What's not tested: Multiple parallel helm installs, namespace creation race conditions
- Files: `pkg/utils/helm.go`, `pkg/stacks/thanos/k8s.go`
- Risk: Flaky deployments under concurrent load
- Priority: Medium - only an issue for batch deployments

**No tests for Forge cache invalidation:**
- What's not tested: Cache invalidation after contract changes, incremental vs clean builds
- Files: `pkg/stacks/thanos/artifacts_download.go` (invalidateCacheEntry), deploy_contracts.go (build patching)
- Risk: Silent use of stale contract artifacts leading to deployment mismatches
- Priority: High - contract correctness is critical

**No end-to-end tests for mainnet configuration:**
- What's not tested: Actual mainnet deployment with real addresses (L1VerificationContractAddress, etc.)
- Files: `pkg/constants/chain.go` (mainnet config), entire deployment flow
- Risk: Mainnet launch will discover address issues for the first time
- Priority: Critical - mainnet addresses are currently all-zeros (unusable)

---

*Concerns audit: 2026-03-26*
