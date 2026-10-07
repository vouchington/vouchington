import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { createCrawler } from './create-crawler.mts'
import { getCrawlerById } from './get.mts'
import { updateCrawler } from './update-crawler.mts'

describe('crawler updates in a borrowed transaction', () => {
  it('returns an uncommitted crawler for a no-op update', async () => {
    const user = await createTestUser()
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-transaction-${crypto.randomUUID()}.example.com`,
    })
    let crawlerId: string
    {
      await using query = await beginTransaction()
      const crawler = await createCrawler(
        user,
        { hostname_id: hostnameId, crawler_type: 'fetch' },
        { query },
      )
      crawlerId = crawler.id
      await expect(updateCrawler(user, crawler.id, {}, { query })).resolves.toEqual(crawler)
    }
    await expect(getCrawlerById(crawlerId)).resolves.toBeNull()
  })
})
