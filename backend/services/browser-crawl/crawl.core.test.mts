import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  makeMockBrowser,
  makeMockPage,
  skipHydrationWait,
  useAdblockerCachePath,
} from '@voucha/test-helpers/services/browser-crawl/crawl-fixtures'

type Fresh = Awaited<ReturnType<typeof loadFreshCrawl>>

async function loadFreshCrawl(options: { unwritable?: boolean } = {}) {
  const cachePath = await useAdblockerCachePath(options)
  vi.resetModules()
  const playwright = await import('playwright-core')
  const adblocker = await import('@ghostery/adblocker-playwright')
  const errors = await import('@modules/on-error/errors')
  const crawl = await import('./crawl.mts')
  const connect = vi.spyOn(playwright.chromium, 'connectOverCDP')
  const download = vi
    .spyOn(adblocker.PlaywrightBlocker, 'fromPrebuiltAdsAndTracking')
    .mockResolvedValue(adblocker.PlaywrightBlocker.empty())
  const enableBlocking = vi
    .spyOn(adblocker.PlaywrightBlocker.prototype, 'enableBlockingInPage')
    .mockResolvedValue(undefined as never)
  const hydrationDelays = skipHydrationWait()
  onTestFinished(() => {
    connect.mockRestore()
    download.mockRestore()
    enableBlocking.mockRestore()
  })
  return {
    adblocker,
    cachePath,
    connect,
    crawl,
    download,
    enableBlocking,
    errors,
    hydrationDelays,
    connectTo: (browser: ReturnType<typeof makeMockBrowser>) =>
      connect.mockResolvedValue(browser as never),
  }
}

