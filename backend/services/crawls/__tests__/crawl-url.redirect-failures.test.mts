import { CrawlerTimeoutError } from '@modules/on-error/errors'
import { createCrawler } from '@services/crawlers'
import { addUrl } from '@services/urls/upsert'
import { createTestUser, getLatestCrawlRedirectStatus } from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCrawl } from '../create.mts'
import { handleCrawlRedirect, hasRedirectStatusRecorded } from '../crawl-url/redirects.mts'
import type { CrawlerHtmlResult } from '@services/crawler-html/types'
import type { PrivateUser } from '@services/users/types'

let user: PrivateUser

describe('crawl-url redirect failures', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  it('preserves the source redirect status when the target crawl fails', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `redirect-target-fails-${random}.example.com`
    const originalUrl = await addUrl(user.id, `https://${hostname}/old`)

    const crawler = await createCrawler(user, {
      crawler_type: 'fetch',
      hostname_id: originalUrl!.hostname.id,
    })
    const crawl = await createCrawl(originalUrl!.id, crawler.id)
    const timeout = new CrawlerTimeoutError(`https://${hostname}/new`, 10_000, 10_001)

    await expect(
      handleCrawlRedirect({
        crawlId: crawl.id,
        htmlResult: createMockCrawlerResult(302, `https://${hostname}/new`),
        hopCount: 0,
        runCrawlUrl: () => Promise.reject(timeout),
        url: originalUrl!,
        visitedUrls: new Set([originalUrl!.url]),
      }),
    ).rejects.toBe(timeout)
    expect(hasRedirectStatusRecorded(timeout)).toBe(true)

    const status = await getLatestCrawlRedirectStatus(originalUrl!.id)

    expect(status).toMatchObject({
      networkError: null,
      responseStatusCode: 302,
    })
    expect(status!.redirectUrlId).not.toBeNull()
  })
})

function createMockCrawlerResult(statusCode: number, location: string): CrawlerHtmlResult {
  return {
    content: {
      content: 'Test content',
      links: {},
      meta: {},
      title: 'Test',
    },
    crawl_completed_at: new Date(),
    crawl_started_at: new Date(),
    request_headers: { 'User-Agent': 'test' },
    response_headers: { location },
    response_status_code: statusCode,
  }
}
