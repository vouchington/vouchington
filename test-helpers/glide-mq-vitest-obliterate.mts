import type { TestQueue } from 'glide-mq/testing'
import { deadLetterQueueNames, getOrCreateQueue } from './glide-mq-vitest-internals.mts'

/**
 * Obliterate a shim TestQueue with glide-mq's own forced `TestQueue.obliterate()` (jobs, dedup
 * entries, dispatch queue, schedulers, budgets, metrics and every timer), then do the two things
 * it leaves alone: resume a paused queue, and cascade into the configured dead-letter queue, which
 * only the shim knows about.
 *
 * Deliberately does NOT detach the attached workers: they are attached by the importing test, not
 * owned by the queue's job state, and detaching them would make `flushJobs`'s worker-less no-op
 * branch permanent. A processor promise that never settles keeps pinning its worker's concurrency
 * slot for the same reason: obliterate cannot reclaim it.
 */
export async function obliterateTestQueue(
  queue: TestQueue,
  visited = new Set<string>(),
): Promise<void> {
  if (visited.has(queue.name)) return
  visited.add(queue.name)

  await queue.obliterate({ force: true })
  await queue.resume()

  const dlqName = deadLetterQueueNames.get(queue.name)
  if (dlqName) await obliterateTestQueue(getOrCreateQueue(dlqName), visited)
}
