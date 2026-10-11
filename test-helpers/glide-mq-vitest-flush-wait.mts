import type { TestJob } from 'glide-mq/testing'
import {
  captureFlushDiagnostics,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush-diagnostics.mts'
import { recordOf, type ShimTestQueue } from './glide-mq-vitest-internals.mts'

export const DEFAULT_FLUSH_TIMEOUT_MS = 4_000

type DeadLetterEnvelope = { originalJobId?: string }

/**
 * Ids still owed work. `waiting`, `prioritized` and `active` jobs will be processed, so a flush
 * waits for them. `delayed` (a `delay` option or `moveToDelayed`) and `suspended` jobs are parked
 * until a timer, `promote()` or a signal releases them, so a flush does not wait for those. A retried
 * job never stays `delayed`: the shim promotes it as soon as the worker parks it for its backoff.
 */
async function inspectJobs(
  queue: ShimTestQueue,
  jobs: TestJob[],
  expectedDeadLetterJobIds: Set<string>,
): Promise<string[]> {
  // Read admission before scanning mutable records, so a failure during this await is visible.
  const admitted = new Set(
    expectedDeadLetterJobIds.size === 0
      ? []
      : (await queue.getDeadLetterJobs()).map(
          job => (job.data as DeadLetterEnvelope | undefined)?.originalJobId,
        ),
  )
  const pending: string[] = []
  for (const job of jobs) {
    // The bound record retains terminal failure even after removeOnFail removes it from jobs.
    const record = recordOf(job)
    if (record.state === 'failed') {
      if (!expectedDeadLetterJobIds.has(job.id)) {
        throw new Error(
          `Test queue job failed in "${queue.name}" (${record.name}#${job.id}): ${record.failedReason ?? 'unknown error'}`,
        )
      }
      if (!admitted.has(job.id)) pending.push(job.id)
    } else if (
      queue.jobs.get(job.id) === record &&
      ['waiting', 'prioritized', 'active', 'waiting-children'].includes(record.state)
    ) {
      pending.push(job.id)
    }
  }
  return pending
}

/**
 * Wait for `jobIds` to reach a terminal state (or land on the configured dead-letter queue for the
 * ids in `expectedDeadLetterJobIds`), bounded by `flushTimeoutMs`. No-ops immediately if the queue
 * has no attached workers: a queue nothing consumes cannot make progress, so waiting would only
 * burn the timeout (it becomes a bug only when nothing ever attaches a worker). Rejects with the
 * job's failure and, on timeout, with worker/queue diagnostics.
 *
 * Native `waitForJobs` waits through delayed and suspended states and rejects expected DLQ
 * failures. This flush deliberately settles parked jobs, accepts an expected DLQ failure only
 * after admission, and reads retained failure from each job's bound record. `Worker.drain()` closes
 * the worker, which tests keep attached.
 */
export async function flushJobs(
  queue: ShimTestQueue,
  jobs: TestJob[],
  expectedDeadLetterJobIds: Set<string>,
  flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
): Promise<void> {
  const deadline = AbortSignal.timeout(flushTimeoutMs)
  if ((await queue.getWorkers()).length === 0) return
  const jobIds = jobs.map(job => job.id)

  return new Promise((resolve, reject) => {
    let settled = false
    let inspecting = false
    let dirty = false
    let pendingJobIds = [...jobIds]
    function finish(error?: unknown) {
      if (settled) return
      settled = true
      queue.settleWaiters.delete(notify)
      deadline.removeEventListener('abort', timedOut)
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- preserves the original queue-inspection failure for test diagnostics
      if (error !== undefined) reject(error)
      else resolve()
    }
    function timedOut() {
      finish(
        new TestQueueFlushTimeoutError(
          queue.name,
          [...jobIds],
          pendingJobIds,
          flushTimeoutMs,
          captureFlushDiagnostics(queue, pendingJobIds),
        ),
      )
    }
    function notify() {
      if (settled) return
      dirty = true
      if (!inspecting) void inspect()
    }
    async function inspect() {
      inspecting = true
      try {
        while (!settled && dirty) {
          dirty = false
          const pending = await inspectJobs(queue, jobs, expectedDeadLetterJobIds)
          if (settled) return
          // A real transition during any awaited read requires a fresh inspection before success.
          if (dirty) continue
          pendingJobIds = pending
          if (pending.length === 0) finish()
        }
      } catch (err) {
        finish(err)
      } finally {
        inspecting = false
      }
    }
    queue.settleWaiters.add(notify)
    deadline.addEventListener('abort', timedOut, { once: true })
    if (deadline.aborted) timedOut()
    else notify()
  })
}
