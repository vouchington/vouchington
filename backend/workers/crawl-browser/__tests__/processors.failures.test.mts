import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as browserCrawl from '@services/browser-crawl'
import { createCrawler } from '@services/crawlers'
import { addUrl } from '@services/urls'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import {
  CrawlerConnectError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import { createReferralProgramFixture, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { searchCrawlsForUrl } from '@services/crawls/search'
import { getReferralLinkCrawlStatus } from '@voucha/test-helpers/entities/referral-links'
import {
  setTestRobotsTxtCache,
  deleteTestRobotsTxtCache,
} from '@voucha/test-helpers/entities/dispatch'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { processBrowserCrawl } from '../processors.mts'

const hostnames: string[] = []

async function fixture() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const hostname = `browser-failure-${suffix}.example.com`
  hostnames.push(hostname)
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
  const user = await createTestUser()
  const program = await createReferralProgramFixture({
    createdById: user.id,
    randomSuffix: suffix,
    hostname,
    pathname: '/ref/%',
  })
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: program.referralProgramId,
    url: `https://${hostname}/ref/${suffix}`,
  })
  const url = await addUrl(user.id, `https://${hostname}/crawl/${suffix}`)
  if (!url) throw new Error('Missing fixture URL')
  const crawler = await createCrawler(user, {
    hostname_id: url.hostname.id,
    crawler_type: 'automation',
  })
  return { url, crawler, linkId: link.id }
}

async function getBrowserCrawlReservations(urlId: string) {
  const { results } = await searchCrawlsForUrl(urlId)
  return results.toReversed().map(row => ({
    completed: row.completed_at !== null,
    status: row.response_status_code,
    networkError: row.network_error,
  }))
}

describe('browser crawl failed reservations', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await deleteTestRobotsTxtCache(...hostnames.splice(0))
  })

  it.each([
    {
      error: new CrawlerRateLimitError('https://example.com', 429, 1, 1000),
      status: 429,
      networkError: null,
      throws: true,
    },
    {
      error: new CrawlerConnectError('https://example.com', 1, new Error('refused')),
      status: 502,
      networkError: null,
      throws: true,
    },
    {
      error: new CrawlerTimeoutError('https://example.com', 1, 2),
      status: 504,
      networkError: 'timeout',
      throws: false,
    },
    {
      error: new CrawlerNetworkError('https://example.com', 1, new Error('reset')),
      status: 502,
      networkError: null,
      throws: false,
    },
    {
      error: suppressedError('unexpected browser error'),
      status: 500,
      networkError: null,
      throws: true,
    },
  ])(
    'closes reservation for $status and preserves referral health classification',
    async ({ error, status, networkError, throws }) => {
      const item = await fixture()
      vi.spyOn(browserCrawl, 'crawlWithBrowser').mockRejectedValue(error)
      const operation = processBrowserCrawl(item.url, item.linkId, item.crawler)
      const outcome = await operation.then(
        () => undefined,
        (err: unknown) => err,
      )
      expect(outcome).toBe(throws ? error : undefined)
      expect(await getBrowserCrawlReservations(item.url.id)).toEqual([
        { completed: true, status, networkError },
      ])
      expect((await getReferralLinkCrawlStatus(item.linkId)).consecutive_crawl_failures).toBe(
        throws ? 0 : 1,
      )
    },
  )

  it.each([
    new CrawlerRateLimitError('https://example.com', 429, 1, 1000),
    new CrawlerConnectError('https://example.com', 1, new Error('refused')),
  ])(
    'closes each reservation when a provider failure is followed by a successful retry',
    async error => {
      const item = await fixture()
      const spy = vi.spyOn(browserCrawl, 'crawlWithBrowser')
      spy.mockRejectedValueOnce(error).mockResolvedValueOnce({
        statusCode: 204,
        hasContent: false,
        title: '',
        contentLength: 0,
        finalUrl: item.url.url,
      })
      await expect(processBrowserCrawl(item.url, item.linkId, item.crawler)).rejects.toBe(error)
      await processBrowserCrawl(item.url, item.linkId, item.crawler)
      expect(await getBrowserCrawlReservations(item.url.id)).toEqual([
        { completed: true, status: error.status, networkError: null },
        { completed: true, status: 204, networkError: null },
      ])
    },
  )

  it('preserves a completed crawl when the following referral update fails', async () => {
    const item = await fixture()
    vi.spyOn(browserCrawl, 'crawlWithBrowser').mockResolvedValueOnce({
      statusCode: 204,
      hasContent: false,
      title: '',
      contentLength: 0,
      finalUrl: item.url.url,
    })
    await expect(processBrowserCrawl(item.url, 'invalid-uuid', item.crawler)).rejects.toMatchObject(
      { code: '22P02' },
    )
    expect(await getBrowserCrawlReservations(item.url.id)).toEqual([
      { completed: true, status: 204, networkError: null },
    ])
  })

  it.each(['getCrawlById', 'updateCrawl'])(
    'preserves a provider failure when reservation %s fails',
    async marker => {
      const item = await fixture()
      const providerError = new CrawlerConnectError(item.url.url, 1, new Error('refused'))
      const databaseError = new Error('injected reservation failure')
      vi.spyOn(browserCrawl, 'crawlWithBrowser').mockRejectedValue(providerError)
      const restore = rejectPostgresWriteForTest(marker, databaseError, values =>
        values.includes(item.url.id),
      )
      try {
        const failure = await processBrowserCrawl(item.url, item.linkId, item.crawler).catch(
          (err: unknown) => err,
        )
        expect(failure).toBeInstanceOf(AggregateError)
        if (!(failure instanceof AggregateError)) throw new Error('Expected AggregateError')
        expect(failure.cause).toBe(providerError)
        expect(failure.errors).toEqual(expect.arrayContaining([providerError, databaseError]))
        expect((await getReferralLinkCrawlStatus(item.linkId)).consecutive_crawl_failures).toBe(0)
      } finally {
        restore()
      }
    },
  )

  it.each(['getCrawlById', 'updateCrawl'])(
    'still records referral health when reservation %s fails',
    async marker => {
      const item = await fixture()
      const crawlError = new CrawlerTimeoutError(item.url.url, 1, 2)
      const databaseError = new Error('injected reservation failure')
      vi.spyOn(browserCrawl, 'crawlWithBrowser').mockRejectedValue(crawlError)
      const restore = rejectPostgresWriteForTest(marker, databaseError, values =>
        values.includes(item.url.id),
      )
      try {
        const failure = await processBrowserCrawl(item.url, item.linkId, item.crawler).catch(
          (err: unknown) => err,
        )
        expect(failure).toBeInstanceOf(AggregateError)
        if (!(failure instanceof AggregateError)) throw new Error('Expected AggregateError')
        expect(failure.cause).toBe(crawlError)
        expect(failure.errors).toEqual(expect.arrayContaining([crawlError, databaseError]))
        expect((await getReferralLinkCrawlStatus(item.linkId)).consecutive_crawl_failures).toBe(1)
      } finally {
        restore()
      }
    },
  )
})
