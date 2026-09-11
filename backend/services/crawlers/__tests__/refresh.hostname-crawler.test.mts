import { expect, it, describe } from 'vitest'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import {
  updateUrlHostnameBlocked,
  insertTestUrlHostname,
  insertTestUrl,
} from '@voucha/test-helpers'
import { refreshHostnameCrawler } from '../refresh.mts'

// Uses insertTestUrlHostname/insertTestUrl (not addUrl from @services/urls) because
// @services/urls already depends on @services/crawlers for real (getOrCreateCrawlerForHostname),
// so services/crawlers must not depend back on @services/urls for tests.
async function createTestUrlWithNewHostname(
  url: string,
): Promise<{ id: string; hostname: { id: string } }> {
  const hostname = new URL(url).hostname
  const hostnameId = await insertTestUrlHostname({ hostname })
  const id = await insertTestUrl({ url, hostnameId })
  return { id, hostname: { id: hostnameId } }
}

describe('refresh.hostname-crawler', () => {
  it('refreshHostnameCrawler returns empty result for blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-blocked-${random}.example.com/page`,
    )

    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await updateUrlHostnameBlocked(url!.hostname.id, true)

    const result = await refreshHostnameCrawler(url!.hostname.id)
    expect(result.crawler_id).toBeNull()
    expect(result.url_ids_to_crawl).toHaveLength(0)
    expect(result.urls_considered).toBe(0)
  })

  it('refreshHostnameCrawler returns empty result for non-crawlable hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-noncrawlable-${random}.example.com/page`,
    )

    await updateUrlHostname(url!.hostname.id, { crawlable: false })

    const result = await refreshHostnameCrawler(url!.hostname.id)
    expect(result.crawler_id).toBeNull()
    expect(result.url_ids_to_crawl).toHaveLength(0)
  })

  it('refreshHostnameCrawler returns url candidates for valid hostname with enough URLs', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `crawler-valid-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const base = `https://${hostname}`
    await Promise.all([
      insertTestUrl({ url: `${base}/page1`, hostnameId }),
      insertTestUrl({ url: `${base}/page2`, hostnameId }),
      insertTestUrl({ url: `${base}/page3`, hostnameId }),
    ])
    await updateUrlHostname(hostnameId, { crawlable: true })

    const result = await refreshHostnameCrawler(hostnameId)
    expect(result.crawler_id).not.toBeNull()
    expect(result.url_ids_to_crawl.length).toBeGreaterThan(0)
  })
})
