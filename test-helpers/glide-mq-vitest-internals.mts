import { AsyncLocalStorage } from 'node:async_hooks'
import { type TestJob, TestQueue, type TestWorker } from 'glide-mq/testing'

const testWorkerProcessorContext = new AsyncLocalStorage<true>()

/** Run a shim Worker processor so nested Queue.add can detect in-processor enqueue. */
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

export const deadLetterQueueNames = new Map<string, string>()

/**
 * glide-mq's in-memory queue plus the two behaviours the shim layers on top of it:
 *
 * - A retryable failure parks the job in `delayed` for its backoff (glide-mq 0.16). Tests run in
 *   real time, so the `retrying` hook promotes it straight back instead of sleeping through the
 *   backoff. A RateLimitError also emits `retrying`; the worker still honours its own rate-limit
 *   pause before it dispatches the promoted job again.
 * - A terminal failure (`failed`) is forwarded to the configured dead-letter queue, which test mode
 *   does not implement. Production only forwards after attempts are exhausted, as `failed` does.
 *   It is also recorded for any flush that is watching, because `removeOnFail: true` deletes the job
 *   record before the event fires and a flush that only read records would miss the failure.
 *
 * `TestQueue.close()` removes every listener, so the hooks are re-installed afterwards: the shim
 * keeps handing out the same queue after a test closes it.
 */
export type FlushedJobFailure = { name: string; reason: string }

/**
 * The in-memory record behind a job. An id is not enough to tell two jobs apart: `obliterate`
 * restarts the id counter, so a job still running from before it can fail under the id a newer job
 * now holds. The record is one object per job.
 */
export function recordOf(job: TestJob): object {
  // oxlint-disable-next-line no-underscore-dangle -- glide-mq exposes no public identity for a test job
  return (job as unknown as { _record: object })._record
}

export class ShimTestQueue<D = any, R = any> extends TestQueue<D, R> {
  /** Flush waiters, woken whenever any job on this queue completes or fails. */
  readonly settleWaiters = new Set<() => void>()
  /** Terminal failures by job record, filled for as long as a flush holds its map in this set. */
  readonly failureWatchers = new Set<Map<object, FlushedJobFailure>>()
  readonly #recordFailure = (job: TestJob, err: unknown) => {
    const failure = {
      name: job.name,
      reason: job.failedReason ?? (err instanceof Error ? err.message : String(err)),
    }
    for (const watcher of this.failureWatchers) watcher.set(recordOf(job), failure)
  }
  readonly #notifySettleWaiters = () => {
    for (const waiter of [...this.settleWaiters]) waiter()
  }

  constructor(name: string) {
    super(name)
    this.#installHooks()
  }

  override async close(): Promise<void> {
    await super.close()
    this.#installHooks()
  }

  #installHooks(): void {
    this.on('retrying', promoteRetriedJob)
    this.on('failed', (job: TestJob) => forwardToDeadLetterQueue(this.name, job))
    this.on('failed', this.#recordFailure)
    this.on('failed', this.#notifySettleWaiters)
    this.on('completed', this.#notifySettleWaiters)
  }
}

/** A concurrent change (the job was removed or already promoted) leaves nothing to promote. */
function promoteRetriedJob(job: TestJob): void {
  job.promote().catch(() => undefined)
}

const queues = new Map<string, ShimTestQueue>()

/** Snapshot every TestWorker currently attached through the in-memory queue shim. */
export function captureAttachedTestWorkers(): ReadonlySet<TestWorker> {
  const workers = new Set<TestWorker>()
  for (const queue of queues.values()) {
    for (const worker of queue.workers) workers.add(worker)
  }
  return workers
}

/**
 * Return queue names that acquired an attached TestWorker after the supplied fork baseline.
 * Queue names, rather than workers, make the guard's remediation actionable and deterministic.
 */
export function getUnexpectedAttachedTestWorkerQueueNames(
  baseline: ReadonlySet<TestWorker>,
): string[] {
  const names = new Set<string>()
  for (const [queueName, queue] of queues) {
    for (const worker of queue.workers) {
      if (!baseline.has(worker)) names.add(queueName)
    }
  }
  return [...names].toSorted()
}

export function getOrCreateQueue(name: string): ShimTestQueue {
  const existing = queues.get(name)
  if (existing) return existing
  const queue = new ShimTestQueue(name)
  queues.set(name, queue)
  return queue
}

export function configureDeadLetterQueue(
  queueName: string,
  deadLetterQueue?: { name: string },
): void {
  if (deadLetterQueue?.name) deadLetterQueueNames.set(queueName, deadLetterQueue.name)
}

const MAX_TEST_WORKER_CONCURRENCY = 15

/** Clamp a requested worker concurrency to the in-memory test worker cap. */
export function clampTestWorkerConcurrency(concurrency?: number): number {
  return concurrency != null
    ? Math.min(concurrency, MAX_TEST_WORKER_CONCURRENCY)
    : MAX_TEST_WORKER_CONCURRENCY
}

function forwardToDeadLetterQueue(queueName: string, job: TestJob): void {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return
  getOrCreateQueue(dlqName)
    .add(job.name, {
      originalQueue: queueName,
      originalJobId: job.id,
      data: job.data,
      failedReason: job.failedReason,
      // The job copy was taken at dispatch, before the worker counted the failing attempt.
      attemptsMade: job.attemptsMade + 1,
    })
    .catch(() => undefined)
}

export async function getDeadLetterJobs(queueName: string, start = 0, end = -1) {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return []
  const jobs = await getOrCreateQueue(dlqName).searchJobs({})
  return jobs.slice(start, end === -1 ? undefined : end + 1)
}

export function getDeadLetterJob(queueName: string, jobId: string) {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return null
  return getOrCreateQueue(dlqName).getJob(jobId)
}

export async function removeDeadLetterJob(queueName: string, jobId: string): Promise<boolean> {
  const job = await getDeadLetterJob(queueName, jobId)
  if (!job) return false
  await job.remove()
  return true
}

export async function replayDeadLetterJob(queueName: string, jobId: string) {
  const dlqJob = await getDeadLetterJob(queueName, jobId)
  if (!dlqJob) return null
  const envelope = dlqJob.data as { data?: unknown; originalJobId?: string; originalQueue?: string }
  if (!envelope?.originalQueue) throw new Error('DLQ entry is missing originalQueue metadata')
  const originalQueue = getOrCreateQueue(envelope.originalQueue)
  const originalJob = envelope.originalJobId
    ? await originalQueue.getJob(envelope.originalJobId)
    : null
  const opts = originalJob ? omitReplayUnsafeOptions(originalJob.opts) : undefined
  const replayed = await originalQueue.add(dlqJob.name, envelope.data ?? null, opts)
  await removeDeadLetterJob(queueName, jobId)
  return replayed
}

function omitReplayUnsafeOptions(opts: object): Record<string, unknown> {
  const {
    jobId: _jobId,
    delay: _delay,
    deduplication: _deduplication,
    parent: _parent,
    ...safeOpts
  } = opts as Record<string, unknown>
  return safeOpts
}
