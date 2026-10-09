import { randomUUID } from 'node:crypto'
import { Queue, Worker, type QueueOptions } from 'glide-mq'

export type RealGlideTerminalState = 'completed' | 'failed'

/** The worker-queue connection and prefix, passed in as `@data-stores/valkey-glide-mq` exports them. */
export type RealGlideConnection = Pick<QueueOptions, 'connection' | 'prefix'>

/**
 * An isolated real GlideMQ queue plus one worker whose outcome the test chooses. Replays a queue
 * package's production job options and waits on the worker's own terminal event, never a timer.
 * The queue name is unique per call, so it cannot consume jobs from the shared worker fleet.
 */
export type RealGlideJobLifecycle<TData> = {
  queue: Queue<TData>
  /** What the worker does with the jobs it takes next: finish them or throw. */
  setOutcome(outcome: 'complete' | 'fail'): void
  /** Resolves with the job's terminal state once the worker settles it. */
  settled(job: { id: string }): Promise<RealGlideTerminalState>
  close(): Promise<void>
}

export async function startRealGlideJobLifecycle<TData>(
  label: string,
  connection: RealGlideConnection,
): Promise<RealGlideJobLifecycle<TData>> {
  const queueName = `${label}_${randomUUID()}`
  const queue = new Queue<TData>(queueName, connection)
  let outcome: 'complete' | 'fail' = 'complete'
  // A graceful close waits out the worker's in-flight blocking read, so keep that read short.
  const worker = new Worker<TData>(
    queueName,
    async () => {
      if (outcome === 'fail') throw new Error('expected terminal job failure')
    },
    { ...connection, blockTimeout: 1000 },
  )
  const pending = new Map<string, PromiseWithResolvers<RealGlideTerminalState>>()
  const deferredFor = (id: string) => {
    const existing = pending.get(id)
    if (existing) return existing
    const created = Promise.withResolvers<RealGlideTerminalState>()
    pending.set(id, created)
    return created
  }
  worker.on('error', () => undefined)
  worker.on('completed', job => deferredFor(job.id).resolve('completed'))
  worker.on('failed', job => {
    if (job) deferredFor(job.id).resolve('failed')
  })
  await worker.waitUntilReady()
  return {
    queue,
    setOutcome: next => {
      outcome = next
    },
    settled: job => deferredFor(job.id).promise,
    close: async () => {
      try {
        await worker.close()
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
