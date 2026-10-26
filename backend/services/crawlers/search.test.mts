import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestCrawler, insertTestUrlHostname } from '@voucha/test-helpers'
import { searchCrawlers } from './search.mts'

describe('searchCrawlers', () => {
  it('includes each crawler hostname for natural-key links', async () => {
    const hostname = `crawler-list-${randomBytes(8).toString('hex')}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const crawlerId = await insertTestCrawler({
      hostnameId,
      description: 'Crawler hostname link test',
    })

    const result = await searchCrawlers({ limit: 100 })
    expect(result.results.find(crawler => crawler.id === crawlerId)).toMatchObject({
      hostname_id: hostnameId,
      hostname,
    })
  })
})
