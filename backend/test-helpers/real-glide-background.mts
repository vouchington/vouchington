import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job, type JobOptions, type WorkerOptions } from 'glide-mq'
import type { BackgroundHandler, BackgroundJobDefinition } from '@queues/background/types'
import { BACKGROUND_JOBS } from '@queues/background/enqueues/registry'

type Connection = Pick<WorkerOptions, 'connection' | 'prefix'>
type JobBody = (job: Job) => unknown
type WorkerOptionsProcessor = (job: Job) => Promise<unknown>
type Terminal = 'completed' | 'failed'

export type BackgroundHarness = {
  queue: Queue
  /** Enqueues a registered job with its registry options, so groups and limits apply as in production. */
  add(job: BackgroundJobDefinition, data: object, options?: JobOptions): Promise<Job>
  /** Resolves with the job's terminal state, from a worker's own event. */
  settled(job: { id: string }): Promise<Terminal>
  /** Resolves once a worker has started the job `times` times, however each start ended. */
  activated(job: { id: string }, times: number): Promise<void>
  /** Ids of jobs a worker reported as stalled. */
  stalledJobIds: readonly string[]
  close(): Promise<void>
}

/**
 * Real GlideMQ, real PostgreSQL pause state, and the production processor over an isolated queue.
 * The caller passes `createProcessor` (the worker package's production factory, which this shared
 * helper cannot import). Domain business handlers are replaced by `bodies`, keyed by registry job
 * name; every other registered job completes at once. The queue name is unique, so no worker fleet
 * can consume it.
 */
export async function startBackgroundHarness(options: {
  connection: Connection
  createProcessor: (handlers: ReadonlyMap<string, BackgroundHandler>) => WorkerOptionsProcessor
  bodies?: Record<string, JobBody>
  workers?: number
  concurrency?: number
  workerOptions?: Partial<WorkerOptions>
}): Promise<BackgroundHarness> {
  const { connection, bodies = {}, workers = 1, concurrency = 1 } = options
  const queueName = `background_harness_${randomUUID()}`
  const queue = new Queue(queueName, connection)
  const handlers = new Map<string, BackgroundHandler>(
    BACKGROUND_JOBS.map(job => [job.name, { job, handle: bodies[job.name] ?? (() => undefined) }]),
  )
  const processor = options.createProcessor(handlers)
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
    settled: job => deferredFor(job.id).promise,
    activated: (job, times) => {
      if ((activations.get(job.id) ?? 0) >= times) return Promise.resolve()
      const waiting = Promise.withResolvers<void>()
      activationWaiters.push({ id: job.id, times, resolve: waiting.resolve })
      return waiting.promise
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
