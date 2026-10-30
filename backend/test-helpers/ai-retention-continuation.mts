import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { psql } from '@queues/psql/queues'
import type { AIRetentionContinuationData } from '@queues/psql/types'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

const AI_RETENTION_CONTINUATION_JOB_NAME = 'aiRetentionContinuation'

/** Real `psql` worker for one test. Production enqueue owns job ids and options. */
export async function openAIRetentionContinuationHarness(
  process: (job: Job<AIRetentionContinuationData>) => Promise<unknown>,
) {
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const watched = new Set<string>()
  const pending = new Map<string, PromiseWithResolvers<void>>()
  const failures: Error[] = []
  const failedAttempts: Error[] = []
  const worker = new Worker(
    psql.name,
    async (job: Job) => {
      if (job.name !== AI_RETENTION_CONTINUATION_JOB_NAME) return job.moveToDelayed(Date.now())
      watched.add(job.id)
      return process(job as Job<AIRetentionContinuationData>)
    },
    {
      ...connection,
      concurrency: 2,
      // Same ranked-fixture cadence as real-glide-background-lifecycle/domain-cap.
      blockTimeout: 100,
      promotionInterval: 50,
    },
  )
  worker.on('error', error => {
    failures.push(error)
    for (const wait of pending.values()) wait.reject(error)
  })
  worker.on('completed', job => pending.get(job.id)?.resolve())
  worker.on('failed', (job: Job | undefined, error: Error) => {
    failedAttempts.push(error)
    if (!job) return
    // GlideMQ emits failed for a retryable attempt too; inspect once on that native event.
    void job.getState().then(
      state => {
        if (state === 'failed') pending.get(job.id)?.reject(error)
      },
      err => pending.get(job.id)?.reject(err),
    )
  })
  let closing: Promise<void> | undefined
  const close = () => {
    closing ??= (async () => {
      try {
        await worker.close()
      } finally {
        for (const id of watched) await (await psql.getJob(id))?.remove()
      }
    })()
    return closing
  }
  try {
    await worker.waitUntilReady()
  } catch (err) {
    await close()
    throw err
  }
  return {
    queue: psql,
    worker,
    failures,
    failedAttempts,
    completed: (jobId: string) => {
      watched.add(jobId)
      const wait = Promise.withResolvers<void>()
      pending.set(jobId, wait)
      return waitForRealGlideEvent(wait.promise, `AI retention ${jobId}`)
    },
    close,
  }
}
