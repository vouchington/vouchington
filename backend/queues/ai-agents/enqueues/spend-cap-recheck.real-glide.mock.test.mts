import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { SPEND_CAP_RECHECK_JOB_NAME } from '../config.mts'
import type { SpendCapRecheckJobData } from '../types.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('spend-cap recheck priority-zero scheduling with real GlideMQ', () => {
  it('wakes an idle coordinator worker after its delay elapses', async () => {
    const queueName = `ai_spend_cap_recheck_wake_${randomUUID()}`
    const queue = new Queue<SpendCapRecheckJobData>(queueName, connection)
    const processedIds: string[] = []
    const worker = new Worker<SpendCapRecheckJobData>(
      queueName,
      async (job: Job<SpendCapRecheckJobData>) => {
        processedIds.push(job.id)
      },
      { ...connection, blockTimeout: 10_000, promotionInterval: 25 },
    )

    try {
      await worker.waitUntilReady()
      const drained = Promise.withResolvers<void>()
      worker.once('drained', drained.resolve)
      const readinessJob = await queue.add(
        SPEND_CAP_RECHECK_JOB_NAME,
        { day: '2026-08-16', generation: randomUUID() },
        { jobId: randomUUID(), priority: 0 },
      )
      if (!readinessJob) throw new Error('Expected spend-cap readiness job')
      await drained.promise
      expect(processedIds).toContain(readinessJob.id)

      const job = await queue.add(
        SPEND_CAP_RECHECK_JOB_NAME,
        { day: '2026-08-16', generation: randomUUID() },
        { delay: 500, jobId: randomUUID(), priority: 0 },
      )
      if (!job) throw new Error('Expected delayed spend-cap coordinator')
      await expect(job.getState()).resolves.toBe('delayed')

      await vi.waitFor(() => expect(processedIds).toContain(job.id), { timeout: 3_000 })
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
