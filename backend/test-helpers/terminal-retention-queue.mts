import { QueueEvents, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { psql } from '../queues/psql/queues.mts'
import type { TerminalActivityRetentionData } from '../queues/psql/types.mts'
import { OwnedJobWorker } from './psql-owned-job-worker.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

type QueueJobEvent = { jobId?: string }

/** Real `psql` worker for one test. Production enqueue owns job ids and options. */
export async function openTerminalRetentionQueueForTest(
  processor: (job: Job<TerminalActivityRetentionData>) => Promise<unknown>,
  registerCleanup?: (close: () => Promise<void>) => void,
) {
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const watched = new Set<string>()
  const errors: unknown[] = []
  const worker = new OwnedJobWorker(
    psql.name,
    async (job: Job) => processor(job as Job<TerminalActivityRetentionData>),
    {
      ...connection,
      blockTimeout: 100,
      promotionInterval: 50,
      concurrency: 2,
    },
  )
  const events = new QueueEvents(psql.name, { ...connection, blockTimeout: 100 })
  const pending = new Map<string, PromiseWithResolvers<'completed' | 'failed'>>()
  worker.on('error', error => errors.push(error))
  events.on('error', error => errors.push(error))
  const settle = (jobId: string | undefined, outcome: 'completed' | 'failed') => {
    if (!jobId || !watched.has(jobId)) return
    if (outcome === 'failed') {
      void psql.getJob(jobId).then(
        job =>
          job?.getState().then(state => {
            if (state !== 'failed') return state
            worker.release(jobId)
            pending.get(jobId)?.resolve('failed')
            return state
          }),
        err => errors.push(err),
      )
      return
    }
    worker.release(jobId)
    pending.get(jobId)?.resolve('completed')
  }
  events.on('completed', (payload: QueueJobEvent) => settle(payload.jobId, 'completed'))
  events.on('failed', (payload: QueueJobEvent) => settle(payload.jobId, 'failed'))
  let closePromise: Promise<void> | undefined
  const close = () =>
    (closePromise ??= (async () => {
      try {
        await worker.close()
        await events.close()
        if (errors.length) throw new AggregateError(errors, 'Terminal retention worker errors')
      } finally {
        for (const id of watched) await (await psql.getJob(id))?.remove()
      }
    })())
  // Register ownership before readiness can reject, so partial startup cannot leak a worker.
  registerCleanup?.(close)
  try {
    await Promise.all([worker.waitUntilReady(), events.waitUntilReady()])
  } catch (err) {
    await close()
    throw err
  }
  return {
    queue: psql,
    nextTerminal: (jobId: string) => {
      watched.add(jobId)
      worker.admit(jobId)
      const next = Promise.withResolvers<'completed' | 'failed'>()
      pending.set(jobId, next)
      return waitForRealGlideEvent(next.promise, `terminal retention ${jobId}`)
    },
    close,
  }
}
