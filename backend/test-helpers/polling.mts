import { readAllQueueJobs, type AllStateQueueJobReader } from './queue-jobs.mts'

function pollTimeoutError(description: string, maxMs: number): Error {
  return new Error(`Timed out waiting for ${description} (after ${maxMs}ms)`)
}

/**
 * Polls `fn` until it returns a non-null value, then returns it. Throws once `maxMs` elapses, so a
 * value that never appears fails the test at the wait instead of silently burning the whole
 * timeout and letting a later assertion pass vacuously. `description` names what was awaited in
 * the error. A test that must prove something stays absent asserts on a single read after the
 * operation under test has settled; it does not poll.
 */
export async function pollUntilNotNull<T>(
  fn: () => Promise<T | null | undefined>,
  maxMs = 2000,
  intervalMs = 25,
  description = 'a non-null value',
): Promise<T> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const result = await fn()
    if (result != null) return result
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  const last = await fn()
  if (last != null) return last
  throw pollTimeoutError(description, maxMs)
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
 * Polls `predicate` until it returns true and throws once `timeoutMs` elapses. Unlike
 * `pollUntilNotNull`, the condition need not resolve a value — use this when what a test cares
 * about is a side effect (a row landing in the database, a specific job reaching a state) rather
 * than a returned payload. `description` names what was awaited in the error.
 */
export async function waitForCondition(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 2000,
  intervalMs = 25,
  description = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  if (await predicate()) return
  throw pollTimeoutError(description, timeoutMs)
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
  await waitForCondition(
    predicate,
    timeoutMs,
    intervalMs,
    'condition before obliterating the test queue',
  )
  await queue.obliterate({ force: true })
}
