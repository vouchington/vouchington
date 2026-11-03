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
    { offsetMs: -60_000, preserved: false },
    { offsetMs: 60_000, preserved: true },
  ])(
    'preserves a 304 snapshot only when it is within retention (offset $offsetMs ms)',
    async ({ offsetMs, preserved }) => {
      const suffix = randomUUID()
      const url = (await addUrl(user.id, `https://content-boundary-${suffix}.example.com/`))!
      const crawler = await createCrawler(user, {
        hostname_id: url.hostname.id,
        crawler_type: 'fetch',
      })
      const hostname = (await getUrlHostnameCrawlerDetailsById(url.hostname.id))!
      const urlRecord = (await getUrlById(url.id))!
      const now = new Date()
      const uploadedAt = new Date(
        now.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000 + offsetMs,
      )
      const crawl = await createCrawl(url.id, crawler.id)
      const previousHash = Buffer.alloc(32, 7)
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
        previousHtmlSha256: previousHash,
        previousHtmlSnapshotUploadedAt: uploadedAt,
        url: urlRecord,
      })

      expect(updated.html_sha256).toEqual(preserved ? previousHash : null)
      expect(updated.html_snapshot_uploaded_at).toEqual(preserved ? uploadedAt : null)
    },
  )
})
