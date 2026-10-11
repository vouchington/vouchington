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
import { wrapTestWorkerProcessor } from './glide-mq-vitest-flush.mts'
import {
  clampTestWorkerConcurrency,
  getOrCreateQueue,
  type ShimTestQueue,
} from './glide-mq-vitest-internals.mts'
export { ShimTestQueue as Queue } from './glide-mq-vitest-internals.mts'

export class Worker<D = any, R = any> extends TestWorker<D, R> {
  constructor(
    queueNameOrQueue: string | ShimTestQueue<D, R>,
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
