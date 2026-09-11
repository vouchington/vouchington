import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrawlerNetworkError, CrawlerSsrfError } from '@modules/on-error/errors'
import {
  getCrawlTestDependencies,
  makeMockBrowser,
  makeMockPage,
  makeMockRoute,
  makeMockWebSocketRoute,
  mockAssertSafeUrlSync,
  mockBlockerSerialize,
  mockConnectOverCDP,
  mockEnableBlockingInPage,
  mockFromPrebuiltAdsAndTracking,
  mockReadFile,
  mockRename,
  mockWriteFile,
  resetCrawlMocks,
} from './crawl-test-helpers.mts'
import { getBlocker, resetBlockerForTesting } from './adblocker-cache.mts'
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

  it('returns null blocker when fetch times out, sets blockerFetchFailedAt cooldown', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    // Simulate fetch timing out (rejects)
    mockFromPrebuiltAdsAndTracking.mockRejectedValue(
      new Error('adblocker fetch timed out after 30000ms'),
    )
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // First call: fetch fails, crawl continues without blocker
    await crawlWithBrowserForTest('https://example.com')
    // Second call: within cooldown window so no retry
    await crawlWithBrowserForTest('https://example.com')
    expect(mockFromPrebuiltAdsAndTracking).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load adblocker'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('logs error but still returns blocker when disk write fails', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockRejectedValue(new Error('disk full'))
    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await crawlWithBrowserForTest('https://example.com')
    expect(result.statusCode).toBe(200)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write adblocker cache'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('returns null when the adblocker fetch reaches its timeout', async () => {
    vi.useFakeTimers()
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockFromPrebuiltAdsAndTracking.mockReturnValue(new Promise(() => {}))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resultPromise = getBlocker(getCrawlTestDependencies()).then(result => {
      expect(result).toBeNull()
      return undefined
    })

    await vi.advanceTimersByTimeAsync(30000)

    await resultPromise
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load adblocker filter list'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
    vi.useRealTimers()
  })
})

