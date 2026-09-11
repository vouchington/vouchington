import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CrawlerConnectError,
  CrawlerNetworkError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import {
  getCrawlTestDependencies,
  makeMockBrowser,
  makeMockPage,
  mockBlockerSerialize,
  mockConnectOverCDP,
  mockDeserialize,
  mockEnableBlockingInPage,
  mockFromPrebuiltAdsAndTracking,
  mockReadFile,
  mockRename,
  mockUnlink,
  mockWriteFile,
  resetCrawlMocks,
} from './crawl-test-helpers.mts'
import { resetBlockerForTesting } from './adblocker-cache.mts'
import { crawlWithBrowser } from './crawl.mts'

describe('crawlWithBrowser', () => {
  beforeEach(() => resetCrawlMocks(resetBlockerForTesting))

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  function crawlWithBrowserForTest(url: string) {
    return crawlWithBrowser(url, getCrawlTestDependencies())
  }

  it('throws Error (not CrawlerNetworkError) when LIGHTPANDA_CDP_URL is not set', async () => {
    delete process.env.LIGHTPANDA_CDP_URL
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_CDP_URL is not set',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      CrawlerNetworkError,
    )
  })

  it('throws Error when LIGHTPANDA_CDP_URL is not a valid URL', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'not-a-url'
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_CDP_URL is not a valid URL',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      CrawlerNetworkError,
    )
  })

  it('throws Error when LIGHTPANDA_CDP_URL has wrong protocol', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'http://127.0.0.1:9222'
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_CDP_URL must use ws:// or wss:// protocol',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      CrawlerNetworkError,
    )
  })

  it('throws Error (not CrawlerNetworkError) when LIGHTPANDA_TOKEN is not set', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    delete process.env.LIGHTPANDA_TOKEN
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toThrow(
      'LIGHTPANDA_TOKEN is not set',
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      CrawlerNetworkError,
    )
  })

  it('throws CrawlerConnectError when chromium.connectOverCDP throws', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    mockConnectOverCDP.mockRejectedValue(new Error('connection refused'))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      CrawlerConnectError,
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
    mockConnectOverCDP.mockResolvedValue(browser)
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      CrawlerConnectError,
    )
    expect(browser.mockContext.close).toHaveBeenCalledOnce()
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('redacts the token from the connect-failure cause message', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'super-secret-token'
    mockConnectOverCDP.mockRejectedValue(
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
    expect(caught).toBeInstanceOf(CrawlerConnectError)
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
    mockConnectOverCDP.mockRejectedValue(
      new Error(`failed to connect to wss://uswest.cloud.lightpanda.io/ws?token=${encodedToken}`),
    )
    let caught: unknown
    try {
      await crawlWithBrowserForTest('https://example.com')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CrawlerConnectError)
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
    mockConnectOverCDP.mockRejectedValue(connectError)
    let caught: unknown
    try {
      await crawlWithBrowserForTest('https://example.com')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CrawlerConnectError)
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
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      CrawlerTimeoutError,
    )
  })

  it('throws CrawlerTimeoutError when page.goto throws a TimeoutError (constructor.name)', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    class TimeoutError extends Error {}
    page.goto = vi.fn<VitestLooseMock>().mockRejectedValue(new TimeoutError('timeout'))
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      CrawlerTimeoutError,
    )
  })

  it('throws CrawlerNetworkError when page.goto throws a non-timeout error', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    page.goto = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      CrawlerNetworkError,
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      CrawlerConnectError,
    )
  })

  it('returns a result on the happy path', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
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
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    const result = await crawlWithBrowserForTest('https://example.com')
    expect(result.html).toBeUndefined()
    expect(result.statusCode).toBe(200)
  })

  it('uses cached blocker on second call (cache hit)', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await crawlWithBrowserForTest('https://example.com')
    await crawlWithBrowserForTest('https://example.com')
    // fromPrebuiltAdsAndTracking should only be called once (second call uses cache)
    expect(mockFromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1)
  })

  it('uses disk cache when readFile succeeds (PlaywrightBlocker.deserialize called)', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const buf = Buffer.from('serialized-blocker')
    mockReadFile.mockResolvedValue(buf)
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await crawlWithBrowserForTest('https://example.com')
    expect(mockDeserialize).toHaveBeenCalledWith(buf)
    expect(mockFromPrebuiltAdsAndTracking).not.toHaveBeenCalled()
  })

  it('unlinks corrupt cache file when PlaywrightBlocker.deserialize throws', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const buf = Buffer.from('corrupt-data')
    mockReadFile.mockResolvedValue(buf)
    mockDeserialize.mockImplementationOnce(() => {
      throw new Error('corrupt cache')
    })
    const blockerInstance = {
      serialize: mockBlockerSerialize.mockReturnValue(Buffer.from('data')),
      enableBlockingInPage: mockEnableBlockingInPage.mockResolvedValue(undefined),
    }
    mockFromPrebuiltAdsAndTracking.mockResolvedValue(blockerInstance)
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await crawlWithBrowserForTest('https://example.com')
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('adblocker-engine.bin'))
  })

  it('fetches fresh blocker when disk read fails and writes cache to disk', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await crawlWithBrowserForTest('https://example.com')
    expect(mockFromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(mockRename).toHaveBeenCalledTimes(1)
  })
})
