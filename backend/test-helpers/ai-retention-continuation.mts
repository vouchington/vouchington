import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import type { RealGlideConnection } from './real-glide-job-lifecycle.mts'
import {
  aiRetentionContinuationId,
  createAIRetentionContinuationEnqueue,
} from '@queues/psql/enqueues/ai-retention'
import type { AIRetentionContinuationData, AIRetentionFamily } from '@queues/psql/types'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

export async function openAIRetentionContinuationHarness(
  connection: RealGlideConnection,
  process: (job: Job<AIRetentionContinuationData>) => Promise<unknown>,
) {
  const queue = Object.assign(
    new Queue<AIRetentionContinuationData>(`ai_retention_${randomUUID()}`, connection),
    { priorityKind: 'ranked' as const },
  )
  const pending = new Map<string, PromiseWithResolvers<void>>()
  const failures: Error[] = []
  const failedAttempts: Error[] = []
  const worker = new Worker<AIRetentionContinuationData>(queue.name, process, {
    ...connection,
    concurrency: 2,
    // Same ranked-fixture cadence as real-glide-background-lifecycle/domain-cap.
    blockTimeout: 100,
    promotionInterval: 50,
  })
  worker.on('error', error => {
    failures.push(error)
    for (const wait of pending.values()) wait.reject(error)
  })
  worker.on('completed', job => pending.get(job.id)?.resolve())
  worker.on('failed', (job: Job<AIRetentionContinuationData> | undefined, error: Error) => {
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
        try {
          await queue.obliterate({ force: true })
        } finally {
          await queue.close()
        }
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
    queue,
    worker,
    failures,
    failedAttempts,
    enqueue: createAIRetentionContinuationEnqueue(queue),
    completed: (family: AIRetentionFamily) => {
      const wait = Promise.withResolvers<void>()
      pending.set(aiRetentionContinuationId(family), wait)
      return waitForRealGlideEvent(wait.promise, `AI retention ${family}`)
    },
    close,
  }
}
