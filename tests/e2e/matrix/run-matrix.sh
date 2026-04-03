#!/usr/bin/env bash
set -euo pipefail

# ==========================================================================
# Live Deployment Matrix Runner — P0 combinations
#
# This script assumes each stack is ALREADY DEPLOYED before running.
# Only one stack can run at a time (shared ports). Deploy, test, teardown,
# then move to the next combination.
#
# For CI, deploy each stack separately before running this script.
# ==========================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# -- Flags -----------------------------------------------------------------

DRY_RUN="false"
FULL_CYCLE="false"
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN="true" ;;
    --full-cycle) FULL_CYCLE="true" ;;
  esac
done

# Test target: full-cycle deploys+verifies+teardowns, default runs health checks only
if [[ "$FULL_CYCLE" == "true" ]]; then
  TEST_TARGET="tests/e2e/matrix/full-cycle.live.spec.ts"
  echo "Mode: full-cycle (deploy → verify → teardown)"
else
  TEST_TARGET="tests/e2e/matrix/"
  echo "Mode: health-check only (assumes stack already deployed)"
fi

# -- P0 Matrix definition --------------------------------------------------
# Format: "PRESET:FEE_TOKEN"

MATRIX=(
  "general:TON"
  "defi:USDT"
  "gaming:ETH"
  "full:USDC"
)

# -- Counters & results ----------------------------------------------------

PASSED=0
FAILED=0
RESULTS=()

# -- Main loop -------------------------------------------------------------

for combo in "${MATRIX[@]}"; do
  IFS=':' read -r preset fee_token <<< "$combo"
  chain_name="${fee_token,,}-${preset}"   # lowercase fee token
  label="${preset}/${fee_token} (${chain_name})"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] LIVE_PRESET=${preset} LIVE_FEE_TOKEN=${fee_token} LIVE_CHAIN_NAME=${chain_name} npx playwright test --config playwright.live.config.ts ${TEST_TARGET}"
    RESULTS+=("${label}: DRY-RUN")
    continue
  fi

  echo ""
  echo "=========================================="
  echo "  Matrix: ${label}"
  echo "=========================================="

  if LIVE_PRESET="${preset}" LIVE_FEE_TOKEN="${fee_token}" LIVE_CHAIN_NAME="${chain_name}" \
     npx playwright test --config playwright.live.config.ts ${TEST_TARGET}; then
    RESULTS+=("${label}: PASS")
    ((PASSED++))
  else
    RESULTS+=("${label}: FAIL")
    ((FAILED++))
  fi
done

# -- Summary table ---------------------------------------------------------

echo ""
echo "=========================================="
echo "  Matrix Summary"
echo "=========================================="
printf "%-35s %s\n" "Combination" "Result"
printf "%-35s %s\n" "-----------------------------------" "------"
for r in "${RESULTS[@]}"; do
  result="${r##*: }"
  name="${r%: *}"
  printf "%-35s %s\n" "$name" "$result"
done
echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run complete. No tests executed."
  exit 0
fi
echo "Passed: ${PASSED}  Failed: ${FAILED}"

exit $((FAILED > 0 ? 1 : 0))
