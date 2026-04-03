/**
 * Generic async polling utility.
 *
 * Extracted from the bridge-tx.live.spec.ts pollUntil pattern for reuse
 * across all matrix verification tests.
 */

/**
 * Poll `fn` until it returns a non-null value, or throw after `timeoutMs`.
 *
 * @param fn        - Async function that returns T on success, null to retry.
 * @param label     - Human-readable description for logging.
 * @param timeoutMs - Maximum wait time (default 180 s).
 * @param intervalMs - Delay between attempts (default 10 s).
 * @returns The first non-null result from `fn`.
 */
export async function pollUntil<T>(
  fn: () => Promise<T | null>,
  label: string,
  timeoutMs = 180_000,
  intervalMs = 10_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    const result = await fn();
    if (result !== null) {
      console.log(`[poll] ${label} succeeded after ${attempts} attempt(s)`);
      return result;
    }
    console.log(`[poll] Waiting for ${label}... (attempt ${attempts})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for: ${label} (after ${attempts} attempts, ${timeoutMs}ms)`);
}
