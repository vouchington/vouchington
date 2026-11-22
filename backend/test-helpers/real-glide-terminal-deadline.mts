import { once } from 'node:events'

/**
 * Under every Vitest project's test budget, so a stall names this wait before that budget
 * is the only error. A caller that must outlast a longer clock passes its own deadline,
 * still under that test's timeout.
 */
export const REAL_GLIDE_EVENT_DEADLINE_MS = 4_000

/**
 * Owned admission waits on the default project budget: a stalled owned job rejects by name before
 * that budget. User-vouch observation outlasts it and uses a longer per-test deadline. The
 * entity-listener lifetime is bounded by teardown abort instead: teardown names cleanup after the
 * test finishes, and a stall during the test body surfaces as the runner timeout.
 */
export function admissionObservationDeadline(): AbortSignal {
  return AbortSignal.timeout(REAL_GLIDE_EVENT_DEADLINE_MS)
}

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

/**
 * Wait for the first payload of a QueueEvents or SQS consumer event. Listening starts when this is
 * called, so create it before the action that emits the event. A stall rejects naming the event.
 */
export async function waitForEmitterEvent<T = unknown>(
  emitter: NodeJS.EventEmitter,
  event: string,
  deadlineMs = REAL_GLIDE_EVENT_DEADLINE_MS,
): Promise<T> {
  const listening = new AbortController()
  const pending = once(emitter, event, { signal: listening.signal }).then(
    ([payload]) => payload as T,
  )
  // The race below observes this promise; abort rejects it after the listener is removed.
  pending.catch(() => {})
  try {
    return await waitForRealGlideEvent(pending, `${event} event`, deadlineMs)
  } finally {
    listening.abort()
  }
}
