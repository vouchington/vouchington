/**
 * Below the real-glide and data-store test budgets, and above the longest in-test block or
 * delay those waits still have to outlast. A stall must name this wait before the runner's
 * own test timeout is the only error.
 */
export const REAL_GLIDE_EVENT_DEADLINE_MS = 20_000

/**
 * Wait for a GlideMQ terminal event (`completed`, `failed`, or drained). The event resolves
 * the wait. A stall rejects with a named error instead of hanging the shard.
 */
export async function waitForRealGlideEvent<T>(
  pending: Promise<T>,
  description: string,
  deadlineMs = REAL_GLIDE_EVENT_DEADLINE_MS,
): Promise<T> {
  const signal = AbortSignal.timeout(deadlineMs)
  const expired = Promise.withResolvers<never>()
  const fail = () => {
    expired.reject(new Error(`${description} did not settle within ${deadlineMs}ms`))
  }
  signal.addEventListener('abort', fail, { once: true })
  if (signal.aborted) fail()
  try {
    // The race observes the deadline rejection even when the signal is already aborted.
    return await Promise.race([pending, expired.promise])
  } finally {
    signal.removeEventListener('abort', fail)
  }
}
