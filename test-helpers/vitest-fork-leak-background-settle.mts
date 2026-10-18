import type { TestJobRecord } from 'glide-mq/testing'
import {
  captureFlushDiagnostics,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush-diagnostics.mts'
import { DEFAULT_FLUSH_TIMEOUT_MS, type FlushQueue } from './glide-mq-vitest-flush-wait.mts'

const ACTIVE_JOB_STATES = ['active'] as const satisfies readonly TestJobRecord['state'][]
const WAITING_JOB_STATES = [
  'waiting',
  'prioritized',
  'waiting-children',
] as const satisfies readonly TestJobRecord['state'][]

export type RunnableQueueSettleOptions = {
  /**
   * When true, also wait for jobs a live worker can still pick up. Delayed and suspended jobs stay
   * parked either way: they are not holding a connection.
   */
  includeWaiting: boolean
  flushTimeoutMs?: number
}

/**
 * Wait until this queue has no jobs that can still be inside a processor. `includeWaiting` adds
 * jobs a running worker is about to pick up, so one cannot check out a connection between the
 * empty observation and the next snapshot. A failed job is terminal and does not reject
 * the wait: the failure belongs to the test that enqueued it, and a released client is idle.
 * No-ops when nothing is attached, matching `flushJobs`, because a queue with no worker cannot
 * make progress.
 */
export async function settleRunnableQueueJobs(
  queue: FlushQueue,
  options: RunnableQueueSettleOptions,
): Promise<void> {
  const flushTimeoutMs = options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
  if ((await queue.getWorkers()).length === 0) return

  const deadline = AbortSignal.timeout(flushTimeoutMs)
  let pendingJobIds: string[] = []
  let transition = Promise.withResolvers<void>()
  let notified = false
  const expiration = Promise.withResolvers<never>()
  function notify() {
    notified = true
    transition.resolve()
  }
  function timedOut() {
    expiration.reject(
      new TestQueueFlushTimeoutError(
        queue.name,
        pendingJobIds,
        pendingJobIds,
        flushTimeoutMs,
        captureFlushDiagnostics(queue, pendingJobIds),
      ),
    )
    notify()
  }
  async function inspect() {
    while (!deadline.aborted) {
      transition = Promise.withResolvers<void>()
      notified = false
      pendingJobIds = listRunnableJobIds(queue, options.includeWaiting)
      // A transition during the read requires a fresh inspection before success.
      if (notified) continue
      if (pendingJobIds.length === 0) return
      await transition.promise
    }
  }
  queue.settleWaiters.add(notify)
  deadline.addEventListener('abort', timedOut, { once: true })
  try {
    if (deadline.aborted) timedOut()
    await Promise.race([expiration.promise, inspect()])
  } finally {
    queue.settleWaiters.delete(notify)
    deadline.removeEventListener('abort', timedOut)
  }
}

function listRunnableJobIds(queue: FlushQueue, includeWaiting: boolean): string[] {
  // getJobs has no prioritized or waiting-children list. Those records are still runnable:
  // a priority job stays prioritized until a worker promotes it, and a parent stays in
  // waiting-children until its children finish and the worker resumes it.
  const states = new Set<TestJobRecord['state']>(
    includeWaiting ? [...ACTIVE_JOB_STATES, ...WAITING_JOB_STATES] : [...ACTIVE_JOB_STATES],
  )
  const pending: string[] = []
  for (const [id, record] of queue.jobs) {
    if (states.has(record.state)) pending.push(id)
  }
  return pending
}
