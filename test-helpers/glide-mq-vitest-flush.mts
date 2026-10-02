import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { flushJobs } from './glide-mq-vitest-flush-wait.mts'
import {
  type FlushedJobFailure,
  isInsideTestWorkerProcessor,
  type ShimTestQueue,
} from './glide-mq-vitest-internals.mts'
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

/**
 * Hold a failure watcher open across the adds and the wait. It has to exist before the first add:
 * a processor that throws can fail the job before `add` returns to its caller.
 */
async function withFailureWatcher<T>(
  queue: ShimTestQueue,
  run: (failures: Map<string, FlushedJobFailure>) => Promise<T>,
): Promise<T> {
  const failures = new Map<string, FlushedJobFailure>()
  queue.failureWatchers.add(failures)
  try {
    return await run(failures)
  } finally {
    queue.failureWatchers.delete(failures)
  }
}

export function addAndFlush<D, R>(
  queue: ShimTestQueue<D, R>,
  name: string,
  data: D,
  opts?: TestJobOptions,
) {
  return withFailureWatcher(queue, async failures => {
    const job = await queue.add(name, data, stripTestJobOptions(opts) as any)
    if (job && !isInsideTestWorkerProcessor()) {
      await flushJobs(
        queue,
        [job.id],
        opts?.expectDeadLetter === true ? new Set([job.id]) : new Set(),
        opts?.flushTimeoutMs,
        failures,
      )
    }
    return job
  })
}

export function addBulkAndFlush<D, R>(
  queue: ShimTestQueue<D, R>,
  jobs: Array<{ name: string; data: D; opts?: TestJobOptions }>,
) {
  return withFailureWatcher(queue, async failures => {
    // Sequential `queue.add` rather than `queue.addBulk()`, which drops a deduplicated add's `null`
    // instead of keeping its position: production's addBulk preserves the order and length of its
    // input, so a skipped add lands `null` at its own index.
    const result: Array<Awaited<ReturnType<typeof queue.add>>> = []
    for (const job of jobs) {
      result.push(await queue.add(job.name, job.data, stripTestJobOptions(job.opts) as any))
    }
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
        failures,
      )
    }
    return result
  })
}
