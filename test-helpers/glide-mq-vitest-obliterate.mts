import type { TestQueue } from 'glide-mq/testing'
import { clearDedupEntries } from './glide-mq-vitest-dedup.mts'
import { deadLetterQueueNames, getOrCreateQueue } from './glide-mq-vitest-internals.mts'

/**
 * Fully clear a shim TestQueue's owned state — everything `obliterate()` promises but upstream
 * `TestQueue.drain()` does not touch: `jobs`, `dedupSet`, the shim dedup map, `waitingQueue`,
 * `budgets`, `metricsData` counters, registered schedulers, and pause state. Also obliterates the
 * configured dead-letter queue, if any.
 *
 * Deliberately does NOT touch `queue.workers` — workers are attached by the importing test, not
 * owned by the queue's job state; clearing them would make `flushJobs`'s worker-less no-op branch
 * (test-helpers/glide-mq-vitest-flush.mts) permanent.
 *
 * Deliberately does not reach into `TestQueue`'s scheduler/suspended-timeout timers (`schedulerTimer`,
 * `suspendedTimeoutTimers`) or its `idCounter` — those fields, and the methods that clear them, are
 * TypeScript-`private` on `TestQueue` (not just `@internal`), so touching them would require an `any`
 * cast onto genuinely private implementation detail that could silently stop working on a future
 * glide-mq bump. They're also not correctness-critical here: clearing `schedulers` via the public
 * `removeJobScheduler` API already stops `runDueSchedulers` from doing anything on its next tick, and
 * a stale suspended-timeout timer already no-ops itself once `jobs.clear()` removes the job it would
 * have acted on (see `scheduleSuspendedTimeout`'s `current.state !== 'suspended'` guard in
 * glide-mq/dist/testing.js). An un-reset `idCounter` has no observable effect: IDs keep climbing
 * across obliterates instead of restarting at 1, and no test in this codebase asserts a literal job
 * ID.
 */
export async function obliterateTestQueue(
  queue: TestQueue<any, any>,
  visited = new Set<string>(),
): Promise<void> {
  if (visited.has(queue.name)) return
  visited.add(queue.name)

  queue.jobs.clear()
  queue.dedupSet.clear()
  clearDedupEntries(queue.name)
  queue.waitingQueue.length = 0
  queue.budgets.clear()
  for (const counters of queue.metricsData.values()) counters.clear()

  const schedulers = await queue.getRepeatableJobs()
  await Promise.all(schedulers.map(({ name }) => queue.removeJobScheduler(name)))
  await queue.resume()

  const dlqName = deadLetterQueueNames.get(queue.name)
  if (dlqName) await obliterateTestQueue(getOrCreateQueue(dlqName), visited)
}
