import { AsyncLocalStorage } from 'node:async_hooks'
import type { JobOptions } from 'glide-mq'
import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { type FlushQueue, flushJobs } from './glide-mq-vitest-flush-wait.mts'
export { TestQueueFlushTimeoutError }
export { DEFAULT_FLUSH_TIMEOUT_MS } from './glide-mq-vitest-flush-wait.mts'

const testWorkerProcessorContext = new AsyncLocalStorage<true>()

/** Suppress automatic flushing for nested processors and native explicit-wait/replay APIs. */
export function runInsideTestWorkerProcessor<T>(fn: () => T): T {
  return testWorkerProcessorContext.run(true, fn)
}

export function isInsideTestWorkerProcessor(): boolean {
  return testWorkerProcessorContext.getStore() === true
}

export function wrapTestWorkerProcessor<R>(
  processor: (job: any) => Promise<R> | R,
): (job: any) => Promise<R> {
  return job => runInsideTestWorkerProcessor(() => Promise.resolve(processor(job)))
}

export type TestJobOptions = JobOptions & {
  expectDeadLetter?: boolean
  flushTimeoutMs?: number
}

function stripTestJobOptions(opts?: TestJobOptions): JobOptions | undefined {
  if (!opts) return undefined
  const { expectDeadLetter: _expectDeadLetter, flushTimeoutMs: _flushTimeoutMs, ...jobOpts } = opts
  return jobOpts
}

export async function addAndFlush<D, R>(
  queue: FlushQueue<D, R>,
  name: string,
  data: D,
  opts?: TestJobOptions,
) {
  const job = await queue.enqueue(name, data, stripTestJobOptions(opts))
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
  queue: FlushQueue<D, R>,
  jobs: Array<{ name: string; data: D; opts?: TestJobOptions }>,
) {
  // Sequential native admission rather than `queue.addBulk()`, which drops a deduplicated add's `null`
  // instead of keeping its position: production's addBulk preserves the order and length of its
  // input, so a skipped add lands `null` at its own index.
  const result: Array<Awaited<ReturnType<typeof queue.enqueue>>> = []
  for (const job of jobs) {
    result.push(await queue.enqueue(job.name, job.data, stripTestJobOptions(job.opts)))
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
