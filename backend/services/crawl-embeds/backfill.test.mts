import { describe, expect, it, vi } from 'vitest'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import * as crawlEmbedEnqueues from '@queues/crawl-embeds/enqueues'
import { backfillPendingCrawlEmbeds } from './backfill.mts'

describe('backfillPendingCrawlEmbeds', () => {
  it('enqueues valid pending crawls and skips malformed persisted endpoints', async () => {
    const enqueueSpy = vi.spyOn(crawlEmbedEnqueues, 'enqueueBulkCrawlEmbeds').mockResolvedValue([])
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

    const enqueued = enqueueSpy.mock.calls.flatMap(([entries]) => entries)
    expect(enqueued).toContainEqual({
      crawlId: validCrawlId,
      endpointHostname: 'api.example.test',
    })
    expect(enqueued.some(entry => entry.crawlId === invalidCrawlId)).toBe(false)
  })
})
