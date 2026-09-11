import { readAllQueueJobs, type AllStateQueueJobReader } from './queue-jobs.mts'

/** Polls `fn` until it returns a non-null value or `maxMs` elapses. */
export async function pollUntilNotNull<T>(
  fn: () => Promise<T | null | undefined>,
  maxMs = 2000,
  intervalMs = 25,
): Promise<T | null> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const result = await fn()
    if (result != null) return result
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return null
}

/**
 * Polls a queue's full job history (all five states, see `readAllQueueJobs`) until `predicate`
 * matches or `timeoutMs` elapses. Previously scanned `'waiting'` only, which goes deterministically
 * empty the moment any worker is attached to the queue in this fork (`isolate: false` shares queue
 * state across every file) — that made every caller here time out against an already-drained job
 * instead of seeing it. Every caller's predicate is presence-shaped (`.some`, `.has`, a length
 * check against jobs this test itself just added), so widening the read can only satisfy it
 * earlier, never spuriously — an ABSENCE predicate built on this must still be predicate-scoped, per
 * `readAllQueueJobs`'s doc comment, since the result includes the fork's whole history for the queue.
 */
export async function waitForQueueJobs<T extends { id: string; timestamp: number }>(
  queue: AllStateQueueJobReader<T>,
  predicate: (jobs: T[]) => boolean,
  timeoutMs = 1000,
): Promise<T[]> {
  const deadline = Date.now() + timeoutMs
  let jobs = await readAllQueueJobs(queue)
  while (!predicate(jobs) && Date.now() < deadline) {
    await new Promise<void>(resolve => setImmediate(resolve))
    jobs = await readAllQueueJobs(queue)
  }
  return jobs
}

export async function flushPendingTasks(iterations = 20): Promise<void> {
  for (let iteration = 0; iteration < iterations; iteration++) {
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

/**
 * Polls `predicate` until it returns true or `timeoutMs` elapses. Unlike `pollUntilNotNull`, the
 * condition need not resolve a value — use this when what a test cares about is a side effect (a
 * row landing in the database, a specific job reaching a state) rather than a returned payload.
 */
export async function waitForCondition(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 2000,
  intervalMs = 25,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return await predicate()
}

export type ObliterableQueue = { obliterate: (opts?: { force?: boolean }) => Promise<void> }

/**
 * Wait for `predicate` (the one outcome a test actually cares about — e.g. a specific job's state,
 * or a downstream row it produced), then obliterate `queue`. This discards whatever else the shared
 * test queue may be carrying instead of waiting for the whole queue to drain: a test should wait on
 * its own condition and then dump, not inherit every other job's timing.
 *
 * Throws if `predicate` never becomes true within `timeoutMs`, so a genuine miss still fails loudly
 * rather than silently obliterating on the deadline.
 */
export async function waitForConditionThenObliterate(
  queue: ObliterableQueue,
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 2000,
  intervalMs = 25,
): Promise<void> {
  const met = await waitForCondition(predicate, timeoutMs, intervalMs)
  if (!met) throw new Error('Timed out waiting for condition before obliterating the test queue')
  await queue.obliterate({ force: true })
}
