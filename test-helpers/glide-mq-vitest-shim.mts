import { TestJob, TestWorker } from 'glide-mq/testing'
import { addAndFlush, addBulkAndFlush } from './glide-mq-vitest-flush.mts'
import {
  clampTestWorkerConcurrency,
  configureDeadLetterQueue,
  getDeadLetterJob,
  getDeadLetterJobs,
  getOrCreateQueue,
  removeDeadLetterJob,
  replayDeadLetterJob,
  type ShimTestQueue,
  wrapTestWorkerProcessor,
} from './glide-mq-vitest-internals.mts'
import { obliterateTestQueue } from './glide-mq-vitest-obliterate.mts'

type AnyJob = { name: string; data?: unknown; opts?: Record<string, unknown>; queueName?: string }
type AnyFlowJob = AnyJob & { children?: AnyFlowJob[] }

export class Queue<D = any, R = any> {
  readonly name: string
  #inner: ShimTestQueue<D, R>

  constructor(name: string, options?: { deadLetterQueue?: { name: string } }) {
    this.name = name
    this.#inner = getOrCreateQueue(name)
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
  close() {
    return this.#inner.close()
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

// `glide-mq/testing` does not export the error classes, and importing them from `glide-mq` would
// loop back through this shim's alias. `TestWorker` matches both by `name`, so these local classes
// behave like the real ones. Revisit once `glide-mq/testing` re-exports them.
export class BatchError extends Error {
  readonly results: unknown[]
  constructor(results: unknown[]) {
    super('Batch processing error')
    this.name = 'BatchError'
    this.results = results
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
    const queue = getOrCreateQueue(queueName) as ShimTestQueue<D, R>
    configureDeadLetterQueue(queueName, options?.deadLetterQueue)
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
      ...(batch && { batch }),
      ...(tokenLimiterOpts && { tokenLimiter: tokenLimiterOpts }),
    })
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
