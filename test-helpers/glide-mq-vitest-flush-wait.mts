import type { TestQueue } from 'glide-mq/testing'
import {
  captureFlushDiagnostics,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush-diagnostics.mts'
import { deadLetterQueueNames, getOrCreateQueue, kickQueue } from './glide-mq-vitest-internals.mts'

type QueueRecord = { state?: string; failedReason?: string; name?: string; data?: unknown }
type WorkerEvents = { on(event: 'completed' | 'failed', listener: () => void): void }

export const DEFAULT_FLUSH_TIMEOUT_MS = 14_000
const flushWaiters = new WeakMap<object, Set<() => void>>()

function subscribeFlushWaiter(worker: WorkerEvents, waiter: () => void): () => void {
  let waiters = flushWaiters.get(worker)
  if (!waiters) {
    waiters = new Set()
    flushWaiters.set(worker, waiters)
    const active = waiters
    const fanout = () => active.forEach(pending => pending())
    worker.on('completed', fanout)
    worker.on('failed', fanout)
  }
  waiters.add(waiter)
  return () => waiters.delete(waiter)
}

function hasDeadLetterJob(queueName: string, originalJobId: string): boolean {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return false
  for (const record of getOrCreateQueue(dlqName).jobs.values() as Iterable<QueueRecord>) {
    if ((record.data as { originalJobId?: string } | undefined)?.originalJobId === originalJobId)
      return true
  }
  return false
}

function inspectJobs(
  queue: TestQueue<any, any>,
  jobIds: string[],
  expectedDeadLetterJobIds: Set<string>,
): string[] {
  const pending: string[] = []
  for (const jobId of jobIds) {
    const record = queue.jobs.get(jobId) as QueueRecord | undefined
    if (!record) continue
    if (record.state === 'failed') {
      if (!expectedDeadLetterJobIds.has(jobId)) {
        throw new Error(
          `Test queue job failed in "${queue.name}" (${record.name ?? 'unknown'}#${jobId}): ${record.failedReason ?? 'unknown error'}`,
        )
      }
      if (!hasDeadLetterJob(queue.name, jobId)) pending.push(jobId)
    } else if (
      record.state === 'waiting' ||
      record.state === 'active' ||
      record.state === 'delayed'
    ) {
      pending.push(jobId)
    }
  }
  return pending
}

/**
 * Wait for `jobIds` to reach a terminal state (or land on the configured dead-letter queue for the
 * ids in `expectedDeadLetterJobIds`), bounded by `flushTimeoutMs`. No-ops immediately if the queue
 * has no attached workers — see `test-helpers/glide-mq-vitest-internals.mts` for why that no-op is
 * intentional rather than a bug in itself (it becomes one only when nothing ever attaches a worker).
 */
export function flushJobs(
  queue: TestQueue<any, any>,
  jobIds: string[],
  expectedDeadLetterJobIds: Set<string>,
  flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
): Promise<void> {
  if (!queue.workers || queue.workers.size === 0) return Promise.resolve()
  if (inspectJobs(queue, jobIds, expectedDeadLetterJobIds).length === 0) return Promise.resolve()
  const deadline = Number(process.hrtime.bigint() / 1_000_000n) + flushTimeoutMs

  return new Promise((resolve, reject) => {
    let settled = false
    let kickTimer: ReturnType<typeof setTimeout> | undefined
    let delayMs = 0
    const unsubscribers = [...queue.workers].map(worker =>
      subscribeFlushWaiter(worker as WorkerEvents, onEvent),
    )
    function finish(error?: unknown) {
      if (settled) return
      settled = true
      if (kickTimer !== undefined) clearTimeout(kickTimer)
      for (const unsubscribe of unsubscribers) unsubscribe()
      if (error) reject(error)
      else resolve()
    }
    function onEvent() {
      try {
        if (inspectJobs(queue, jobIds, expectedDeadLetterJobIds).length === 0) finish()
      } catch (error) {
        finish(error)
      }
    }
    onEvent()
    const scheduleKick = () => {
      if (settled) return
      const remaining = deadline - Number(process.hrtime.bigint() / 1_000_000n)
      if (remaining <= 0) {
        try {
          const pendingJobIds = inspectJobs(queue, jobIds, expectedDeadLetterJobIds)
          finish(
            pendingJobIds.length === 0
              ? undefined
              : new TestQueueFlushTimeoutError(
                  queue.name,
                  [...jobIds],
                  pendingJobIds,
                  flushTimeoutMs,
                  captureFlushDiagnostics(queue, pendingJobIds),
                ),
          )
        } catch (error) {
          finish(error)
        }
        return
      }
      kickTimer = setTimeout(
        () => {
          if (settled) return
          kickQueue(queue)
          onEvent()
          if (!settled) scheduleKick()
        },
        Math.min(delayMs, remaining),
      )
      delayMs = 10
    }
    scheduleKick()
  })
}
