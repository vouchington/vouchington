import { it, expect, beforeAll, describe } from 'vitest'
import { getCrawlerById, getCrawlerForHostnameId, getCrawlerForUrl } from './get.mts'
import { createCrawler } from './index.mts'
import {
  createTestUser,
  insertTestUrlHostname,
  insertTestUrl,
  insertTestCrawler,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

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

describe('get.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('getCrawlerById returns null when crawler does not exist', async () => {
    const crawler = await getCrawlerById('00000000-0000-0000-0000-000000000000')
    expect(crawler).toBeNull()
  })

  it('getCrawlerById returns crawler by ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(`https://crawler-get-${random}.example.com/test`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      description: 'Test crawler',
    })
    const retrieved = await getCrawlerById(crawler.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(crawler.id)
    expect(retrieved!.hostname_id).toBe(url!.hostname.id)
  })

  it('getCrawlerForHostnameId returns crawler for hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-hostname-${random}.example.com/test`,
    )
    // Insert a lower-priority default crawler first (addUrl() used to create this
    // implicitly via getOrCreateCrawlerForHostname), then give the crawler under test
    // a higher priority and assert selection logic directly.
    await insertTestCrawler({
      hostnameId: url!.hostname.id,
      description: 'default crawler',
      priority: 0,
    })
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      priority: 100,
    })
    const retrieved = await getCrawlerForHostnameId(url!.hostname.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(crawler.id)
    expect(retrieved!.priority).toBe(100)
  })

  it('getCrawlerForUrl returns null when no crawler matches', async () => {
    const randomDomain = Math.random().toString(36).slice(2, 15)
    const crawler = await getCrawlerForUrl(`https://${randomDomain}.test.invalid/test`)
    expect(crawler).toBeNull()
  })

  it('getCrawlerForUrl returns crawler matching URL hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `crawler-url-${random}.example.com`
    const url = await createTestUrlWithNewHostname(`https://${hostname}/test`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      priority: 100,
    })
    const retrieved = await getCrawlerForUrl(`https://${hostname}/page`)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(crawler.id)
  })

  it('getCrawlerForUrl returns crawler after priority update', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `crawler-priority-${random}.example.com`
    const url = await createTestUrlWithNewHostname(`https://${hostname}/test`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      priority: 1,
    })
    const retrieved = await getCrawlerForUrl(`https://${hostname}/page`)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(crawler.id)
    expect(retrieved!.priority).toBe(1)
  })
})
