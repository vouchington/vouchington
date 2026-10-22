import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job, type JobOptions, type WorkerOptions } from 'glide-mq'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

export type RealGlideConnection = Pick<WorkerOptions, 'connection' | 'prefix'>
export type RealGlideProcessor = (job: Job) => Promise<unknown>
type Terminal = 'completed' | 'failed'
type JobDefinition = { readonly name: string; readonly options: Readonly<JobOptions> }

export type RealGlideBackgroundHarness<TJob extends JobDefinition> = {
  queue: Queue
  add(job: TJob, data: object, options?: JobOptions): Promise<Job>
  settled(job: { id: string }): Promise<Terminal>
  activated(job: { id: string }, times: number): Promise<void>
  stalledJobIds: readonly string[]
  close(): Promise<void>
}

/** Owns an isolated real GlideMQ queue and its event-based worker lifecycle. */
export async function startRealGlideBackgroundLifecycle<TJob extends JobDefinition>(options: {
  queueNamePrefix: string
  connection: RealGlideConnection
  processor: RealGlideProcessor
  workers?: number
  concurrency?: number
  workerOptions?: Partial<WorkerOptions>
}): Promise<RealGlideBackgroundHarness<TJob>> {
  const { connection, processor, workers = 1, concurrency = 1 } = options
  const queueName = `${options.queueNamePrefix}_${randomUUID()}`
  const queue = new Queue(queueName, connection)
  const pending = new Map<string, PromiseWithResolvers<Terminal>>()
  const deferredFor = (id: string) => {
    const existing = pending.get(id)
    if (existing) return existing
    const created = Promise.withResolvers<Terminal>()
    pending.set(id, created)
    return created
  }
  const stalledJobIds: string[] = []
  const activations = new Map<string, number>()
  const activationWaiters: { id: string; times: number; resolve: () => void }[] = []
  const started = Array.from(
    { length: workers },
    () =>
      new Worker(queueName, processor, {
        ...connection,
        // A graceful close waits out the in-flight blocking read, so keep that read short.
        blockTimeout: 1_000,
        promotionInterval: 50,
        concurrency,
        ...options.workerOptions,
      }),
  )
  for (const worker of started) {
    worker.on('error', () => undefined)
    worker.on('stalled', jobId => stalledJobIds.push(jobId))
    worker.on('active', (_job, jobId) => {
      const count = (activations.get(jobId) ?? 0) + 1
      activations.set(jobId, count)
      for (const waiter of activationWaiters) {
        if (waiter.id === jobId && count >= waiter.times) waiter.resolve()
      }
    })
    worker.on('completed', job => deferredFor(job.id).resolve('completed'))
    worker.on('failed', job => {
      if (job) deferredFor(job.id).resolve('failed')
    })
  }
  await Promise.all(started.map(worker => worker.waitUntilReady()))
  return {
    queue,
    stalledJobIds,
    add: async (job, data, jobOptions) => {
      const added = await queue.add(job.name, data, { ...job.options, ...jobOptions })
      if (!added) throw new Error(`Expected ${job.name} to be added`)
      return added
    },
    settled: job => waitForRealGlideEvent(deferredFor(job.id).promise, `GlideMQ job ${job.id}`),
    activated: (job, times) => {
      if ((activations.get(job.id) ?? 0) >= times) return Promise.resolve()
      const waiting = Promise.withResolvers<void>()
      activationWaiters.push({ id: job.id, times, resolve: waiting.resolve })
      return waitForRealGlideEvent(waiting.promise, `GlideMQ job ${job.id} activation ${times}`)
    },
    close: async () => {
      try {
        await Promise.all(started.map(worker => worker.close(true)))
      } finally {
        try {
          await queue.obliterate({ force: true })
        } finally {
          await queue.close()
        }
      }
    },
  }
}
