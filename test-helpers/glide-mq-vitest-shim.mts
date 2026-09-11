import { TestJob, TestQueue, TestWorker } from 'glide-mq/testing'
import { addAndFlush, addBulkAndFlush } from './glide-mq-vitest-flush.mts'
import {
  attachTestJobRetry,
  clampTestWorkerConcurrency,
  configureDeadLetterQueue,
  getDeadLetterJob,
  getDeadLetterJobs,
  getOrCreateQueue,
  removeDeadLetterJob,
  replayDeadLetterJob,
  wrapTestWorkerProcessor,
  wireDeadLetterQueue,
} from './glide-mq-vitest-internals.mts'
import { obliterateTestQueue } from './glide-mq-vitest-obliterate.mts'

type AnyJob = { name: string; data?: unknown; opts?: Record<string, unknown>; queueName?: string }
type AnyFlowJob = AnyJob & { children?: AnyFlowJob[] }

export class Queue<D = any, R = any> {
  readonly name: string
  #inner: TestQueue<D, R>

  constructor(name: string, options?: { deadLetterQueue?: { name: string } }) {
    this.name = name
    this.#inner = getOrCreateQueue(name) as TestQueue<D, R>
    configureDeadLetterQueue(name, options?.deadLetterQueue)
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
  async getJob(id: string) {
    return attachTestJobRetry(this.#inner, await this.#inner.getJob(id))
  }
  async getJobs(
    type: 'waiting' | 'active' | 'delayed' | 'completed' | 'failed',
    start?: number,
    end?: number,
  ) {
    return (await this.#inner.getJobs(type, start, end)).map(job =>
      attachTestJobRetry(this.#inner, job)!,
    )
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
  close() {
    return this.#inner.close()
  }

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

  getDeadLetterJobs(start?: number, end?: number, _opts?: Record<string, unknown>) {
    return getDeadLetterJobs(this.name, start, end)
  }

  getDeadLetterJob(jobId: string, _opts?: Record<string, unknown>) {
    return getDeadLetterJob(this.name, jobId)
  }

  removeDeadLetterJob(jobId: string) {
    return removeDeadLetterJob(this.name, jobId)
  }

  replayDeadLetterJob(jobId: string) {
    return replayDeadLetterJob(this.name, jobId)
  }
}

export class BatchError extends Error {
  readonly results: unknown[]
  constructor(results: unknown[]) {
    super('Batch processing error')
    this.name = 'BatchError'
    this.results = results
  }
}

export class Worker<D = any, R = any> extends TestWorker<D, R> {
  static RateLimitError = class RateLimitError extends Error {
    constructor() {
      super('Rate limit exceeded')
      this.name = 'RateLimitError'
    }
  }
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
      batch?: { size?: number; timeout?: number }
    },
  ) {
    const queueName =
      typeof queueNameOrQueue === 'string' ? queueNameOrQueue : queueNameOrQueue.name
    const queue = getOrCreateQueue(queueName) as TestQueue<D, R>
    configureDeadLetterQueue(queueName, options?.deadLetterQueue)
    // scope is production-only routing TestWorkerOptions.tokenLimiter doesn't accept; intentionally dropped
    const tokenLimiterOpts = options?.tokenLimiter
      ? { maxTokens: options.tokenLimiter.maxTokens, duration: options.tokenLimiter.duration }
      : undefined
    // Wrap batch processors as single-job processors: the test environment
    // processes one job at a time, so we wrap the single job in an array and
    // unwrap the first result. BatchError is unwrapped so the TestWorker sees
    // the per-job error for the one job it dispatched.
    const effectiveProcessor: (job: any) => Promise<R> | R = options?.batch
      ? async (job: any) => {
          let results: R[]
          try {
            results = await (processor as (jobs: any[]) => Promise<R[]>)([job])
          } catch (err) {
            if (err instanceof BatchError && err.results[0] instanceof Error) {
              throw err.results[0]
            }
            throw err
          }
          return results[0]
        }
      : (processor as (job: any) => Promise<R> | R)
    super(queue, wrapTestWorkerProcessor(effectiveProcessor), {
      concurrency: clampTestWorkerConcurrency(options?.concurrency),
      ...(tokenLimiterOpts && { tokenLimiter: tokenLimiterOpts }),
    })
    wireDeadLetterQueue(this, queueName, options?.deadLetterQueue)
  }
}

export class FlowProducer {
  async add(flow: AnyFlowJob): Promise<void> {
    if (flow.children?.length) {
      await Promise.all(flow.children.map(child => this.add(child)))
    }
    if (!flow.queueName) return

    const queue = new Queue(flow.queueName)
    await queue.add(flow.name, flow.data, flow.opts)
  }

  async close(): Promise<void> {}
}

export class Job extends TestJob {}

export class UnrecoverableError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'UnrecoverableError'
  }
}
