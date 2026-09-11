import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  insertTestCrawl,
  insertTestCrawlChunksBulk,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { assertPlaywrightWebSearchSeedData } from './playwright-seed-assertions.mts'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

describe('assertPlaywrightWebSearchSeedData', () => {
  it('rejects an otherwise eligible crawl whose UUID predates the recency cutoff', async () => {
    const token = randomUUID().replaceAll('-', '')
    const hostname = `stale-playwright-seed-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, crawlable: true })
    const urlId = await insertTestUrl({ url: `https://${hostname}/${token}`, hostnameId })
    const now = new Date()
    const staleCrawlId = getMinUUIDv7ForDate(new Date(now.getTime() - THIRTY_DAYS_MS - 1))
    await insertTestCrawl({
      id: staleCrawlId,
      urlId,
      statusCode: 200,
      markdown: token,
      completedAt: now,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId: staleCrawlId,
        orderIndex: 0,
        markdown: token,
        contentSha256: randomBytes(32).toString('hex'),
      },
    ])

    await expect(assertPlaywrightWebSearchSeedData(token, now)).rejects.toThrow(
      'Playwright seed data is incomplete: web search content snippet fixture',
    )
  })
})
