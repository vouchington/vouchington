import { beforeAll, describe, expect, it, vi } from 'vitest'
import { addUrl } from '@services/urls/upsert'
import { getUrlById } from '@services/urls/get'
import { createCrawler } from '@services/crawlers'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createCrawl } from '../create.mts'
import { getCrawlById } from '../get.mts'
import * as crawlEmbedEnqueues from '@queues/crawl-embeds/enqueues'

const enqueueError = new Error('test crawl embed enqueue failure')
Object.assign(enqueueError, { tags: { suppressLogging: true } })

import { persistCrawlContent } from './content.mts'

describe('persistCrawlContent embed handoff', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns the persisted pending crawl when its embed enqueue fails', async () => {
    const enqueueSpy = vi
      .spyOn(crawlEmbedEnqueues, 'enqueueCrawlEmbed')
      .mockRejectedValueOnce(enqueueError)
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://enqueue-${random}.example.com/page`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const hostname = (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!
    const urlRecord = (await getUrlById(url!.id))!
    const endpoint = 'https://www.youtube.com/oembed?url=video-123'

    const updated = await persistCrawlContent({
      crawlId: crawl.id,
      hostname,
      htmlResult: {
        request_headers: {},
        response_headers: {},
        response_status_code: 200,
        crawl_started_at: new Date(),
        crawl_completed_at: new Date(),
        content: { title: 'Test', meta: {}, links: {}, content: 'Crawled body' },
        embedMetadata: {
          kind: 'article',
          requestedUrl: urlRecord.url,
          resolvedUrl: urlRecord.url,
          title: 'Test',
          description: null,
          author: null,
          provider: null,
          thumbnail: null,
          player: null,
        },
        embedOEmbedUrl: endpoint,
      },
      previousHtmlSha256: null,
      previousHtmlSnapshotUploadedAt: null,
      url: urlRecord,
    })

    expect(updated.id).toBe(crawl.id)
    expect(enqueueSpy).toHaveBeenCalledOnce()
    const stored = await getCrawlById(crawl.id, url!.id)
    expect(stored!.markdown).toBe('Crawled body')
    expect(stored!.embed_oembed_url).toBe(endpoint)
    expect(stored!.embed_oembed_resolved_at).toBeNull()
  })
})
