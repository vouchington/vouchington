import { describe, expect, it } from 'vitest'
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
import { createReferralProgramFixture, createTestUser, getCrawlData } from '@voucha/test-helpers'
import {
  getReferralLinkCrawlStatus,
  getReferralLinkLastCrawlId,
} from '@voucha/test-helpers/entities/referral-links'
import type { PrivateUser } from '@services/users/types'
import {
  handleBrowserCrawlError,
  handleBrowserCrawlResult,
  processBrowserCrawl,
} from './processors.mts'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'

describe('processBrowserCrawl', () => {
  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  async function createBrowserCrawlFixture(
    suffix = randomSuffix(),
  ): Promise<{ linkId: string; urlId: string; crawler: Crawler }> {
    const user = (await createTestUser()) as PrivateUser
    const hostname = `browser-crawl-${suffix}.example.com`
    const referralProgram = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: suffix,
      hostname,
      pathname: '/ref/%',
    })
    const link = await createUserReferralLink(user, {
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
    return { linkId: link.id, urlId: url!.id, crawler }
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

  it('delegates crawlable browser results through the result handler', async () => {
    const crawler = { id: 'crawler_browser_delegate' } as Parameters<typeof processBrowserCrawl>[2]
    const result = createBrowserResult({ statusCode: 204, hasContent: false })
    const handledResults: Array<{ urlId: string; linkId: string; result: BrowserCrawlResult }> = []

    await processBrowserCrawl(
      {
        id: 'url_browser_delegate',
        url: 'https://browser-delegate.example.com/page',
        hostname: { id: 'hostname_browser_delegate', hostname: 'browser-delegate.example.com' },
      },
      'link_browser_delegate',
      crawler,
      {
        isUrlCrawlable: () => Promise.resolve(true),
        crawlWithBrowser: url => {
          expect(url).toBe('https://browser-delegate.example.com/page')
          return Promise.resolve(result)
        },
        handleBrowserCrawlResult: (urlId, linkId, handledCrawler, handledResult) => {
          expect(handledCrawler).toBe(crawler)
          handledResults.push({ urlId, linkId, result: handledResult })
          return Promise.resolve()
        },
      },
    )

    expect(handledResults).toEqual([
      { urlId: 'url_browser_delegate', linkId: 'link_browser_delegate', result },
    ])
  })

  it('delegates browser crawl failures through the error handler', async () => {
    const failure = new Error('browser failed')
    const handledErrors: Array<{ linkId: string; error: unknown }> = []

    await processBrowserCrawl(
      {
        id: 'url_browser_error_delegate',
        url: 'https://browser-error-delegate.example.com/page',
        hostname: {
          id: 'hostname_browser_error_delegate',
          hostname: 'browser-error-delegate.example.com',
        },
      },
      'link_browser_error_delegate',
      { id: 'crawler_browser_error_delegate' } as Parameters<typeof processBrowserCrawl>[2],
      {
        isUrlCrawlable: () => Promise.resolve(true),
        crawlWithBrowser: () => Promise.reject(failure),
        handleBrowserCrawlError: (linkId, error) => {
          handledErrors.push({ linkId, error })
          return Promise.resolve()
        },
      },
    )

    expect(handledErrors).toEqual([{ linkId: 'link_browser_error_delegate', error: failure }])
  })

  it('skips URLs when the robots crawlability check fails closed', async () => {
    let browserCalled = false

    await expect(
      processBrowserCrawl(
        {
          id: 'url_robots_failure',
          url: 'https://robots-failure.example.com/page',
          hostname: { id: 'hostname_robots_failure', hostname: 'robots-failure.example.com' },
        },
        'link_robots_failure',
        { id: 'crawler_robots_failure' } as Parameters<typeof processBrowserCrawl>[2],
        {
          isUrlCrawlable: () => Promise.reject(suppressedError('robots unavailable')),
          crawlWithBrowser: () => {
            browserCalled = true
            return Promise.resolve(createBrowserResult({}))
          },
        },
      ),
    ).resolves.toBeUndefined()

    expect(browserCalled).toBe(false)
  })

  it('persists extracted HTML crawl content and records the successful crawl on the referral link', async () => {
    const fixture = await createBrowserCrawlFixture()

    await handleBrowserCrawlResult(
      fixture.urlId,
      fixture.linkId,
      fixture.crawler,
      createBrowserResult({
        html: '<html><head><title>Browser Title</title></head><body><main><p>Hello browser crawl.</p><p class="remove-me">Noise</p></main></body></html>',
      }),
    )

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
    expect(linkStatus.last_crawl_success_at).toBeTruthy()
    expect(linkStatus.deactivated_at).toBeNull()

    const crawlId = await getReferralLinkLastCrawlId(fixture.linkId)
    expect(crawlId).toBeTruthy()
    const crawl = (await getCrawlData(fixture.urlId, crawlId!)) as {
      response_status_code: number
      markdown: string
    }
    expect(crawl.response_status_code).toBe(200)
    expect(crawl.markdown).toContain('Hello browser crawl.')
    expect(crawl.markdown).not.toContain('Noise')
  })

  it('immediately deactivates referral links for not-found browser results', async () => {
    const fixture = await createBrowserCrawlFixture()

    await handleBrowserCrawlResult(
      fixture.urlId,
      fixture.linkId,
      fixture.crawler,
      createBrowserResult({ statusCode: 404, hasContent: false }),
    )

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.activated_at).toBeNull()
    expect(linkStatus.deactivated_at).toBeTruthy()
    expect(linkStatus.last_crawl_failure_at).toBeNull()
  })

  it('records crawl-health browser failures without throwing', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(
      handleBrowserCrawlError(
        fixture.linkId,
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
      handleBrowserCrawlError(
        fixture.linkId,
        new CrawlerRateLimitError('https://example.com/ref', 429, 5, 1000),
      ),
    ).rejects.toBeInstanceOf(CrawlerRateLimitError)

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(0)
    expect(linkStatus.last_crawl_failure_at).toBeNull()
  })

  it('rethrows browser connect-phase errors without changing referral-link crawl status', async () => {
    const fixture = await createBrowserCrawlFixture()

    await expect(
      handleBrowserCrawlError(
        fixture.linkId,
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
      handleBrowserCrawlError(
        fixture.linkId,
        new CrawlerTimeoutError('https://example.com/ref', 5000, 5001),
      ),
    ).resolves.toBeUndefined()

    const linkStatus = await getReferralLinkCrawlStatus(fixture.linkId)
    expect(linkStatus.consecutive_crawl_failures).toBe(1)
    expect(linkStatus.last_crawl_failure_at).toBeTruthy()
  })
})