describe('crawlWithBrowser', () => {
  let f: Fresh

  beforeEach(async () => {
    f = await loadFreshCrawl()
  })

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  function crawlWithBrowserForTest(url: string) {
    return f.crawl.crawlWithBrowser(url)
  }

  it('throws Error (not CrawlerNetworkError) when LIGHTPANDA_CDP_URL is not set', async () => {
    delete process.env.LIGHTPANDA_CDP_URL
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_CDP_URL is not set',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      f.errors.CrawlerNetworkError,
    )
  })

  it('throws Error when LIGHTPANDA_CDP_URL is not a valid URL', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'not-a-url'
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_CDP_URL is not a valid URL',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      f.errors.CrawlerNetworkError,
    )
  })

  it('throws Error when LIGHTPANDA_CDP_URL has wrong protocol', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'http://127.0.0.1:9222'
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_CDP_URL must use ws:// or wss:// protocol',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      f.errors.CrawlerNetworkError,
    )
  })

  it.each([undefined, '', ' \t '])('throws Error before connecting with token %s', async token => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    if (token === undefined) delete process.env.LIGHTPANDA_TOKEN
    else process.env.LIGHTPANDA_TOKEN = token
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_TOKEN is not set',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      f.errors.CrawlerNetworkError,
    )
    expect(f.connect).not.toHaveBeenCalled()
  })

  it('throws CrawlerConnectError when chromium.connectOverCDP throws', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    f.connect.mockRejectedValue(new Error('connection refused'))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      f.errors.CrawlerConnectError,
    )
  })

  it('throws CrawlerConnectError when context.newPage() throws', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    const browser = makeMockBrowser(page)
    browser.mockContext.newPage = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(new Error('CDP session closed'))
    f.connectTo(browser)
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      f.errors.CrawlerConnectError,
    )
    expect(browser.mockContext.close).toHaveBeenCalledOnce()
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('redacts the token from the connect-failure cause message', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'super-secret-token'
    f.connect.mockRejectedValue(
      new Error(
        'failed to connect to wss://uswest.cloud.lightpanda.io/ws?token=super-secret-token',
      ),
    )
    let caught: unknown
    try {
      await crawlWithBrowserForTest('https://example.com')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(f.errors.CrawlerConnectError)
    const message = caught instanceof Error ? caught.message : ''
    expect(message).not.toContain('super-secret-token')
    const cause = caught instanceof Error ? caught.cause : undefined
    expect(cause instanceof Error ? cause.message : '').not.toContain('super-secret-token')
    expect(cause instanceof Error ? cause.stack : '').not.toContain('super-secret-token')
  })

  it('redacts the URL-encoded form of a token containing reserved characters', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    const token = 'a/b+c=d&e f'
    process.env.LIGHTPANDA_TOKEN = token
    const encodedToken = new URLSearchParams({ token }).toString().slice('token='.length)
    f.connect.mockRejectedValue(
      new Error(`failed to connect to wss://uswest.cloud.lightpanda.io/ws?token=${encodedToken}`),
    )
    let caught: unknown
    try {
      await crawlWithBrowserForTest('https://example.com')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(f.errors.CrawlerConnectError)
    const cause = caught instanceof Error ? caught.cause : undefined
    expect(cause instanceof Error ? cause.message : '').not.toContain(encodedToken)
    expect(cause instanceof Error ? cause.message : '').not.toContain(token)
    expect(cause instanceof Error ? cause.message : '').toContain('[REDACTED]')
  })

  it('redacts the token from a nested connect-failure cause chain and preserves the chain depth', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'super-secret-token'
    const socketError = new Error(
      'ECONNREFUSED wss://uswest.cloud.lightpanda.io/ws?token=super-secret-token',
    )
    const connectError = new Error('failed to connect', { cause: socketError })
    f.connect.mockRejectedValue(connectError)
    let caught: unknown
    try {
      await crawlWithBrowserForTest('https://example.com')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(f.errors.CrawlerConnectError)
    const cause = caught instanceof Error ? caught.cause : undefined
    expect(cause).toBeInstanceOf(Error)
    expect(cause instanceof Error ? cause.message : '').toBe('failed to connect')
    const nestedCause = cause instanceof Error ? cause.cause : undefined
    expect(nestedCause).toBeInstanceOf(Error)
    expect(nestedCause instanceof Error ? nestedCause.message : '').not.toContain(
      'super-secret-token',
    )
    expect(nestedCause instanceof Error ? nestedCause.message : '').toContain('[REDACTED]')
  })

  it('throws CrawlerTimeoutError when page.goto throws a TimeoutError (error.name)', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    const timeoutErr = new Error('Navigation timeout')
    timeoutErr.name = 'TimeoutError'
    page.goto = vi.fn<VitestLooseMock>().mockRejectedValue(timeoutErr)
    f.connectTo(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      f.errors.CrawlerTimeoutError,
    )
  })

  it('throws CrawlerTimeoutError when page.goto throws a TimeoutError (constructor.name)', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    class TimeoutError extends Error {}
    page.goto = vi.fn<VitestLooseMock>().mockRejectedValue(new TimeoutError('timeout'))
    f.connectTo(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      f.errors.CrawlerTimeoutError,
    )
  })

  it('throws CrawlerNetworkError when page.goto throws a non-timeout error', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    page.goto = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))
    f.connectTo(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      f.errors.CrawlerNetworkError,
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      f.errors.CrawlerConnectError,
    )
  })

  it('returns a result on the happy path', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    f.connectTo(makeMockBrowser(page))
    const result = await crawlWithBrowserForTest('https://example.com')
    expect(result).toMatchObject({
      statusCode: 200,
      hasContent: true,
      title: 'Test Title',
      contentLength: 100,
      finalUrl: 'https://example.com',
    })
    expect(result.html).toContain('<html>')
  })

  it('returns undefined html when browser-side bounded extraction omits oversized HTML', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    page.evaluate = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ contentLength: 100, html: undefined, title: 'Test Title' })
    f.connectTo(makeMockBrowser(page))
    const result = await crawlWithBrowserForTest('https://example.com')
    expect(result.html).toBeUndefined()
    expect(result.statusCode).toBe(200)
  })

  it('waits the CSR hydration delay before reading the page', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    f.connectTo(makeMockBrowser(makeMockPage()))
    await crawlWithBrowserForTest('https://example.com')
    expect(f.hydrationDelays).toEqual([5000])
  })

  it('captures the post-redirect landed URL as finalUrl', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const inputUrl = 'https://americanexpress.com/en-us/referral/all-cards?ref=JONATOycVU'
    const landedUrl =
      'https://www.americanexpress.com/en-us/credit-cards/referral/prospect/all-cards/personal?CORID=abc&GENCODE=def&ref=JONATOycVU'

    // page.url() only starts returning landedUrl once goto() has resolved, like a real browser
    // mid-navigation, so reading it before awaiting goto() would capture the stale input URL.
    let navigated = false
    const page = makeMockPage({
      goto: vi.fn<VitestLooseMock>().mockImplementation(async () => {
        navigated = true
        return { status: () => 200 }
      }),
      url: vi.fn<VitestLooseMock>().mockImplementation(() => (navigated ? landedUrl : inputUrl)),
    })
    f.connectTo(makeMockBrowser(page))
    const result = await crawlWithBrowserForTest(inputUrl)

    expect(page.goto).toHaveBeenCalledWith(inputUrl, expect.objectContaining({ waitUntil: 'load' }))
    expect(result.finalUrl).toBe(landedUrl)
  })
})
