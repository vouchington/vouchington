import { describe, expect, it } from 'vitest'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { crawlEmbedsQueue } from '@queues/crawl-embeds/queues'
import { OEMBED_HOST_RATE_LIMIT_MS, PRIORITY_DEFAULT } from '@queues/crawl-embeds/config'
import { backfillPendingCrawlEmbeds } from './backfill.mts'

describe('backfillPendingCrawlEmbeds', () => {
  it('enqueues valid pending crawls and skips malformed persisted endpoints', async () => {
    const embedMetadata = {
      kind: 'article',
      requestedUrl: 'https://example.test/article',
      resolvedUrl: 'https://example.test/article',
      title: null,
      description: null,
      author: null,
      provider: null,
      thumbnail: null,
      player: null,
    }
    const urlId = await createTestUrlWithHostname()
    const valid = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      embedMetadata,
      embedOEmbedUrl: 'https://api.example.test/oembed?url=article',
    })
    const invalid = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      embedMetadata,
      embedOEmbedUrl: 'not-a-url',
    })
    const validCrawlId = valid.id
    const invalidCrawlId = invalid.id

    await backfillPendingCrawlEmbeds()

    const enqueued = await readAllQueueJobs(crawlEmbedsQueue)
    expect(enqueued.filter(job => job.data.crawl_id === validCrawlId)).toMatchObject([
      {
        name: 'resolve_crawl_oembed',
        data: { crawl_id: validCrawlId },
        opts: {
          priority: PRIORITY_DEFAULT,
          deduplication: { id: `resolve_crawl_oembed__${validCrawlId}`, mode: 'simple' },
          ordering: {
            key: 'oembed:api.example.test',
            rateLimit: { max: 1, duration: OEMBED_HOST_RATE_LIMIT_MS },
          },
        },
      },
    ])
    expect(enqueued.filter(job => job.data.crawl_id === invalidCrawlId)).toEqual([])
  })
})