describe('crawlWithBrowser — request interception', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBlockerForTesting()
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  function crawlWithBrowserForTest(url: string) {
    return crawlWithBrowser(url, getCrawlTestDependencies())
  }

  async function setupAndGetRouteHandler(blockerEnabled: boolean) {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    if (blockerEnabled) {
      const blockerInstance = {
        serialize: mockBlockerSerialize.mockReturnValue(Buffer.from('data')),
        enableBlockingInPage: mockEnableBlockingInPage.mockResolvedValue(undefined),
      }
      mockFromPrebuiltAdsAndTracking.mockResolvedValue(blockerInstance)
    } else {
      // Make fetch fail so no blocker is loaded
      mockFromPrebuiltAdsAndTracking.mockRejectedValue(new Error('no blocker'))
    }

    const page = makeMockPage()
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await crawlWithBrowserForTest('https://example.com')
    consoleSpy.mockRestore()
    return page
  }

  it('calls route.continue() for non-http(s) URLs (e.g. data:)', async () => {
    const page = await setupAndGetRouteHandler(false)
    const route = makeMockRoute('data:text/plain,hello')
    page.fireRoute(route)
    expect(route.continue).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(route.fallback).not.toHaveBeenCalled()
  })

  it('calls route.abort("blockedbyclient") for private IP URLs', async () => {
    mockAssertSafeUrlSync.mockImplementationOnce(() => {
      throw new Error('private network address')
    })
    const page = await setupAndGetRouteHandler(false)
    const route = makeMockRoute('http://192.168.1.1/endpoint')
    page.fireRoute(route)
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(route.continue).not.toHaveBeenCalled()
    expect(route.fallback).not.toHaveBeenCalled()
  })

  it('calls route.fallback() for SSRF-safe URLs when no blocker is installed', async () => {
    const page = await setupAndGetRouteHandler(false)
    const route = makeMockRoute('https://example.com/safe')
    page.fireRoute(route)
    expect(route.fallback).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(route.continue).not.toHaveBeenCalled()
  })

  it('calls route.fallback() for SSRF-safe URLs when a blocker is present, deferring to it', async () => {
    const page = await setupAndGetRouteHandler(true)
    const route = makeMockRoute('https://example.com/safe')
    page.fireRoute(route)
    expect(route.fallback).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(route.continue).not.toHaveBeenCalled()
  })

  it('registers the ad-blocker handler before the SSRF-guard route handler (LIFO ordering)', async () => {
    const page = await setupAndGetRouteHandler(true)
    const enableOrder = mockEnableBlockingInPage.mock.invocationCallOrder[0]
    const routeOrder = page.route.mock.invocationCallOrder[0]
    expect(enableOrder).toBeLessThan(routeOrder)
  })

  it('calls ws.connectToServer() for SSRF-safe WebSocket URLs', async () => {
    const page = await setupAndGetRouteHandler(false)
    const ws = makeMockWebSocketRoute('wss://example.com/socket')
    page.fireWebSocketRoute(ws)
    expect(mockAssertSafeUrlSync).toHaveBeenCalledWith('wss://example.com/socket', ['ws:', 'wss:'])
    expect(ws.connectToServer).toHaveBeenCalled()
    expect(ws.close).not.toHaveBeenCalled()
  })

  it('closes with code 1008 for SSRF-unsafe WebSocket URLs (private IP)', async () => {
    mockAssertSafeUrlSync.mockImplementationOnce(() => {
      throw new Error('private network address')
    })
    const page = await setupAndGetRouteHandler(false)
    // Fixture string for a mock WebSocketRoute, not a live connection; the test asserts this URL gets blocked.
    const ws = makeMockWebSocketRoute('ws://192.168.1.1/socket')
    page.fireWebSocketRoute(ws)
    expect(ws.close).toHaveBeenCalledWith({ code: 1008, reason: 'blocked by client' })
    expect(ws.connectToServer).not.toHaveBeenCalled()
  })

  it('rethrows the captured SSRF error from page.goto instead of a generic CrawlerNetworkError', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const ssrfError = new CrawlerSsrfError('http://169.254.169.254/', 'private network address')
    mockAssertSafeUrlSync.mockImplementation(() => {
      throw ssrfError
    })
    const page = makeMockPage()
    page.goto = vi.fn<VitestLooseMock>().mockImplementation(async (url: string) => {
      await page.fireRoute(makeMockRoute(url, true))
      throw new Error('net::ERR_FAILED')
    })
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('http://169.254.169.254/')).rejects.toBe(ssrfError)
    await expect(crawlWithBrowserForTest('http://169.254.169.254/')).rejects.not.toBeInstanceOf(
      CrawlerNetworkError,
    )
  })

  it('does not let a sub-resource SSRF block override a real navigation error', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    mockAssertSafeUrlSync.mockImplementation(() => {
      throw new CrawlerSsrfError('http://169.254.169.254/image.png', 'private network address')
    })
    const page = makeMockPage()
    page.goto = vi.fn<VitestLooseMock>().mockImplementation(async () => {
      // Sub-resource (not the navigation request itself) hits the SSRF guard.
      await page.fireRoute(makeMockRoute('http://169.254.169.254/image.png', false))
      throw new Error('net::ERR_NAME_NOT_RESOLVED')
    })
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.toBeInstanceOf(
      CrawlerNetworkError,
    )
    await expect(crawlWithBrowserForTest('https://example.com')).rejects.not.toBeInstanceOf(
      CrawlerSsrfError,
    )
  })
})

describe('crawlWithBrowser — browser context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBlockerForTesting()
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)
    mockFromPrebuiltAdsAndTracking.mockRejectedValue(new Error('no blocker'))
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
  })

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  function crawlWithBrowserForTest(url: string) {
    return crawlWithBrowser(url, getCrawlTestDependencies())
  }

  it('creates a browser context with serviceWorkers: block, then the page from that context', async () => {
    const page = makeMockPage()
    const browser = makeMockBrowser(page)
    mockConnectOverCDP.mockResolvedValue(browser)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await crawlWithBrowserForTest('https://example.com')
    consoleSpy.mockRestore()
    expect(browser.newContext).toHaveBeenCalledWith({ serviceWorkers: 'block' })
    expect(browser.mockContext.newPage).toHaveBeenCalled()
  })

  it('closes the context, page, and browser on completion', async () => {
    const page = makeMockPage()
    const browser = makeMockBrowser(page)
    mockConnectOverCDP.mockResolvedValue(browser)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await crawlWithBrowserForTest('https://example.com')
    consoleSpy.mockRestore()
    expect(page.close).toHaveBeenCalled()
    expect(browser.mockContext.close).toHaveBeenCalled()
    expect(browser.close).toHaveBeenCalled()
  })
})
