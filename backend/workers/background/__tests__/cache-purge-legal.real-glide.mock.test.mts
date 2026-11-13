import { Worker, type Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import { background } from '@queues/background/queues'
import { waitForRealGlideEvent } from '../../../test-helpers/real-glide-terminal-deadline.mts'
import { enqueueLegalRemovalPurgeCacheTag } from '@queues/cache-purge/enqueues'

// The URL path selects a random GlideMQ key prefix, isolating this test's queue namespace.
const isolatedPrefix = vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`).toString()
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  return `voucha_qdb_${url.pathname.slice(1)}`
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('legal removal purge admission through real GlideMQ', () => {
  afterAll(() => vi.unstubAllEnvs())

  it('keeps a second legal purge while the first is active and runs it after the first settles', async () => {
    expect(workerQueuePrefix).toBe(isolatedPrefix)
    const firstIntentId = crypto.randomUUID()
    const secondIntentId = crypto.randomUUID()
    const firstStarted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const secondCompleted = Promise.withResolvers<void>()
    const processed: string[] = []
    const worker = new Worker(
      background.name,
      async (job: Job) => {
        processed.push(job.id)
        if (processed.length === 1) {
          firstStarted.resolve()
          await releaseFirst.promise
        }
      },
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 1,
        blockTimeout: 1000,
        promotionInterval: 25,
      },
    )

    try {
      await worker.waitUntilReady()
      await enqueueLegalRemovalPurgeCacheTag(firstIntentId)
      await waitForRealGlideEvent(firstStarted.promise, 'first legal purge activation')
      await enqueueLegalRemovalPurgeCacheTag(secondIntentId)

      const jobs = await background.searchJobs({ name: CACHE_PURGE_TAGS_JOB.name })
      const first = jobs.find(
        job => job.opts.deduplication?.id === `cache-purge:legal-removal:${firstIntentId}`,
      )
      const second = jobs.find(
        job => job.opts.deduplication?.id === `cache-purge:legal-removal:${secondIntentId}`,
      )
      expect(first).toMatchObject({ data: { tags: ['legal-removal'] } })
      expect(second).toMatchObject({ data: { tags: ['legal-removal'] } })
      expect(first?.id).not.toBe(second?.id)
      if (!second) throw new Error('Second legal purge was not admitted')
      worker.on('completed', (job: Job) => {
        if (job.id === second.id) secondCompleted.resolve()
      })

      releaseFirst.resolve()
      await waitForRealGlideEvent(secondCompleted.promise, 'second legal purge completion')
      expect(new Set(processed).size).toBe(2)
    } finally {
      releaseFirst.resolve()
      await worker.close(true)
      await background.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(background)
    }
  })
})
