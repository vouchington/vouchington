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
import { wrapTestWorkerProcessor, recordWorkerProfileFailure } from './glide-mq-vitest-flush.mts'
import type { WorkerQueryProfile } from '../backend/data-stores/psql/request-query-profile.mts'

type ProfileObserver = (profile: WorkerQueryProfile) => undefined
import {
  clampTestWorkerConcurrency,
  getOrCreateQueue,
  type ShimTestQueue,
} from './glide-mq-vitest-internals.mts'
export { ShimTestQueue as Queue } from './glide-mq-vitest-internals.mts'

export class Worker<D = any, R = any> extends TestWorker<D, R> {
  private readonly profileObservers: Set<ProfileObserver>

  /** Subscribe before action effects; the caller owns each live root and its descendants. */
  /** Owners register synchronously; asynchronous observer work is not supported or joined. */
  observeQueryProfiles(observer: ProfileObserver): () => void {
    this.profileObservers.add(observer)
    return () => {
      this.profileObservers.delete(observer)
    }
  }
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
    const profileObservers = new Set<ProfileObserver>()
    super(
      queue,
      wrapTestWorkerProcessor(processor as (job: any) => Promise<R> | R, queueName, profile =>
        notifyProfileObservers(profileObservers, profile),
      ) as any,
      {
        concurrency: clampTestWorkerConcurrency(options?.concurrency),
        deadLetterQueue: options?.deadLetterQueue,
        ...(batch && { batch }),
        ...(tokenLimiterOpts && { tokenLimiter: tokenLimiterOpts }),
      },
    )
    this.profileObservers = profileObservers
  }
}

function notifyProfileObservers(
  observers: Set<ProfileObserver>,
  profile: WorkerQueryProfile,
): undefined {
  for (const observer of [...observers]) {
    if (!observers.has(observer)) continue
    try {
      observer(profile)
    } catch (err) {
      recordWorkerProfileFailure(profile, 'profile-observer', err)
    }
  }
  return undefined
}
