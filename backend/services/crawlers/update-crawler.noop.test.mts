import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { createCrawler } from './create-crawler.mts'
import { updateCrawler } from './update-crawler.mts'

describe('crawler no-op updates', () => {
  it('returns the existing crawler when no fields change', async () => {
    const user = await createTestUser()
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-noop-${crypto.randomUUID()}.example.com`,
    })
    const crawler = await createCrawler(user, { hostname_id: hostnameId, crawler_type: 'fetch' })
    await expect(updateCrawler(user, crawler.id, {})).resolves.toEqual(crawler)
  })

  it('rejects a no-op update for an unknown crawler', async () => {
    const user = await createTestUser()
    const id = crypto.randomUUID()
    await expect(updateCrawler(user, id, {})).rejects.toThrow(`Crawler not found: ${id}`)
  })
})
