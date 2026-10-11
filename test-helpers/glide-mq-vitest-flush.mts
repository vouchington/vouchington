import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { flushJobs } from './glide-mq-vitest-flush-wait.mts'
import { isInsideTestWorkerProcessor, type ShimTestQueue } from './glide-mq-vitest-internals.mts'
export { TestQueueFlushTimeoutError }
export { DEFAULT_FLUSH_TIMEOUT_MS } from './glide-mq-vitest-flush-wait.mts'

type TestJobOptions = Record<string, unknown> & {
  expectDeadLetter?: boolean
  flushTimeoutMs?: number
}

function stripTestJobOptions(opts?: TestJobOptions): Record<string, unknown> | undefined {
  if (!opts) return undefined
  const { expectDeadLetter: _expectDeadLetter, flushTimeoutMs: _flushTimeoutMs, ...jobOpts } = opts
  return jobOpts
}

export async function addAndFlush<D, R>(
  queue: ShimTestQueue<D, R>,
  name: string,
  data: D,
  opts?: TestJobOptions,
) {
  const job = await queue.add(name, data, stripTestJobOptions(opts) as any)
  if (job && !isInsideTestWorkerProcessor()) {
    await flushJobs(
      queue,
      [job],
      opts?.expectDeadLetter === true ? new Set([job.id]) : new Set(),
      opts?.flushTimeoutMs,
    )
  }
  return job
}

export async function addBulkAndFlush<D, R>(
  queue: ShimTestQueue<D, R>,
  jobs: Array<{ name: string; data: D; opts?: TestJobOptions }>,
) {
  // Sequential `queue.add` rather than `queue.addBulk()`, which drops a deduplicated add's `null`
  // instead of keeping its position: production's addBulk preserves the order and length of its
  // input, so a skipped add lands `null` at its own index.
  const result: Array<Awaited<ReturnType<typeof queue.add>>> = []
  for (const job of jobs) {
    result.push(await queue.add(job.name, job.data, stripTestJobOptions(job.opts) as any))
  }
  const addedJobs = result.flatMap(job => (job ? [job] : []))
  const expectedDeadLetterJobIds = new Set(
    result.flatMap((job, index) =>
      job && jobs[index].opts?.expectDeadLetter === true ? [job.id] : [],
    ),
  )
  const timeouts = jobs.flatMap(job =>
    typeof job.opts?.flushTimeoutMs === 'number' ? [job.opts.flushTimeoutMs] : [],
  )
  if (addedJobs.length > 0 && !isInsideTestWorkerProcessor()) {
    await flushJobs(
      queue,
      addedJobs,
      expectedDeadLetterJobIds,
      timeouts.length > 0 ? Math.max(...timeouts) : undefined,
    )
  }
  return result
}
