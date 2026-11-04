import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as browserCrawl from '@services/browser-crawl'
import type { BrowserCrawlResult } from '@services/browser-crawl'
import { createCrawler, type Crawler } from '@services/crawlers'
import { addUrl } from '@services/urls'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import {
  CrawlerConnectError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import {
  createReferralProgramFixture,
  createTestUser,
  getCrawlData,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  getReferralLinkCrawlStatus,
  getReferralLinkLastCrawlId,
} from '@voucha/test-helpers/entities/referral-links'
import type { PrivateUser } from '@services/users/types'
import { processBrowserCrawl } from './processors.mts'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'
import { readTestCrawlRefreshState } from '@voucha/test-helpers/entities/crawl-refresh-state'
import { getLatestCrawlCompletionForUrl } from '@voucha/test-helpers/entities/crawl-state'
import {
  deleteTestRobotsTxtCache,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers/entities/dispatch'

const ALLOW_ALL_ROBOTS = 'User-agent: *\nAllow: /'
const DISALLOW_ALL_ROBOTS = 'User-agent: *\nDisallow: /'
const seededHostnames: string[] = []

describe('processBrowserCrawl', () => {
  afterAll(() => deleteTestRobotsTxtCache(...seededHostnames))

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  async function createBrowserCrawlFixture(
    suffix = randomSuffix(),
    robotsTxt = ALLOW_ALL_ROBOTS,
  ): Promise<{
    linkId: string
    url: { id: string; url: string; hostname: { id: string; hostname: string } }
    crawler: Crawler
  }> {
    const user = (await createTestUser()) as PrivateUser
    const hostname = `browser-crawl-${suffix}.example.com`
    seededHostnames.push(hostname)
    await setTestRobotsTxtCache(hostname, robotsTxt)
    const referralProgram = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: suffix,
      hostname,
      pathname: '/ref/%',
    })
    const link = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: referralProgram.referralProgramId,
      url: `https://${hostname}/ref/${suffix}`,
    })
    const url = await addUrl(user.id, `https://${hostname}/crawl/${suffix}`)
    expect(url).toBeTruthy()
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'automation',
      css_selectors_to_remove: ['.remove-me'],
    })
    return { linkId: link.id, url: url!, crawler }
  }

  function createBrowserResult(overrides: Partial<BrowserCrawlResult>): BrowserCrawlResult {
    return {
      statusCode: 200,
      hasContent: true,
      title: 'Fixture page',
      contentLength: 80,
      finalUrl: 'https://example.com',
      ...overrides,
    }
  }

  it('skips localhost URLs before network or persistence work', async () => {
    await expect(
      processBrowserCrawl(
        {
          id: 'url_localhost',
          url: 'http://localhost/test',
          hostname: { id: 'hostname_localhost', hostname: 'localhost' },
        },
        'link_localhost',
        { id: 'crawler_localhost' } as Parameters<typeof processBrowserCrawl>[2],
      ),
    ).resolves.toBeUndefined()
  })

  it('records a crawlable result without content as a crawl failure, crawling the exact URL', async () => {
    const fixture = await createBrowserCrawlFixture()
    const crawl = stubBrowserCrawl(createBrowserResult({ statusCode: 204, hasContent: false }))

    await processBrowserCrawl(fixture.url, fixture.linkId, fixture.crawler)

    expect(crawl).toHaveBeenCalledExactlyOnceWith(fixture.url.url)
    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(1)
    expect(linkStatus.last_crawl_failure_at).toBeTruthy()
    expect(linkStatus.deactivated_at).toBeNull()
    expect(await getReferralLinkLastCrawlId(fixture.linkId)).toBeNull()
  })

  it('rethrows non-health browser failures without changing referral-link crawl status', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(runBrowserCrawl(fixture, suppressedError('browser failed'))).rejects.toThrow(
      'browser failed',
    )

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
    expect(linkStatus.last_crawl_failure_at).toBeNull()
  })

  it('skips URLs that robots.txt disallows, never opening the browser', async () => {
    const fixture = await createBrowserCrawlFixture(randomSuffix(), DISALLOW_ALL_ROBOTS)
    const crawl = stubBrowserCrawl(createBrowserResult({}))

    await expect(
      processBrowserCrawl(fixture.url, fixture.linkId, fixture.crawler),
    ).resolves.toBeUndefined()

    expect(crawl).not.toHaveBeenCalled()
    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
  })

  it('skips URLs when the crawlability check fails closed', async () => {
    const fixture = await createBrowserCrawlFixture()
    const crawl = stubBrowserCrawl(createBrowserResult({}))

    await expect(
      processBrowserCrawl({ ...fixture.url, url: 'not a url' }, fixture.linkId, fixture.crawler),
    ).resolves.toBeUndefined()

    expect(crawl).not.toHaveBeenCalled()
  })

  it('persists extracted HTML crawl content and records the successful crawl on the referral link', async () => {
    const fixture = await createBrowserCrawlFixture()
    const browser = stubBrowserCrawl(createBrowserResult({}))
    browser.mockImplementation(async () => {
      const pending = await readTestCrawlRefreshState(fixture.url.id)
      expect(pending.last_crawl_attempt_at).toBeInstanceOf(Date)
      expect(pending.last_successful_crawl_at).toBeNull()
      return createBrowserResult({
        html: '<html><head><title>Browser Title</title></head><body><main><p>Hello browser crawl.</p><p class="remove-me">Noise</p></main></body></html>',
      })
    })

    await processBrowserCrawl(fixture.url, fixture.linkId, fixture.crawler)
    expect(browser).toHaveBeenCalledOnce()
    expect(
      (await readTestCrawlRefreshState(fixture.url.id)).last_successful_crawl_at,
    ).toBeInstanceOf(Date)

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
    expect(linkStatus.last_crawl_success_at).toBeTruthy()
    expect(linkStatus.deactivated_at).toBeNull()

    const crawlId = await getReferralLinkLastCrawlId(fixture.linkId)
    expect(crawlId).toBeTruthy()
    const crawl = (await getCrawlData(fixture.url.id, crawlId!)) as {
      response_status_code: number
      markdown: string
    }
    expect(crawl.response_status_code).toBe(200)
    expect(crawl.markdown).toContain('Hello browser crawl.')
    expect(crawl.markdown).not.toContain('Noise')
  })

  it('immediately deactivates referral links for not-found browser results', async () => {
    const fixture = await createBrowserCrawlFixture()

    await runBrowserCrawl(fixture, createBrowserResult({ statusCode: 404, hasContent: false }))

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.activated_at).toBeNull()
    expect(linkStatus.deactivated_at).toBeTruthy()
    expect(linkStatus.last_crawl_failure_at).toBeNull()
    expect(await getReferralLinkLastCrawlId(fixture.linkId)).toBeNull()
    expect(await getLatestCrawlCompletionForUrl(fixture.url.id)).toEqual({
      completed: true,
      responseStatusCode: 404,
    })
    expect((await readTestCrawlRefreshState(fixture.url.id)).last_successful_crawl_at).toBeNull()
  })

  it('records successful bodyless browser responses without attaching a referral crawl', async () => {
    const fixture = await createBrowserCrawlFixture()
    await runBrowserCrawl(fixture, createBrowserResult({ statusCode: 304, hasContent: false }))
    expect(await getLatestCrawlCompletionForUrl(fixture.url.id)).toEqual({
      completed: true,
      responseStatusCode: 304,
    })
    expect(
      (await readTestCrawlRefreshState(fixture.url.id)).last_successful_crawl_at,
    ).toBeInstanceOf(Date)
    expect(await getReferralLinkLastCrawlId(fixture.linkId)).toBeNull()
  })

  it('records crawl-health browser failures without throwing', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(
      runBrowserCrawl(
        fixture,
        new CrawlerNetworkError('https://example.com/ref', 12, new Error('connection reset')),
      ),
    ).resolves.toBeUndefined()

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(1)
    expect(linkStatus.last_crawl_failure_at).toBeTruthy()
    expect(linkStatus.deactivated_at).toBeNull()
  })

  it('rethrows browser rate-limit errors without changing referral-link crawl status', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(
      runBrowserCrawl(fixture, new CrawlerRateLimitError('https://example.com/ref', 429, 5, 1000)),
    ).rejects.toBeInstanceOf(CrawlerRateLimitError)

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
    expect(linkStatus.last_crawl_failure_at).toBeNull()
  })

  it('rethrows browser connect-phase errors without changing referral-link crawl status', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(
      runBrowserCrawl(
        fixture,
        new CrawlerConnectError('https://example.com/ref', 0, new Error('connection refused')),
      ),
    ).rejects.toBeInstanceOf(CrawlerConnectError)

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
    expect(linkStatus.last_crawl_failure_at).toBeNull()
  })

  it('also treats timeout failures as referral-link crawl failures', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(
      runBrowserCrawl(fixture, new CrawlerTimeoutError('https://example.com/ref', 5000, 5001)),
    ).resolves.toBeUndefined()

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(1)
    expect(linkStatus.last_crawl_failure_at).toBeTruthy()
    const refresh = await readTestCrawlRefreshState(fixture.url.id)
    expect(refresh.last_crawl_attempt_at).toBeInstanceOf(Date)
    expect(refresh.last_successful_crawl_at).toBeNull()
  })
})

function stubBrowserCrawl(resultOrError: BrowserCrawlResult | Error) {
  const spy = vi.spyOn(browserCrawl, 'crawlWithBrowser')
  if (resultOrError instanceof Error) spy.mockRejectedValue(resultOrError)
  else spy.mockResolvedValue(resultOrError)
  onTestFinished(() => spy.mockRestore())
  return spy
}

async function runBrowserCrawl(
  fixture: {
    linkId: string
    url: { id: string; url: string; hostname: { id: string; hostname: string } }
    crawler: Crawler
  },
  resultOrError: BrowserCrawlResult | Error,
): Promise<void> {
  stubBrowserCrawl(resultOrError)
  await processBrowserCrawl(fixture.url, fixture.linkId, fixture.crawler)
}
