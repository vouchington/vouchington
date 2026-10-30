import { QueueEvents, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { psql } from '@queues/psql/queues'
import type { AIRetentionContinuationData } from '@queues/psql/types'
import { OwnedJobWorker } from './psql-owned-job-worker.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

type QueueJobEvent = { jobId?: string }

/** Real `psql` worker for one test. Production enqueue owns job ids and options. */
export async function openAIRetentionContinuationHarness(
  process: (job: Job<AIRetentionContinuationData>) => Promise<unknown>,
) {
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const watched = new Set<string>()
  const failures: Error[] = []
  const failedAttempts: Error[] = []
  const worker = new OwnedJobWorker(
    psql.name,
    async (job: Job) => process(job as Job<AIRetentionContinuationData>),
    {
      ...connection,
      concurrency: 2,
      // Same ranked-fixture cadence as real-glide-background-lifecycle/domain-cap.
      blockTimeout: 100,
      promotionInterval: 50,
    },
  )
  const events = new QueueEvents(psql.name, { ...connection, blockTimeout: 100 })
  const pending = new Map<string, PromiseWithResolvers<void>>()
  worker.on('error', error => {
    failures.push(error)
    for (const wait of pending.values()) wait.reject(error)
  })
  events.on('error', error => {
    failures.push(error instanceof Error ? error : new Error(String(error)))
  })
  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job || !watched.has(job.id)) return
    failedAttempts.push(error)
  })
  const onCompleted = (payload: QueueJobEvent) => {
    if (!payload.jobId) return
    pending.get(payload.jobId)?.resolve()
    worker.release(payload.jobId)
  }
  const onFailed = (payload: QueueJobEvent) => {
    if (!payload.jobId) return
    const jobId = payload.jobId
    void psql.getJob(jobId).then(
      job =>
        job?.getState().then(
          state => {
            if (state === 'failed') {
              worker.release(jobId)
              pending.get(jobId)?.reject(failedAttempts.at(-1) ?? new Error(`${jobId} failed`))
            }
            return state
          },
          err => pending.get(jobId)?.reject(err instanceof Error ? err : new Error(String(err))),
        ),
      err => pending.get(jobId)?.reject(err instanceof Error ? err : new Error(String(err))),
    )
  }
  events.on('completed', onCompleted)
  events.on('failed', onFailed)
  let closing: Promise<void> | undefined
  const close = () => {
    closing ??= (async () => {
      try {
        await worker.close()
        await events.close()
      } finally {
        for (const id of watched) await (await psql.getJob(id))?.remove()
      }
    })()
    return closing
  }
  try {
    await Promise.all([worker.waitUntilReady(), events.waitUntilReady()])
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
      worker.admit(jobId)
      const wait = Promise.withResolvers<void>()
      pending.set(jobId, wait)
      return waitForRealGlideEvent(wait.promise, `AI retention ${jobId}`)
    },
    close,
  }
}
