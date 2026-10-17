import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { CRAWL_EMBEDS_DEFAULTS } from '@queues/crawl-embeds/config'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { processCrawlEmbedsJob } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('crawl embeds policy denial through real GlideMQ', () => {
  it('fails a denied oEmbed URL after exactly one attempt', async () => {
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
    const failed = Promise.withResolvers<Job | undefined>()
    worker.on('error', () => undefined)
    worker.on('failed', job => failed.resolve(job))
    try {
      await worker.waitUntilReady()
      const job = await queue.add(
        'resolve_crawl_oembed',
        { crawl_id: crawl.id },
        { attempts: CRAWL_EMBEDS_DEFAULTS.attempts, backoff: CRAWL_EMBEDS_DEFAULTS.backoff },
      )
      if (!job) throw new Error('Expected a queued resolve_crawl_oembed job')

      const settled = await failed.promise
      expect(settled?.id).toBe(job.id)
      expect(settled?.failedReason).toContain('Embed policy denied oembed URL')
      expect(attempts).toBe(1)
      expect(await (await queue.getJob(job.id))?.getState()).toBe('failed')
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
