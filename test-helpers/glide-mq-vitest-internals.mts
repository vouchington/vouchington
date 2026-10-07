import { AsyncLocalStorage } from 'node:async_hooks'
import { type TestJob, TestQueue } from 'glide-mq/testing'
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

/** Eager retries and actual DLQ admission; reusable queues reinstall hooks after close. */
export type FlushedJobFailure = { name: string; reason: string }
/** Record identity distinguishes old running jobs from new jobs reusing an obliterated id. */
export function recordOf(job: TestJob): object {
  // oxlint-disable-next-line no-underscore-dangle -- glide-mq exposes no public identity for a test job
  return (job as unknown as { _record: object })._record
}

export class ShimTestQueue<D = any, R = any> extends TestQueue<D, R> {
  /** Flush waiters, woken by actual job transitions and admission/promotion settlement. */
  readonly settleWaiters = new Set<() => void>()
  readonly retryPromotions = new Map<object, Promise<void>>()
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

  readonly #promoteRetriedJob = (job: TestJob) => {
    const record = recordOf(job)
    const promotion = job
      .promote()
      .catch(() => undefined)
      .finally(() => {
        if (this.retryPromotions.get(record) === promotion) this.retryPromotions.delete(record)
        this.#notifySettleWaiters()
      })
    this.retryPromotions.set(record, promotion)
  }
  constructor(name: string) {
    super(name)
    this.#installHooks()
  }

  override parkDelayed(...args: Parameters<TestQueue<D, R>['parkDelayed']>): void {
    super.parkDelayed(...args)
    this.#notifySettleWaiters()
  }

  override async obliterate(...args: Parameters<TestQueue<D, R>['obliterate']>): Promise<void> {
    await super.obliterate(...args)
    this.#notifySettleWaiters()
  }

  override async close(): Promise<void> {
    await super.close()
    this.#installHooks()
  }
  #installHooks(): void {
    this.on('retrying', this.#promoteRetriedJob)
    this.on('failed', (job: TestJob) => {
      void forwardToDeadLetterQueue(this.name, job).finally(this.#notifySettleWaiters)
    })
    this.on('failed', this.#recordFailure)
    this.on('failed', this.#notifySettleWaiters)
    this.on('completed', this.#notifySettleWaiters)
    for (const event of ['suspended', 'promoted', 'removed', 'revoked', 'drained']) {
      this.on(event, this.#notifySettleWaiters)
    }
  }
}

const queues = new Map<string, ShimTestQueue>()

async function listAttachedWorkers(): Promise<Array<{ queueName: string; workerId: string }>> {
  const infos = [...queues].map(async ([queueName, queue]) =>
    (await queue.getWorkers()).map(worker => ({ queueName, workerId: worker.id })),
  )
  return (await Promise.all(infos)).flat()
}

/** Snapshot the id of every TestWorker currently attached through the in-memory queue shim. */
export async function captureAttachedTestWorkers(): Promise<ReadonlySet<string>> {
  return new Set((await listAttachedWorkers()).map(({ workerId }) => workerId))
}

/**
 * Return queue names that acquired an attached TestWorker after the supplied fork baseline.
 * Queue names, rather than workers, make the guard's remediation actionable and deterministic.
 */
export async function getUnexpectedAttachedTestWorkerQueueNames(
  baseline: ReadonlySet<string>,
): Promise<string[]> {
  const attached = await listAttachedWorkers()
  const unexpected = attached.filter(({ workerId }) => !baseline.has(workerId))
  return [...new Set(unexpected.map(({ queueName }) => queueName))].toSorted()
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

async function forwardToDeadLetterQueue(queueName: string, job: TestJob): Promise<void> {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return
  await getOrCreateQueue(dlqName)
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
