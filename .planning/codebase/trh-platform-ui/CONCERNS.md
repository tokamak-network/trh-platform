# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

**Type Suppressions in API Layer:**
- Issue: Line 1 in `src/lib/api.ts` uses `/* eslint-disable @typescript-eslint/no-explicit-any */` to disable type checking across entire file
- Files: `src/lib/api.ts`
- Impact: Generic `any` types used throughout API response handling (`ApiResponse<T = any>`, `handleApiError()`), reducing type safety for all API interactions
- Fix approach: Replace `any` types with proper generics; create specific response/error types for common API patterns

**Type Assertions in Desktop Bridge Detection:**
- Issue: Desktop credential detection in `src/features/rollup/components/steps/AwsConfig.tsx` uses `Record<string, any>` type assertion with try-catch suppression
- Files: `src/features/rollup/components/steps/AwsConfig.tsx` (lines 49-54, 58-64)
- Impact: No runtime validation of desktop bridge API - could break if Electron process changes structure
- Fix approach: Create proper TypeScript interfaces for `window.__TRH_DESKTOP__` and `window.__TRH_AWS_CREDENTIALS__`; add schema validation

**RPC Connection Tolerance:**
- Issue: RPC validation in `src/features/rollup/hooks/useCreateRollup.ts` (line 187-189) catches errors and allows deployment anyway with "Proceeding with caution"
- Files: `src/features/rollup/hooks/useCreateRollup.ts`
- Impact: Deployment can proceed with unvalidated RPC endpoints; could silently fail on mainnet
- Fix approach: For mainnet, throw hard error; for testnet, require explicit user confirmation before retrying

**Fallback Auth Token Handling:**
- Issue: `src/features/auth/services/authService.ts` stores tokens in both cookie and localStorage for "backward compatibility"
- Files: `src/features/auth/services/authService.ts` (lines 65-73, 81-85, 92-95)
- Impact: Token could be out of sync between storage mechanisms; logout behavior unclear if only one is cleared
- Fix approach: Decide on single source of truth (cookie for server auth, localStorage for client state); migrate fully or remove legacy path

## Security Considerations

**Private Keys in Frontend State:**
- Risk: Private keys stored in form data and React state throughout account setup flow
- Files: `src/features/rollup/components/steps/AccountSetup.tsx`, `src/features/rollup/hooks/useEthereumAccounts.ts`, `src/features/rollup/schemas/create-rollup.ts`
- Current mitigation: Keys stored in `react-hook-form` managed state; visible on ReviewAndDeployStep with toggle mask
- Recommendations:
  1. Move private key handling to IndexedDB or sessionStorage (non-serializable)
  2. Never persist private keys to localStorage or Ethereum derivation results
  3. Clear keys immediately after deployment validation; require re-entry if deployment fails
  4. For Electron app: Use `preload.ts` to expose only address derivation, not key derivation

**AWS Credentials Exposure:**
- Risk: AWS secret keys visible on ReviewAndDeployStep (line 232-237 in `ReviewAndDeployStep.tsx`)
- Files: `src/features/rollup/components/steps/ReviewAndDeployStep.tsx`, validation sends raw credentials to `/stacks/thanos/validate-deployment` endpoint
- Current mitigation: Eye/EyeOff toggle to hide value; never logged to console
- Recommendations:
  1. Use server-side credential validation instead of sending secrets to frontend
  2. Pass only credential IDs from dropdown selection
  3. Backend should fetch and validate AWS credentials server-to-server

**Unvalidated RPC URL Input:**
- Risk: User-supplied RPC URLs accepted without HTTPS validation
- Files: `src/features/rollup/components/steps/AwsConfig.tsx` (AWS credential form also accepts RPC in some flows)
- Current mitigation: URL format validation in schema only
- Recommendations:
  1. Enforce HTTPS protocol in URL validation schema
  2. Add DNS rebinding protection on localhost check
  3. Validate certificate during provider connection (ethers.js does this)

**Desktop Window Bridge Injection:**
- Risk: Code assumes `window.__TRH_DESKTOP__` and `window.__TRH_AWS_CREDENTIALS__` are safe; Electron preload could be compromised
- Files: `src/features/rollup/components/steps/AccountSetup.tsx` (lines 251, 286, 290), `src/features/rollup/components/steps/AwsConfig.tsx`
- Current mitigation: Try-catch silently fails; gracefully falls back to web input
- Recommendations:
  1. Validate schema of injected objects before using
  2. Sign bridge messages from Electron preload process
  3. Use postMessage API instead of window properties

## Performance Bottlenecks

**RPC Connection Timeout on Every Step Navigation:**
- Problem: `useCreateRollup.ts` (line 251-294) creates new ethers.JsonRpcProvider and calls `getNetwork()` every time user advances from step 1, with 5-second timeout
- Files: `src/features/rollup/hooks/useCreateRollup.ts`
- Cause: No caching of RPC verification results; new provider instance per validation call
- Improvement path:
  1. Cache verified RPC endpoints in hook state keyed by URL
  2. Reuse ethers.JsonRpcProvider instance for same RPC URL
  3. Skip verification if URL already validated in this session

