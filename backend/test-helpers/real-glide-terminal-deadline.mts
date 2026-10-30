/**
 * Under every Vitest project's test budget, so a stall names this wait before that budget
 * is the only error. A caller that must outlast a longer clock passes its own deadline,
 * still under that test's timeout.
 */
export const REAL_GLIDE_EVENT_DEADLINE_MS = 4_000

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
