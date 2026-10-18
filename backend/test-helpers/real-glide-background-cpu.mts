import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job, type JobOptions, type WorkerOptions } from 'glide-mq'
import type { BackgroundCpuJobDefinition } from '@queues/background-cpu/types'

type Connection = Pick<WorkerOptions, 'connection' | 'prefix'>
type JobBody = (job: Job) => unknown
type Terminal = 'completed' | 'failed'

export type BackgroundCpuHarness = {
  queue: Queue
  /** Enqueues a registered job with its registry options, so groups and limits apply as in production. */
  add(job: BackgroundCpuJobDefinition, data: object, options?: JobOptions): Promise<Job>
  /** Resolves with the job's terminal state, from a worker's own event. */
  settled(job: { id: string }): Promise<Terminal>
  /** Resolves once a worker has started the job `times` times, however each start ended. */
  activated(job: { id: string }, times: number): Promise<void>
  /** Ids of jobs a worker reported as stalled. */
  stalledJobIds: readonly string[]
  close(): Promise<void>
}

export type BackgroundCpuHarnessOptions = {
  connection: Connection
  /** Probe bodies for queue ordering tests; production handler routing is tested separately. */
  bodies: Record<string, JobBody>
  workers?: number
  concurrency?: number
  workerOptions?: Partial<WorkerOptions>
}

/**
 * Real GlideMQ on an isolated queue for scheduling, grouping, and lock semantics. Business bodies
 * are probes; this helper deliberately does not replace the production handler map.
 */
export async function startBackgroundCpuHarness(
  options: BackgroundCpuHarnessOptions,
): Promise<BackgroundCpuHarness> {
  const { connection, bodies, workers = 1, concurrency = 1 } = options
  const queueName = `background_cpu_harness_${randomUUID()}`
  const queue = new Queue(queueName, connection)
  const processor = async (job: Job): Promise<unknown> => {
    const body = bodies[job.name]
    if (!body) throw new Error(`No queue-test probe for ${job.name}`)
    return body(job)
  }
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
