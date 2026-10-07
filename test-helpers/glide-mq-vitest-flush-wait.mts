import {
  captureFlushDiagnostics,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush-diagnostics.mts'
import {
  deadLetterQueueNames,
  type FlushedJobFailure,
  getOrCreateQueue,
  recordOf,
  type ShimTestQueue,
} from './glide-mq-vitest-internals.mts'

export const DEFAULT_FLUSH_TIMEOUT_MS = 4_000

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
async function inspectJobs(
  queue: ShimTestQueue,
  jobIds: string[],
  expectedDeadLetterJobIds: Set<string>,
  failureOf: FailureLookup,
): Promise<string[]> {
  const pending: string[] = []
  for (const jobId of jobIds) {
    // Native retry dispatch parks then emits retrying synchronously. Awaiting the real lookup
    // lets that hook register its actual promotion before we inspect a transient delayed state.
    const job = await queue.getJob(jobId)
    const promotion = job && queue.retryPromotions.get(recordOf(job))
    if (promotion) await promotion
    const state = job ? await job.getState() : 'unknown'
    const record = queue.jobs.get(jobId)
    // A `removeOnFail` job leaves no record, so its failure is only known from the watched event.
    const failure =
      failureOf(jobId) ??
      (state === 'failed' && record
        ? { name: record.name, reason: record.failedReason ?? 'unknown error' }
        : undefined)
    if (failure) {
      if (!expectedDeadLetterJobIds.has(jobId)) {
        throw new Error(
          `Test queue job failed in "${queue.name}" (${failure.name}#${jobId}): ${failure.reason}`,
        )
      }
      if (!hasDeadLetterJob(queue.name, jobId)) pending.push(jobId)
    } else if (state === 'waiting' || state === 'prioritized' || state === 'active') {
      pending.push(jobId)
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
  const deadline = AbortSignal.timeout(flushTimeoutMs)
  if ((await queue.getWorkers()).length === 0) return

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
          const pending = await inspectJobs(queue, jobIds, expectedDeadLetterJobIds, failureOf)
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
