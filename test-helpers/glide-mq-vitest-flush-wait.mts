import {
  captureFlushDiagnostics,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush-diagnostics.mts'
import {
  deadLetterQueueNames,
  type FlushedJobFailure,
  getOrCreateQueue,
  type ShimTestQueue,
} from './glide-mq-vitest-internals.mts'

export const DEFAULT_FLUSH_TIMEOUT_MS = 14_000
// Parking by DelayedError / moveToDelayed emits no queue event, so waiters also re-check on a timer.
const FALLBACK_POLL_MS = 10

type DeadLetterEnvelope = { originalJobId?: string }

/** The terminal failure observed for one of the flushed job ids, if any. */
export type FailureLookup = (jobId: string) => FlushedJobFailure | undefined

function hasDeadLetterJob(queueName: string, originalJobId: string): boolean {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return false
  for (const record of getOrCreateQueue(dlqName).jobs.values()) {
    if ((record.data as DeadLetterEnvelope | undefined)?.originalJobId === originalJobId) {
      return true
    }
  }
  return false
}

/**
 * Ids still owed work. `waiting`, `prioritized` and `active` jobs will be processed, so a flush
 * waits for them. `delayed` (a `delay` option or `moveToDelayed`) and `suspended` jobs are parked
 * until a timer, `promote()` or a signal releases them, so a flush does not wait for those. A retried
 * job never stays `delayed`: the shim promotes it as soon as the worker parks it for its backoff.
 */
function inspectJobs(
  queue: ShimTestQueue,
  jobIds: string[],
  expectedDeadLetterJobIds: Set<string>,
  failureOf: FailureLookup,
): string[] {
  const pending: string[] = []
  for (const jobId of jobIds) {
    const record = queue.jobs.get(jobId)
    // A `removeOnFail` job leaves no record, so its failure is only known from the watched event.
    const failure =
      failureOf(jobId) ??
      (record?.state === 'failed'
        ? { name: record.name, reason: record.failedReason ?? 'unknown error' }
        : undefined)
    if (failure) {
      if (!expectedDeadLetterJobIds.has(jobId)) {
        throw new Error(
          `Test queue job failed in "${queue.name}" (${failure.name}#${jobId}): ${failure.reason}`,
        )
      }
      if (!hasDeadLetterJob(queue.name, jobId)) pending.push(jobId)
    } else if (
      record?.state === 'waiting' ||
      record?.state === 'prioritized' ||
      record?.state === 'active'
    ) {
      pending.push(jobId)
    }
  }
  return pending
}

const nowMs = () => Number(process.hrtime.bigint() / 1_000_000n)

/**
 * Wait for `jobIds` to reach a terminal state (or land on the configured dead-letter queue for the
 * ids in `expectedDeadLetterJobIds`), bounded by `flushTimeoutMs`. No-ops immediately if the queue
 * has no attached workers: a queue nothing consumes cannot make progress, so waiting would only
 * burn the timeout (it becomes a bug only when nothing ever attaches a worker). Rejects with the
 * job's failure and, on timeout, with worker/queue diagnostics.
 *
 * glide-mq 0.16's native waiters do not fit here: `addAndWait` refuses `removeOnComplete` /
 * `removeOnFail` (several production enqueues set them), waits on one id, and throws when the add
 * is deduplicated; `Job.waitUntilFinished` polls every 500ms and resolves 'failed' instead of
 * throwing; `Worker.drain()` closes the worker, which tests keep attached.
 */
export async function flushJobs(
  queue: ShimTestQueue,
  jobIds: string[],
  expectedDeadLetterJobIds: Set<string>,
  flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
  failureOf: FailureLookup = () => undefined,
): Promise<void> {
  // `getWorkers()` reads the attached set when called, so this no-op decision matches a direct
  // read; only the continuation moves one microtask later, and the `check()` below re-reads the
  // job state after registering, so no settle is missed.
  if ((await queue.getWorkers()).length === 0) return
  if (inspectJobs(queue, jobIds, expectedDeadLetterJobIds, failureOf).length === 0) return
  const deadline = nowMs() + flushTimeoutMs

  return new Promise((resolve, reject) => {
    let settled = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    function finish(error?: unknown) {
      settled = true
      clearTimeout(pollTimer)
      queue.settleWaiters.delete(check)
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- preserves the original queue-inspection failure for test diagnostics
      if (error) reject(error)
      else resolve()
    }
    function check() {
      if (settled) return
      try {
        const pendingJobIds = inspectJobs(queue, jobIds, expectedDeadLetterJobIds, failureOf)
        if (pendingJobIds.length === 0) return finish()
        const remaining = deadline - nowMs()
        if (remaining <= 0) {
          return finish(
            new TestQueueFlushTimeoutError(
              queue.name,
              [...jobIds],
              pendingJobIds,
              flushTimeoutMs,
              captureFlushDiagnostics(queue, pendingJobIds),
            ),
          )
        }
        clearTimeout(pollTimer)
        pollTimer = setTimeout(check, Math.min(FALLBACK_POLL_MS, remaining))
      } catch (err) {
        finish(err)
      }
    }
    queue.settleWaiters.add(check)
    check()
  })
}
