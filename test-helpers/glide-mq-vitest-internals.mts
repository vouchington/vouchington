import { AsyncLocalStorage } from 'node:async_hooks'
import { TestJob, TestQueue, TestWorker } from 'glide-mq/testing'

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
type DeadLetterSourceJob = {
  id: string
  name: string
  data: unknown
  attemptsMade?: number
  failedReason?: string
}
export const deadLetterQueueNames = new Map<string, string>()
const queues = new Map<string, TestQueue<any, any>>()

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
  return [...names].sort()
}

export function getOrCreateQueue(name: string): TestQueue<any, any> {
  const existing = queues.get(name)
  if (existing) return existing
  const queue = new TestQueue(name, { dedup: false })
  queues.set(name, queue)
  return queue
}
export function configureDeadLetterQueue(
  queueName: string,
  deadLetterQueue?: { name: string },
): void {
  if (deadLetterQueue?.name) deadLetterQueueNames.set(queueName, deadLetterQueue.name)
}

export function kickQueue(queue: TestQueue<any, any>): void {
  for (const worker of queue.workers as Set<any>) {
    if (typeof worker.processAvailable === 'function') worker.processAvailable()
    else if (typeof worker.onJobAdded === 'function') worker.onJobAdded()
  }
}
/** Move one failed TestQueue job back to waiting, matching TestQueue.retryJobs. */
export function retryFailedTestJob(queue: TestQueue<any, any>, jobId: string): void {
  const record = queue.jobs.get(jobId)
  if (!record || record.state !== 'failed') return
  record.state = 'waiting'
  record.attemptsMade = 0
  record.failedReason = undefined
  record.finishedOn = undefined
  queue.waitingQueue.push(record)
  kickQueue(queue)
}
export function attachTestJobRetry(queue: TestQueue<any, any>, job: TestJob | null) {
  if (!job) return null
  const withRetry = job as TestJob & { retry: () => Promise<void> }
  withRetry.retry = async () => retryFailedTestJob(queue, job.id)
  return withRetry
}
const MAX_TEST_WORKER_CONCURRENCY = 15
/** Clamp a requested worker concurrency to the in-memory test worker cap. */
export function clampTestWorkerConcurrency(concurrency?: number): number {
  return concurrency != null
    ? Math.min(concurrency, MAX_TEST_WORKER_CONCURRENCY)
    : MAX_TEST_WORKER_CONCURRENCY
}
/** Wire a TestWorker's 'failed' listener to forward jobs into the configured dead-letter queue. */
export function wireDeadLetterQueue(
  worker: TestWorker<any, any>,
  queueName: string,
  deadLetterQueue?: { name: string },
): void {
  if (!deadLetterQueue?.name) return
  const dlqName = deadLetterQueue.name
  worker.on('failed', job => {
    addDeadLetterJob(queueName, dlqName, job).catch(() => undefined)
  })
}
export async function getDeadLetterJobs(queueName: string, start = 0, end = -1) {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return []
  const existingJobs = await getQueueJobs(dlqName)
  return existingJobs.slice(start, end === -1 ? undefined : end + 1)
}
export function getDeadLetterJob(queueName: string, jobId: string) {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return null
  return getOrCreateQueue(dlqName).getJob(jobId)
}
export function removeDeadLetterJob(queueName: string, jobId: string): Promise<boolean> {
  const dlqName = deadLetterQueueNames.get(queueName)
  if (!dlqName) return Promise.resolve(false)
  return Promise.resolve(getOrCreateQueue(dlqName).jobs.delete(jobId))
}
export async function replayDeadLetterJob(queueName: string, jobId: string) {
  const dlqJob = await getDeadLetterJob(queueName, jobId)
  if (!dlqJob) return null
  const envelope = dlqJob.data as { data?: unknown; originalJobId?: string; originalQueue?: string }
  if (!envelope?.originalQueue) throw new Error('DLQ entry is missing originalQueue metadata')
  const originalQueue = getOrCreateQueue(envelope.originalQueue)
  const originalRecord =
    envelope.originalJobId && originalQueue.jobs.get(envelope.originalJobId)
      ? originalQueue.jobs.get(envelope.originalJobId)
      : undefined
  const opts = originalRecord?.opts
    ? omitReplayUnsafeOptions(originalRecord.opts as Record<string, unknown>)
    : undefined
  const replayed = await originalQueue.add(dlqJob.name, envelope.data ?? null, opts as any)
  await removeDeadLetterJob(queueName, jobId)
  kickQueue(originalQueue)
  return replayed
}
function omitReplayUnsafeOptions(opts: Record<string, unknown>): Record<string, unknown> {
  const {
    jobId: _jobId,
    delay: _delay,
    deduplication: _deduplication,
    parent: _parent,
    ...safeOpts
  } = opts
  return safeOpts
}
async function addDeadLetterJob(
  originalQueue: string,
  deadLetterQueue: string,
  job: DeadLetterSourceJob,
): Promise<void> {
  const dlq = getOrCreateQueue(deadLetterQueue)
  await dlq.add(job.name, {
    originalQueue,
    originalJobId: job.id,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade ?? 0,
  })
}
async function getQueueJobs(queueName: string) {
  const queue = getOrCreateQueue(queueName)
  const jobs = await Promise.all(Array.from(queue.jobs.keys()).map(id => queue.getJob(id)))
  return jobs.filter(job => job !== null)
}
