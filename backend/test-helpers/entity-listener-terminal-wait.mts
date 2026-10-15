import { onTestFinished } from 'vitest'
import type { ElectionTerminal } from './election-vote-stats-events.mts'

/** Register before action effects; a timed-out body must not await its own pending cleanup forever. */
export function createEntityListenerLifetime() {
  const teardown = new AbortController()
  const signal = AbortSignal.any([AbortSignal.timeout(15_000), teardown.signal])
  return {
    signal,
    register(finish: () => Promise<void>) {
      onTestFinished(async () => {
        teardown.abort(new Error('Entity listener test finished before terminal completion'))
        await finish()
      })
    },
  }
}

/** Preserve ordered raw failures and report cleanup errors once across body and test-finished joins. */
export function createEntityListenerErrorLedger() {
  const errors: unknown[] = []
  let reported = false
  return {
    errors,
    takeCleanupErrors() {
      if (reported) return []
      reported = true
      return [...errors]
    },
    async attempt(operation: () => unknown) {
      try {
        await operation()
      } catch (err) {
        errors.push(err)
      }
    },
  }
}

/** Bound ownership observation; an aborted producer remains a reported failure, never successful drain. */
export async function observeEntityListenerWork<T>(
  work: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  const aborted = Promise.withResolvers<never>()
  const abort = () => aborted.reject(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  try {
    // The race attaches rejection handling even when the lifetime was already aborted.
    return await Promise.race([aborted.promise, work])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

/** The owning observer closes its retained pending terminal waits after bounded observation ends. */
export function waitForEntityListenerTerminal(
  observer: { wait(id: string): Promise<ElectionTerminal> },
  id: string,
  signal: AbortSignal,
): Promise<ElectionTerminal> {
  return observeEntityListenerWork(observer.wait(id), signal)
}