**Account Balance Polling Every 500ms:**
- Problem: `src/features/rollup/hooks/useEthereumAccounts.ts` (lines 103-113) has 500ms setTimeout debounce but fetches balance for all 10 derived accounts sequentially on every seedphrase change
- Files: `src/features/rollup/hooks/useEthereumAccounts.ts`
- Cause: Balance fetch is not optimized; no request batching or parallel limit
- Improvement path:
  1. Use batch RPC requests or Multicall contract instead of sequential getBalance calls
  2. Increase debounce to 1000ms minimum
  3. Add request cancellation token to prevent stale updates

**Unbounded Task Polling:**
- Problem: `src/components/TaskProgress.tsx` (line 83) polls task status every 2 seconds indefinitely if task endpoint returns 404 or error
- Files: `src/components/TaskProgress.tsx`
- Cause: catch block logs error but continues polling; no exponential backoff or max retry limit
- Improvement path:
  1. Add exponential backoff (2s → 4s → 8s max)
  2. Stop polling after 5 consecutive errors or 30 minutes elapsed
  3. Implement circuit breaker for unavailable task endpoints

**Window.URL.createObjectURL Not Cleaned Up on Navigation:**
- Problem: Three file download functions in `src/features/rollup/services/rollupService.ts` (lines 236-243, 307-314, 373-380) create blob URLs that could accumulate if user navigates away
- Files: `src/features/rollup/services/rollupService.ts`
- Cause: No cleanup on component unmount; blob URLs persist in memory
- Improvement path:
  1. Return cleanup function from download service
  2. Attach cleanup to useEffect return in components
  3. Use blob: URL strategy with automatic cleanup

## Fragile Areas

**RPC Chain ID Validation Logic:**
- Files: `src/features/rollup/hooks/useCreateRollup.ts` (lines 264-277)
- Why fragile:
  1. Hardcoded chain IDs (1 for mainnet, 11155111 for Sepolia) - will break if L1 changes or testnet migrates
  2. Error message distinguishes "Chain ID mismatch" but doesn't show what chain was detected
  3. Mainnet RPC URL must point to exact Ethereum mainnet; no way to use mainnet forks locally
- Safe modification: Extract chain IDs to constants; make configurable per network selection
- Test coverage: Check that wrong RPC URLs are detected; check that correct networks pass

**Account Generation from Seed Phrase:**
- Files: `src/features/rollup/hooks/useEthereumAccounts.ts`
- Why fragile:
  1. Fixed HD path `m/44'/60'/0'/0/${i}` hardcoded for only 10 accounts
  2. Balance fetch failure (line 74-84) doesn't stop account generation but returns "Error fetching balance" string
  3. bip39 validation uses English wordlist only
- Safe modification: Parameterize derivation path and account count; distinguish balance fetch errors from generation errors
- Test coverage: Test with invalid seed phrases; test with no-balance accounts

**Mainnet Confirmation Flow:**
- Files: `src/features/rollup/components/steps/ReviewAndDeployStep.tsx` (lines 226-261), validation in `useCreateRollup.ts` (lines 207-212)
- Why fragile:
  1. Checkbox must be checked (line 243-249) but no visual disable of Deploy button while unchecked
  2. Validation at line 148-157 constructs `mainnetConfirmation` object only if condition is true; could be undefined
  3. Backend expects exact fields (`acknowledgedIrreversibility`, `acknowledgedCosts`, `acknowledgedRisks`) - schema doesn't validate presence
- Safe modification: Add button disable state; use non-optional type for mainnetConfirmation
- Test coverage: Test that Deploy button is disabled until checkbox is checked; test API payload structure

**Form State Persistence Across Navigation:**
- Files: `src/features/rollup/context/RollupCreationContext.tsx`, `src/features/rollup/hooks/useCreateRollup.ts` (lines 56-74)
- Why fragile:
  1. Form data persisted to React context but no persistence to localStorage or sessionStorage
  2. If user refreshes page at step 3, all form data is lost
  3. useEffect subscription at line 65-74 saves to context on every field change - could cause unnecessary re-renders
- Safe modification: Add session storage persistence; debounce form save to 2+ seconds
- Test coverage: Verify form data survives page refresh; test that sensitive data is cleared on logout

## Validation and Error Handling Gaps

**API Error Handling Not Specific Enough:**
- Problem: `src/lib/api.ts` (lines 81-102) `handleApiError` treats all network errors uniformly; doesn't distinguish between timeout, CORS, DNS, and server errors
- Files: `src/lib/api.ts`
- Issue: User can't tell if error is their network, the backend, or misconfiguration
- Fix: Add error codes to responses; map common HTTP+network errors to user-friendly messages

