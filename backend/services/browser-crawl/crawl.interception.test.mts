import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  makeMockBrowser,
  makeMockPage,
  makeMockRoute,
  makeMockWebSocketRoute,
  skipHydrationWait,
  useAdblockerCachePath,
} from '@voucha/test-helpers/services/browser-crawl/crawl-fixtures'

type Fresh = Awaited<ReturnType<typeof loadFreshCrawl>>

async function loadFreshCrawl() {
  await useAdblockerCachePath()
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
  skipHydrationWait()
  onTestFinished(() => {
    connect.mockRestore()
    download.mockRestore()
    enableBlocking.mockRestore()
  })
  return {
    crawl,
    download,
    enableBlocking,
    errors,
    connectTo: (browser: ReturnType<typeof makeMockBrowser>) =>
      connect.mockResolvedValue(browser as never),
  }
}

describe('crawlWithBrowser — request interception', () => {
  let f: Fresh

  beforeEach(async () => {
    f = await loadFreshCrawl()
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
  })

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  async function setupAndGetPage(blockerEnabled: boolean) {
    if (!blockerEnabled) f.download.mockRejectedValue(new Error('no blocker'))
    const page = makeMockPage()
    f.connectTo(makeMockBrowser(page))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await f.crawl.crawlWithBrowser('https://example.com')
    consoleSpy.mockRestore()
    return page
  }

  it('calls route.continue() for non-http(s) URLs (e.g. data:)', async () => {
    const page = await setupAndGetPage(false)
    const route = makeMockRoute('data:text/plain,hello')
    page.fireRoute(route)
    expect(route.continue).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(route.fallback).not.toHaveBeenCalled()
  })

  it('calls route.abort("blockedbyclient") for private IP URLs', async () => {
    const page = await setupAndGetPage(false)
    const route = makeMockRoute('http://192.168.1.1/endpoint')
    page.fireRoute(route)
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(route.continue).not.toHaveBeenCalled()
    expect(route.fallback).not.toHaveBeenCalled()
  })

  it('calls route.fallback() for SSRF-safe URLs when no blocker is installed', async () => {
    const page = await setupAndGetPage(false)
    const route = makeMockRoute('https://example.com/safe')
    page.fireRoute(route)
    expect(route.fallback).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(route.continue).not.toHaveBeenCalled()
  })

  it('calls route.fallback() for SSRF-safe URLs when a blocker is present, deferring to it', async () => {
    const page = await setupAndGetPage(true)
    const route = makeMockRoute('https://example.com/safe')
    page.fireRoute(route)
    expect(route.fallback).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(route.continue).not.toHaveBeenCalled()
  })

  it('registers the ad-blocker handler before the SSRF-guard route handler (LIFO ordering)', async () => {
    const page = await setupAndGetPage(true)
    const enableOrder = f.enableBlocking.mock.invocationCallOrder[0]
    const routeOrder = page.route.mock.invocationCallOrder[0]
    expect(enableOrder).toBeLessThan(routeOrder)
  })

  it('calls ws.connectToServer() for SSRF-safe WebSocket URLs', async () => {
    const page = await setupAndGetPage(false)
    const ws = makeMockWebSocketRoute('wss://example.com/socket')
    page.fireWebSocketRoute(ws)
    expect(ws.connectToServer).toHaveBeenCalled()
    expect(ws.close).not.toHaveBeenCalled()
  })

  it('closes with code 1008 for SSRF-unsafe WebSocket URLs (private IP)', async () => {
    const page = await setupAndGetPage(false)
    // Fixture string for a mock WebSocketRoute, not a live connection; the test asserts this URL gets blocked.
    const ws = makeMockWebSocketRoute('ws://192.168.1.1/socket')
    page.fireWebSocketRoute(ws)
    expect(ws.close).toHaveBeenCalledWith({ code: 1008, reason: 'blocked by client' })
    expect(ws.connectToServer).not.toHaveBeenCalled()
  })

  it('closes with code 1008 for WebSocket URLs outside the ws and wss schemes', async () => {
    const page = await setupAndGetPage(false)
    const ws = makeMockWebSocketRoute('https://example.com/socket')
    page.fireWebSocketRoute(ws)
    expect(ws.close).toHaveBeenCalledWith({ code: 1008, reason: 'blocked by client' })
    expect(ws.connectToServer).not.toHaveBeenCalled()
  })

  it('rethrows the captured SSRF error from page.goto instead of a generic CrawlerNetworkError', async () => {
    const page = makeMockPage()
    page.goto = vi.fn<VitestLooseMock>().mockImplementation(async (url: string) => {
      await page.fireRoute(makeMockRoute(url, true))
      throw new Error('net::ERR_FAILED')
    })
    f.connectTo(makeMockBrowser(page))
    const caught = await f.crawl
      .crawlWithBrowser('http://169.254.169.254/')
      .catch((err: unknown) => err)
    expect(caught).toBeInstanceOf(f.errors.CrawlerSsrfError)
    expect(caught).not.toBeInstanceOf(f.errors.CrawlerNetworkError)
    expect(caught).toMatchObject({ code: 'CrawlerSsrfError', url: 'http://169.254.169.254/' })
  })

  it('does not let a sub-resource SSRF block override a real navigation error', async () => {
    const page = makeMockPage()
    const route = makeMockRoute('http://169.254.169.254/image.png', false)
    page.goto = vi.fn<VitestLooseMock>().mockImplementation(async () => {
      // Sub-resource (not the navigation request itself) hits the SSRF guard.
      await page.fireRoute(route)
      throw new Error('net::ERR_NAME_NOT_RESOLVED')
    })
    f.connectTo(makeMockBrowser(page))
    const caught = await f.crawl
      .crawlWithBrowser('https://example.com')
      .catch((err: unknown) => err)
    expect(caught).toBeInstanceOf(f.errors.CrawlerNetworkError)
    expect(caught).not.toBeInstanceOf(f.errors.CrawlerSsrfError)
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient')
  })
})

describe('crawlWithBrowser — browser context', () => {
  let f: Fresh

  beforeEach(async () => {
    f = await loadFreshCrawl()
    f.download.mockRejectedValue(new Error('no blocker'))
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())
  })

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  it('creates a browser context with serviceWorkers: block, then the page from that context', async () => {
    const page = makeMockPage()
    const browser = makeMockBrowser(page)
    f.connectTo(browser)
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(browser.newContext).toHaveBeenCalledWith({ serviceWorkers: 'block' })
    expect(browser.mockContext.newPage).toHaveBeenCalled()
  })

  it('closes the context, page, and browser on completion', async () => {
    const page = makeMockPage()
    const browser = makeMockBrowser(page)
    f.connectTo(browser)
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(page.close).toHaveBeenCalled()
    expect(browser.mockContext.close).toHaveBeenCalled()
    expect(browser.close).toHaveBeenCalled()
  })
})
