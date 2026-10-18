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
    new Date('2024-01-31T23:59:59.999Z'),
    new Date('2024-02-01T00:00:00.001Z'),
    new Date('2024-02-29T23:59:59.999Z'),
    new Date('2024-03-01T00:00:00.001Z'),
    new Date('2024-12-31T23:59:59.999Z'),
    new Date('2025-01-01T00:00:00.001Z'),
  ])('uses the inclusive seven-day cutoff at %s', async now => {
    const cutoff = now.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000

    for (const delta of [-1, 0, 1]) {
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
        etag: `boundary-${delta}`,
        last_modified_at: lastModifiedAt,
      })
      await updateCrawl(previous.id, url.id, {
        completed_at: new Date(cutoff + delta),
        html_sha256: Buffer.alloc(32, 1),
        html_snapshot_uploaded_at: new Date(cutoff + delta),
      })

      const result = await loadCrawlPreflight(url.id, 0, new Set(), {
        ignoreRobotsTxt: true,
        dependencies: { now: () => now },
      })

      expect(result?.etag).toBe(delta < 0 ? undefined : `boundary-${delta}`)
      expect(result?.lastModifiedAt).toBe(delta < 0 ? undefined : lastModifiedAt.toISOString())
    }
  })

  it('rejects an invalid snapshot decision time before creating a crawl', async () => {
    const url = (await addUrl(user.id, `https://preflight-invalid-${randomUUID()}.example.com/`))!
    await updateUrlHostname(url.hostname.id, { is_crawlable: true })
    await createCrawler(user, { hostname_id: url.hostname.id, crawler_type: 'fetch' })

    await expect(
      loadCrawlPreflight(url.id, 0, new Set(), {
        ignoreRobotsTxt: true,
        dependencies: { now: () => new Date(Number.NaN) },
      }),
    ).rejects.toThrow('Invalid HTML snapshot decision time')
  })
})
