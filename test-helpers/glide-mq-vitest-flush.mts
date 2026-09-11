import type { TestQueue } from 'glide-mq/testing'
import {
  type DeduplicationOptions,
  recordDedup,
  reserveDedup,
  shouldSkipDedup,
} from './glide-mq-vitest-dedup.mts'
import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { flushJobs } from './glide-mq-vitest-flush-wait.mts'
import { isInsideTestWorkerProcessor, kickQueue } from './glide-mq-vitest-internals.mts'
export { TestQueueFlushTimeoutError }
export { DEFAULT_FLUSH_TIMEOUT_MS } from './glide-mq-vitest-flush-wait.mts'

type TestJobOptions = Record<string, unknown> & {
  expectDeadLetter?: boolean
  flushTimeoutMs?: number
  deduplication?: DeduplicationOptions
  delay?: number
}

function stripTestJobOptions(opts?: TestJobOptions): Record<string, unknown> | undefined {
  if (!opts) return undefined
  const { expectDeadLetter: _expectDeadLetter, flushTimeoutMs: _flushTimeoutMs, ...jobOpts } = opts
  return jobOpts
}

export async function addAndFlush<D, R>(
  queue: TestQueue<D, R>,
  name: string,
  data: D,
  opts?: TestJobOptions,
) {
  const timestamp = Date.now()
  const deduplication = opts?.deduplication
  const hadDelay = typeof opts?.delay === 'number' && opts.delay > 0
  if (shouldSkipDedup(queue, deduplication, timestamp)) return null
  reserveDedup(queue, deduplication, timestamp, hadDelay)
  const jobPromise = queue.add(name, data, stripTestJobOptions(opts) as any)
  kickQueue(queue)
  const job = await jobPromise
  if (job) recordDedup(queue, deduplication, job.id, timestamp, hadDelay)
  if (job && !isInsideTestWorkerProcessor()) {
    await flushJobs(
      queue,
      [job.id],
      opts?.expectDeadLetter === true ? new Set([job.id]) : new Set(),
      opts?.flushTimeoutMs,
    )
  }
  return job
}

export async function addBulkAndFlush<D, R>(
  queue: TestQueue<D, R>,
  jobs: Array<{ name: string; data: D; opts?: TestJobOptions }>,
) {
  // One shared timestamp for the whole call, matching production's addBulk, which pipelines every
  // job in the batch off a single `timestamp = Date.now()` (node_modules/glide-mq/dist/queue.js).
  // Processed sequentially (not via queue.addBulk(), which loops the same way internally but drops
  // null results instead of preserving their position) so a later item in this call can see an
  // earlier item's just-recorded dedup entry, and a skip lands `null` at that array index rather
  // than shifting every following result — matching production's order/length-preserving contract.
  const timestamp = Date.now()
  const result: Array<Awaited<ReturnType<typeof queue.add>>> = []
  for (const job of jobs) {
    const deduplication = job.opts?.deduplication
    const hadDelay = typeof job.opts?.delay === 'number' && job.opts.delay > 0
    if (shouldSkipDedup(queue, deduplication, timestamp)) {
      result.push(null)
      continue
    }
    reserveDedup(queue, deduplication, timestamp, hadDelay)
    const created = await queue.add(job.name, job.data, stripTestJobOptions(job.opts) as any)
    if (created) recordDedup(queue, deduplication, created.id, timestamp, hadDelay)
    result.push(created)
  }
  kickQueue(queue)
  const jobIds = result.flatMap(job => (job ? [job.id] : []))
  const expectedDeadLetterJobIds = new Set(
    result.flatMap((job, index) =>
      job && jobs[index].opts?.expectDeadLetter === true ? [job.id] : [],
    ),
  )
  const timeouts = jobs.flatMap(job =>
    typeof job.opts?.flushTimeoutMs === 'number' ? [job.opts.flushTimeoutMs] : [],
  )
  if (jobIds.length > 0 && !isInsideTestWorkerProcessor()) {
    await flushJobs(
      queue,
      jobIds,
      expectedDeadLetterJobIds,
      timeouts.length > 0 ? Math.max(...timeouts) : undefined,
    )
  }
  return result
}