**Validation Service Fallthrough:**
- Problem: `src/features/rollup/hooks/useCreateRollup.ts` (line 189) returns `true` if validation service is unavailable
- Files: `src/features/rollup/hooks/useCreateRollup.ts`
- Issue: Deployment proceeds without any validation; comment says "Optionally return true" but no feature flag or explicit approval
- Fix: Add explicit feature flag; require user to manually confirm deployment if validation unavailable

**AWS Region Validation Incomplete:**
- Problem: AWS region list hardcoded in `src/features/rollup/components/steps/AwsConfig.tsx` (lines 75-79) - no validation that user's credentials actually work in selected region
- Files: `src/features/rollup/components/steps/AwsConfig.tsx`
- Issue: User might select region where they don't have IAM permissions
- Fix: Call iam:ListRoles or sts:GetCallerIdentity to validate credentials work in region during deployment validation

**No Validation of Derived Ethereum Accounts:**
- Problem: `src/features/rollup/hooks/useEthereumAccounts.ts` assumes all derived accounts are valid and distinct
- Files: `src/features/rollup/hooks/useEthereumAccounts.ts`
- Issue: No verification that accounts are actually different; no check that balances are sufficient for deployment
- Fix: Add validation that all 5 required accounts (admin, proposer, batch, challenger, sequencer) are distinct Ethereum addresses

## Missing or Incomplete Features

**No Recovery Path for Failed Deployments:**
- Problem: If deployment fails mid-stream, form state persists but deployment can't be resumed or rolled back
- Files: `src/features/rollup/context/RollupCreationContext.tsx`, `src/features/rollup/components/steps/ReviewAndDeployStep.tsx`
- Issue: User might have to start over or manually clean up partial deployments
- Status: Documented in TaskProgress component (line 114-115) - "Closing this window will NOT stop the process"

**No Preset Validation for Required Fields:**
- Problem: Preset implementation allows optional override of backend-provided values, but no validation that all required fields are present
- Files: `src/features/rollup/components/preset/ConfigReview.tsx`, `src/features/rollup/services/presetService.ts` (lines 24, 39)
- Issue: Schema validation warnings logged but not surfaced to user
- Status: Comment at line 372 of design docs suggests mocking contracts instead of TODO approach

**No Backup Configuration Testing:**
- Problem: Backup configuration (line 175-211 in ReviewAndDeployStep.tsx) only available on testnet with no validation
- Files: `src/features/rollup/components/steps/ReviewAndDeployStep.tsx`
- Issue: Users can enable backup but don't know if it will work until deployment
- Fix: Add "Test Backup" button in BackupTab that validates AWS Backup service access

## Integration Points at Risk

**Direct Dependency on Backend API Contract:**
- Files: All service files in `src/features/*/services/`
- Risk: Backend API changes could break UI without version coordination
- Recommendations:
  1. Add API version to all requests
  2. Create OpenAPI/TypeScript client generator
  3. Add deprecation warnings to response headers

**Ethereum Network Assumptions:**
- Files: `src/features/rollup/hooks/useEthereumAccounts.ts`, `src/features/rollup/hooks/useCreateRollup.ts`
- Risk: Hardcoded mainnet (1) and Sepolia (11155111) chain IDs
- Recommendations:
  1. Store network config in backend
  2. Fetch supported networks at app initialization
  3. Make RPC endpoint configurable per network

## Test Coverage Gaps

**No Tests for Private Key Handling:**
- What's not tested: Seed phrase derivation, private key clearance after deployment, key rotation
- Files: `src/features/rollup/hooks/useEthereumAccounts.ts`, `src/features/rollup/components/steps/AccountSetup.tsx`
- Risk: Regression in key handling could leak sensitive data
- Priority: **High**

**No Tests for RPC Failover:**
- What's not tested: Behavior when RPC endpoint becomes unavailable; timeout handling; fallback RPC selection
- Files: `src/features/rollup/hooks/useCreateRollup.ts`, `src/components/TaskProgress.tsx`
- Risk: Users might proceed with invalid RPC; deployment could fail with unclear error
- Priority: **High**

**No Tests for Form State Persistence:**
- What's not tested: Form data survives navigation; state cleared on logout; sensitive fields don't persist
- Files: `src/features/rollup/context/RollupCreationContext.tsx`
- Risk: Security: Private keys might persist after logout
- Priority: **High**

**No Integration Tests for Mainnet Deployment Flow:**
- What's not tested: End-to-end mainnet deployment validation; confirmation dialog acceptance; cost calculation accuracy
- Files: `src/features/rollup/components/steps/ReviewAndDeployStep.tsx`, `src/features/rollup/hooks/useCreateRollup.ts`
- Risk: Mainnet deployments could proceed with invalid configuration
- Priority: **Critical**

**No Tests for AWS Credential Validation:**
- What's not tested: AWS key format validation; region compatibility checks; IAM permission verification
- Files: `src/features/configuration/aws-credentials/`, `src/features/rollup/components/steps/AwsConfig.tsx`
- Risk: Deployment could fail because user doesn't have AWS permissions in selected region
- Priority: **Medium**

---

*Concerns audit: 2026-03-26*
