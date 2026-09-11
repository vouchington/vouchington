import { it, expect, beforeAll, describe } from 'vitest'
import { createCrawler } from './index.mts'
import { deleteCrawler } from './delete.mts'
import { getCrawlerById } from './get.mts'
import { createTestUser, insertTestUrlHostname, insertTestUrl } from '@voucha/test-helpers'
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

describe('delete.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('deleteCrawler soft deletes a crawler', async () => {
    const url = await createTestUrlWithNewHostname(
      `https://crawler-delete-${Math.random().toString(36).slice(2)}.example.com/test`,
    )
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    await deleteCrawler(user, crawler.id)

    const retrieved = await getCrawlerById(crawler.id)
    expect(retrieved).toBeNull()
  })

  it('deleteCrawler handles already deleted crawler', async () => {
    const url = await createTestUrlWithNewHostname(
      `https://crawler-delete-twice-${Math.random().toString(36).slice(2)}.example.com/test`,
    )
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    await deleteCrawler(user, crawler.id)
    await deleteCrawler(user, crawler.id) // Should not throw

    const retrieved = await getCrawlerById(crawler.id)
    expect(retrieved).toBeNull()
  })
})
