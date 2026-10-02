import type { TestJob } from 'glide-mq/testing'
import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { type FailureLookup, flushJobs } from './glide-mq-vitest-flush-wait.mts'
import {
  type FlushedJobFailure,
  isInsideTestWorkerProcessor,
  recordOf,
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
  run: (failures: Map<object, FlushedJobFailure>) => Promise<T>,
): Promise<T> {
  const failures = new Map<object, FlushedJobFailure>()
  queue.failureWatchers.add(failures)
  try {
    return await run(failures)
  } finally {
    queue.failureWatchers.delete(failures)
  }
}

/** Only a failure of one of these very jobs counts; a stale job reusing an id does not. */
function failureLookup(
  failures: ReadonlyMap<object, FlushedJobFailure>,
  jobs: TestJob[],
): FailureLookup {
  const byId = new Map(jobs.map(job => [job.id, job]))
  return jobId => {
    const job = byId.get(jobId)
    return job && failures.get(recordOf(job))
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
        failureLookup(failures, [job]),
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
        failureLookup(
          failures,
          result.flatMap(job => (job ? [job] : [])),
        ),
      )
    }
    return result
  })
}
