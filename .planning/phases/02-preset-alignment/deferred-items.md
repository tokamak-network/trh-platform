# Deferred Items — Phase 02 Preset Alignment

## Pre-existing Test Failures (Out of Scope)

### TestGetFundingStatus_* in trh-backend/pkg/services/thanos

**Discovered during:** Plan 02-02, Task 2 full suite verification
**Status:** Pre-existing failure — existed before Plan 02-01 changes
**Error:** `failed to derive address for admin: invalid private key: invalid hex character 'x' in private key`
**Affected tests:**
- `TestGetFundingStatus_AllAccountsFunded_AllFulfilledTrue`
- `TestGetFundingStatus_OneAccountUnderfunded_AllFulfilledFalse`
- `TestGetFundingStatus_ResponseContainsStackIDAndNetwork`
- `TestGetFundingStatus_RoleOrderIsConsistent`

**Root cause:** `funding_test.go` uses a placeholder private key string (`"0x..."`) that fails hex parsing.
**Not fixed because:** Out of scope — not caused by or related to preset crossTrade alignment changes.
**Recommendation:** Fix funding_test.go test fixtures with valid test private keys in a future plan.
