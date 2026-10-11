import { TestWorker } from 'glide-mq/testing'
export {
  BatchError,
  ConnectionError,
  DelayedError,
  GlideMQError,
  GroupRateLimitError,
  SuspendError,
  UnrecoverableError,
  WaitingChildrenError,
  TestFlowProducer as FlowProducer,
  TestJob as Job,
} from 'glide-mq/testing'
import { addAndFlush, addBulkAndFlush } from './glide-mq-vitest-flush.mts'
import {
  clampTestWorkerConcurrency,
  getOrCreateQueue,
  type ShimTestQueue,
  wrapTestWorkerProcessor,
} from './glide-mq-vitest-internals.mts'
import { obliterateTestQueue } from './glide-mq-vitest-obliterate.mts'

export class Queue<D = any, R = any> {
  readonly name: string
  #inner: ShimTestQueue<D, R>

  constructor(name: string, options?: { deadLetterQueue?: { name: string } }) {
    this.name = name
    this.#inner = getOrCreateQueue(name, options)
  }
  add(name: string, data: D, opts?: Record<string, unknown>) {
    return addAndFlush(this.#inner, name, data, opts as any)
  }
  addBulk(
    jobs: Array<{
      name: string
      data: D
      opts?: Record<string, unknown>
    }>,
  ) {
    return addBulkAndFlush(this.#inner, jobs as any)
  }
  getJob(id: string) {
    return this.#inner.getJob(id)
  }
  getJobs(
    type: 'waiting' | 'active' | 'delayed' | 'completed' | 'failed',
    start?: number,
    end?: number,
  ) {
    return this.#inner.getJobs(type, start, end)
  }
  getJobCounts() {
    return this.#inner.getJobCounts()
  }
  searchJobs(opts: { name?: string; data?: Record<string, unknown>; state?: string }) {
    return this.#inner.searchJobs(opts as any)
  }
  isPaused() {
    return Promise.resolve(this.#inner.isPaused())
  }
  pause() {
    return this.#inner.pause()
  }
  resume() {
    return this.#inner.resume()
  }
  // Closing a producer client leaves server state and independently owned workers intact.
  async close(): Promise<void> {}

  waitForJobs(...args: Parameters<ShimTestQueue<D, R>['waitForJobs']>) {
    return this.#inner.waitForJobs(...args)
  }

  /** Always forced: test workers hold no locks, so there is no active job worth refusing for. */
  obliterate(_opts?: { force?: boolean }) {
    return obliterateTestQueue(this.#inner)
  }

  upsertJobScheduler(id: string, repeat: unknown, template?: unknown) {
    return this.#inner.upsertJobScheduler(id, repeat as any, template as any)
  }

  removeJobScheduler(id: string) {
    return this.#inner.removeJobScheduler(id)
  }

  getJobScheduler(id: string) {
    return this.#inner.getJobScheduler(id)
  }
  getRepeatableJobs() {
    return this.#inner.getRepeatableJobs()
  }
  readStream(jobId: string, opts?: Record<string, unknown>) {
    return this.#inner.readStream(jobId, opts as any)
  }

  signal(jobId: string, name: string, data?: unknown) {
    return this.#inner.signal(jobId, name, data)
  }

  getDeadLetterJobs(...args: Parameters<ShimTestQueue<D, R>['getDeadLetterJobs']>) {
    return this.#inner.getDeadLetterJobs(...args)
  }

  getDeadLetterJob(...args: Parameters<ShimTestQueue<D, R>['getDeadLetterJob']>) {
    return this.#inner.getDeadLetterJob(...args)
  }

  removeDeadLetterJob(jobId: string) {
    return this.#inner.removeDeadLetterJob(jobId)
  }

  replayDeadLetterJob(jobId: string) {
    return this.#inner.replayDeadLetterJob(jobId)
  }
}

export class Worker<D = any, R = any> extends TestWorker<D, R> {
  constructor(
    queueNameOrQueue: string | Queue<D, R>,
    processor: ((job: any) => Promise<R> | R) | ((jobs: any[]) => Promise<R[]>),
    options?: {
      concurrency?: number
      limiter?: { max: number; duration: number }
      tokenLimiter?: { maxTokens: number; duration: number; scope?: string }
      deadLetterQueue?: { name: string }
      lockDuration?: number
      stalledInterval?: number
      batch?: { size: number; timeout?: number }
    },
  ) {
    const queueName =
      typeof queueNameOrQueue === 'string' ? queueNameOrQueue : queueNameOrQueue.name
    const queue = getOrCreateQueue(queueName, {
      deadLetterQueue: options?.deadLetterQueue,
    }) as ShimTestQueue<D, R>
    // scope is production-only routing TestWorkerOptions.tokenLimiter doesn't accept; intentionally dropped
    const tokenLimiterOpts = options?.tokenLimiter
      ? { maxTokens: options.tokenLimiter.maxTokens, duration: options.tokenLimiter.duration }
      : undefined
    // glide-mq's TestWorker batches natively and settles a BatchError per job. `timeout: 0`
    // dispatches whatever is waiting immediately instead of holding a partial batch for the
    // production flush window, which would add that window to every flushed add.
    const batch = options?.batch ? { size: options.batch.size, timeout: 0 } : undefined
    super(queue, wrapTestWorkerProcessor(processor as (job: any) => Promise<R> | R) as any, {
      concurrency: clampTestWorkerConcurrency(options?.concurrency),
      deadLetterQueue: options?.deadLetterQueue,
      ...(batch && { batch }),
      ...(tokenLimiterOpts && { tokenLimiter: tokenLimiterOpts }),
    })
  }
}
