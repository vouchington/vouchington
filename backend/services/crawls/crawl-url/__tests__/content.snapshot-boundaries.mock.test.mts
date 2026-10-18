import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { getUrlById } from '@services/urls/get'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { createCrawl } from '../../create.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../../constants.mts'
import type { CrawlHtmlFetchResult } from '../types.mts'

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: {
    send: vi.fn<VitestLooseMock>(),
  } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

import { persistCrawlContent } from '../content.mts'

let user: PrivateUser

describe('crawl content snapshot retention', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  it.each([
    new Date('2024-01-31T23:59:59.999Z'),
    new Date('2024-02-01T00:00:00.001Z'),
    new Date('2024-02-29T23:59:59.999Z'),
    new Date('2024-03-01T00:00:00.001Z'),
    new Date('2024-12-31T23:59:59.999Z'),
    new Date('2025-01-01T00:00:00.001Z'),
  ])('preserves 304 snapshots at the inclusive seven-day cutoff at %s', async now => {
    const suffix = randomUUID()
    const url = (await addUrl(user.id, `https://content-boundary-${suffix}.example.com/`))!
    const crawler = await createCrawler(user, {
      hostname_id: url.hostname.id,
      crawler_type: 'fetch',
    })
    const hostname = (await getUrlHostnameCrawlerDetailsById(url.hostname.id))!
    const urlRecord = (await getUrlById(url.id))!
    const cutoff = now.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000

    for (const delta of [-1, 0, 1]) {
      const crawl = await createCrawl(url.id, crawler.id)
      const previousHash = Buffer.alloc(32, delta + 2)
      const uploadedAt = new Date(cutoff + delta)
      const result: CrawlHtmlFetchResult = {
        request_headers: { 'User-Agent': 'test' },
        response_headers: {},
        response_status_code: 304,
        crawl_started_at: now,
        crawl_completed_at: now,
        content: undefined,
        htmlFile: undefined,
      }
      const updated = await persistCrawlContent({
        crawlId: crawl.id,
        hostname,
        htmlResult: result,
        options: { dependencies: { now: () => now } },
        previousHtmlSha256: previousHash,
        previousHtmlSnapshotUploadedAt: uploadedAt,
        url: urlRecord,
      })

      expect(updated.html_sha256).toEqual(delta < 0 ? null : previousHash)
      expect(updated.html_snapshot_uploaded_at).toEqual(delta < 0 ? null : uploadedAt)
    }
  })

  it('rejects an invalid snapshot decision time', async () => {
    const url = (await addUrl(user.id, `https://content-invalid-${randomUUID()}.example.com/`))!
    const crawler = await createCrawler(user, {
      hostname_id: url.hostname.id,
      crawler_type: 'fetch',
    })
    const hostname = (await getUrlHostnameCrawlerDetailsById(url.hostname.id))!
    const urlRecord = (await getUrlById(url.id))!
    const crawl = await createCrawl(url.id, crawler.id)
    const result: CrawlHtmlFetchResult = {
      request_headers: {},
      response_headers: {},
      response_status_code: 304,
      crawl_started_at: new Date(),
      crawl_completed_at: new Date(),
      content: undefined,
      htmlFile: undefined,
    }

    await expect(
      persistCrawlContent({
        crawlId: crawl.id,
        hostname,
        htmlResult: result,
        options: { dependencies: { now: () => new Date(Number.NaN) } },
        previousHtmlSha256: null,
        previousHtmlSnapshotUploadedAt: null,
        url: urlRecord,
      }),
    ).rejects.toThrow('Invalid HTML snapshot decision time')
  })
})
