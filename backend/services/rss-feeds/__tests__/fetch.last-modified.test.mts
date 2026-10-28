import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { persistRssFeedCrawlAndMetadata } from '../crawls.mts'
import { createRssFeed } from '../create.mts'
import { getRssFeedById } from '../get.mts'

describe('RSS crawl Last-Modified metadata', () => {
  it('persists a two-digit year and numeric timezone', async () => {
    const suffix = randomUUID()
    const topic = await createTestTopic({ hostname: `header-${suffix}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/header-${suffix}.xml`,
      topic_id: topic.id,
      title: `Header ${suffix}`,
    })

    await persistRssFeedCrawlAndMetadata({
      rssFeedId: feed.id,
      responseCode: 304,
      headers: { etag: null, lastModified: 'Sun, 06 Nov 94 08:49:37 +0000' },
    })

    expect((await getRssFeedById(feed.id))?.last_modified_at?.toISOString()).toBe(
      '1994-11-06T08:49:37.000Z',
    )
  })
})
