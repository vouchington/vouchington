import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { addUrl } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '../../create.mts'
import { updateCrawl } from '../../update.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../../constants.mts'
import { loadCrawlPreflight } from '../preflight.mts'

let user: PrivateUser

describe('crawl preflight snapshot retention', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  it.each([
    { offsetMs: -60_000, reusable: false },
    { offsetMs: 60_000, reusable: true },
  ])(
    'reuses the previous etag only when the snapshot is within retention (offset $offsetMs ms)',
    async ({ offsetMs, reusable }) => {
      const cutoff = Date.now() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000
      const url = (await addUrl(
        user.id,
        `https://preflight-boundary-${randomUUID()}.example.com/`,
      ))!
      await updateUrlHostname(url.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: url.hostname.id,
        crawler_type: 'fetch',
      })
      const lastModifiedAt = new Date('2024-01-01T00:00:00.000Z')
      const previous = await createCrawl(url.id, crawler.id, {
        etag: 'boundary-etag',
        last_modified_at: lastModifiedAt,
      })
      await updateCrawl(previous.id, url.id, {
        completed_at: new Date(cutoff + offsetMs),
        html_sha256: Buffer.alloc(32, 1),
        html_snapshot_uploaded_at: new Date(cutoff + offsetMs),
      })

      const result = await loadCrawlPreflight(url.id, 0, new Set(), { ignoreRobotsTxt: true })

      expect(result?.etag).toBe(reusable ? 'boundary-etag' : undefined)
      expect(result?.lastModifiedAt).toBe(reusable ? '2024-01-01T00:00:00.000Z' : undefined)
    },
  )
})
