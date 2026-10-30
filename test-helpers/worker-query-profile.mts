import { EventEmitter } from 'node:events'
import {
  Worker as SdkWorker,
  getOrCreateQueue,
  type TestWorkerProcessor,
  type WorkerOptions,
} from '@vouchington/worker-runtime/testing'
import {
  createWorkerQueryProfileHelpers,
  type ProfileObserver,
} from 'vouchington-tooling/worker-query-profile'
import { recordRequestQueryProfileViolation } from '../backend/test-helpers/api/request-query-profile-violations.mts'
import { runIndependentWorker } from '../backend/test-helpers/query-profiles.mts'

const helpers = createWorkerQueryProfileHelpers({
  profiles: { runIndependentWorker },
  recordViolation: recordRequestQueryProfileViolation,
  recordKind: 'pg-worker-profile',
  diagnosticsEnvVar: 'VITEST_DIAGNOSTICS',
})

/**
 * Vitest inlines `@vouchington/worker-runtime` into this alias and leaves
 * `vouchington-tooling` external. `helpers.Worker` would therefore listen on a different
 * in-memory queue than `Queue` from this module. `wrapProcessor` is the published seam and
 * does not own that queue.
 */
class ProfiledTestWorker<D = unknown, R = unknown> extends SdkWorker<D, R> {
  private readonly profileObservers: Set<ProfileObserver>

  constructor(
    queueNameOrQueue: ConstructorParameters<typeof SdkWorker<D, R>>[0],
    processor: ConstructorParameters<typeof SdkWorker<D, R>>[1],
    options?: WorkerOptions<R>,
  ) {
    const queueName =
      typeof queueNameOrQueue === 'string' ? queueNameOrQueue : queueNameOrQueue.name
    const observers = new Set<ProfileObserver>()
    const { wrapProcessor: callerWrap, ...sdkOptions } = options ?? {}
    // The testing Worker accepts a batch processor that its own wrapper type does not name.
    const single = processor as TestWorkerProcessor<R>
    const base = callerWrap?.(single, queueName) ?? processor
    super(
      queueNameOrQueue,
      helpers.wrapProcessor(base, queueName, profile => {
        for (const observer of [...observers]) {
          if (!observers.has(observer)) continue
          observer(profile)
        }
        return undefined
      }) as typeof processor,
      sdkOptions,
    )
    this.profileObservers = observers
  }

  observeQueryProfiles(observer: ProfileObserver): () => void {
    this.profileObservers.add(observer)
    return () => {
      this.profileObservers.delete(observer)
    }
  }
}

/** In-memory QueueEvents boundary backed by the same queue as the profiled test worker. */
class ProfiledTestQueueEvents extends EventEmitter {
  private readonly queue: ReturnType<typeof getOrCreateQueue>
  private readonly completed: (job: { id: string }) => void
  private readonly failed: (job: { id: string }) => void
  private readonly removed: (jobId: string) => void

  constructor(queueName: string) {
    super()
    this.queue = getOrCreateQueue(queueName)
    this.completed = job => this.emit('completed', { jobId: job.id })
    this.failed = job => this.emit('failed', { jobId: job.id })
    this.removed = jobId => this.emit('removed', { jobId })
    this.queue.on('completed', this.completed)
    this.queue.on('failed', this.failed)
    this.queue.on('removed', this.removed)
  }

  waitUntilReady(): Promise<void> {
    return Promise.resolve()
  }

  async close(): Promise<void> {
    this.queue.off('completed', this.completed)
    this.queue.off('failed', this.failed)
    this.queue.off('removed', this.removed)
    this.removeAllListeners()
  }
}

// In-memory glide-mq test double. The explicit Worker is the configured profiling adapter.
// oxlint-disable-next-line import/export
export * from '@vouchington/worker-runtime/testing'
export { ProfiledTestWorker as Worker, ProfiledTestQueueEvents as QueueEvents }
