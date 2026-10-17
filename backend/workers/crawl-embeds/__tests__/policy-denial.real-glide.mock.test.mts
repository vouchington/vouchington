import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { CRAWL_EMBEDS_DEFAULTS } from '@queues/crawl-embeds/config'
import { getPendingCrawlEmbed } from '@services/crawl-embeds/get-pending'
import { isCrawlEmbedBackfillCandidate } from '@voucha/test-helpers/entities/crawl-embeds'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { processCrawlEmbedsJob } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('crawl embeds policy denial through real GlideMQ', () => {
  it('completes a denied oEmbed URL once and drops it from backfill', async () => {
    const articleUrl = 'https://example.test/article'
    const urlId = await createTestUrlWithHostname()
    const crawl = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      embedMetadata: {
        kind: 'article',
        requestedUrl: articleUrl,
        resolvedUrl: articleUrl,
        title: null,
        description: null,
        author: null,
        provider: null,
        thumbnail: null,
        player: null,
      },
      // Not the article host's /services/oembed endpoint, so the embed policy denies it.
      embedOEmbedUrl: 'https://denied.example.test/oembed?url=article',
    })

    const name = `crawl_embeds_policy_${randomUUID()}`
    const queue = new Queue(name, connection)
    let attempts = 0
    const worker = new Worker(
      name,
      async (job: Job) => {
        attempts += 1
        return processCrawlEmbedsJob(job)
      },
      { ...connection, blockTimeout: 1000 },
    )
    const settled = Promise.withResolvers<{ job: Job | undefined; outcome: string }>()
    worker.on('error', () => undefined)
    worker.on('completed', job => settled.resolve({ job, outcome: 'completed' }))
    worker.on('failed', job => settled.resolve({ job, outcome: 'failed' }))
    try {
      await worker.waitUntilReady()
      const job = await queue.add(
        'resolve_crawl_oembed',
        { crawl_id: crawl.id },
        { attempts: CRAWL_EMBEDS_DEFAULTS.attempts, backoff: CRAWL_EMBEDS_DEFAULTS.backoff },
      )
      if (!job) throw new Error('Expected a queued resolve_crawl_oembed job')

      const { job: finished, outcome } = await settled.promise
      expect(outcome).toBe('completed')
      expect(finished?.id).toBe(job.id)
      expect(attempts).toBe(1)
      expect(await (await queue.getJob(job.id))?.getState()).toBe('completed')

      // The backfill selects rows with a persisted endpoint and no resolved marker; this row has one.
      expect(await getPendingCrawlEmbed(crawl.id)).toBeNull()
      expect(await isCrawlEmbedBackfillCandidate(crawl.id)).toBe(false)
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
