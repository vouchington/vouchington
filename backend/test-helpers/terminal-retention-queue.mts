import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { TERMINAL_ACTIVITY_RETENTION_JOB_NAME } from '../queues/psql/config.mts'
import { psql } from '../queues/psql/queues.mts'
import type { TerminalActivityRetentionData } from '../queues/psql/types.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

/** Real `psql` worker for one test. Production enqueue owns job ids and options. */
export async function openTerminalRetentionQueueForTest(
  processor: (job: Job<TerminalActivityRetentionData>) => Promise<unknown>,
  registerCleanup?: (close: () => Promise<void>) => void,
) {
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const watched = new Set<string>()
  const worker = new Worker(
    psql.name,
    async (job: Job) => {
      if (job.name !== TERMINAL_ACTIVITY_RETENTION_JOB_NAME) return job.moveToDelayed(Date.now())
      watched.add(job.id)
      return processor(job as Job<TerminalActivityRetentionData>)
    },
    {
      ...connection,
      blockTimeout: 100,
      promotionInterval: 50,
      concurrency: 2,
    },
  )
  const errors: unknown[] = []
  const pending = new Map<string, PromiseWithResolvers<'completed' | 'failed'>>()
  worker.on('error', error => errors.push(error))
  worker.on('completed', job => pending.get(job.id)?.resolve('completed'))
  worker.on('failed', (job: Job | undefined) => {
    if (!job) return
    void job
      .getState()
      .then(state => {
        // Native worker 'failed' fires for retryable attempts too; only terminal state settles.
        if (state === 'failed') pending.get(job.id)?.resolve('failed')
      })
      .catch(err => errors.push(err))
  })
  let closePromise: Promise<void> | undefined
  const close = () =>
    (closePromise ??= (async () => {
      try {
        await worker.close()
        if (errors.length) throw new AggregateError(errors, 'Terminal retention worker errors')
      } finally {
        for (const id of watched) await (await psql.getJob(id))?.remove()
      }
    })())
  // Register ownership before readiness can reject, so partial startup cannot leak a worker.
  registerCleanup?.(close)
  try {
    await worker.waitUntilReady()
  } catch (err) {
    await close()
    throw err
  }
  return {
    queue: psql,
    nextTerminal: (jobId: string) => {
      watched.add(jobId)
      const next = Promise.withResolvers<'completed' | 'failed'>()
      pending.set(jobId, next)
      return waitForRealGlideEvent(next.promise, `terminal retention ${jobId}`)
    },
    close,
  }
}
