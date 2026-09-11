import fs from 'node:fs/promises'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
  type WebSocketRoute,
} from 'playwright-core'
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright'
import {
  CrawlerConnectError,
  CrawlerNetworkError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import { assertSafeUrlSync } from './ssrf.mts'
import type { BrowserCrawlResult } from './types.mts'
import {
  NAVIGATION_TIMEOUT_MS,
  CSR_HYDRATION_WAIT_MS,
  MIN_CONTENT_LENGTH,
  PAGE_MEASUREMENT_LIMITS,
  MAX_TITLE_BYTES,
} from './config.mts'
import { getBlocker } from './adblocker-cache.mts'
import { redactTokenFromError } from './token-redaction.mts'
import { measureAndSerializePage } from './page-content.mts'
import { openBrowserSession } from './browser-session.mts'

const WEBSOCKET_ALLOWED_SCHEMES = ['ws:', 'wss:'] as const
type BrowserCrawlDependencies = {
  connect: (wsEndpoint: string) => Promise<Browser>
  readFile: typeof fs.readFile
  writeFile: typeof fs.writeFile
  rename: typeof fs.rename
  unlink: typeof fs.unlink
  deserializeBlocker: typeof PlaywrightBlocker.deserialize
  fromPrebuiltAdsAndTracking: (fetchImpl: typeof fetch) => Promise<PlaywrightBlocker>
  assertSafeUrlSync: typeof assertSafeUrlSync
  csrHydrationWaitMs: number
}

function fromPrebuiltAdsAndTracking(fetchImpl: typeof fetch): Promise<PlaywrightBlocker> {
  // v8 ignore next -- exercised only by crawl.integration.test.mts against the live Lightpanda cloud CDP endpoint; every mocked unit test overrides this dependency
  return PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetchImpl) as Promise<PlaywrightBlocker>
}

const defaultDependencies: BrowserCrawlDependencies = {
  // v8 ignore next -- exercised only by crawl.integration.test.mts against the live Lightpanda cloud CDP endpoint; every mocked unit test overrides this dependency
  connect: wsEndpoint => chromium.connectOverCDP(wsEndpoint),
  readFile: fs.readFile,
  writeFile: fs.writeFile,
  rename: fs.rename,
  unlink: fs.unlink,
  deserializeBlocker: PlaywrightBlocker.deserialize,
  fromPrebuiltAdsAndTracking,
  assertSafeUrlSync,
  csrHydrationWaitMs: CSR_HYDRATION_WAIT_MS,
}

/* no-mistakes: integration=http */
/** Crawl a URL using the Lightpanda cloud CDP endpoint. */
export async function crawlWithBrowser(
  url: string,
  dependencyOverrides: Partial<BrowserCrawlDependencies> = {},
): Promise<BrowserCrawlResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const cdpUrl = process.env.LIGHTPANDA_CDP_URL
  if (!cdpUrl) throw new Error('LIGHTPANDA_CDP_URL is not set')
  let cdpEndpoint: URL
  try {
    cdpEndpoint = new URL(cdpUrl)
  } catch {
    throw new Error(`LIGHTPANDA_CDP_URL is not a valid URL: ${cdpUrl}`)
  }
  if (cdpEndpoint.protocol !== 'ws:' && cdpEndpoint.protocol !== 'wss:')
    throw new Error(
      // ws:// is in an error message string, not a live connection; LIGHTPANDA_CDP_URL is validated, not hardcoded to a scheme.
      `LIGHTPANDA_CDP_URL must use ws:// or wss:// protocol, got: ${cdpEndpoint.protocol}`,
    )
  const token = process.env.LIGHTPANDA_TOKEN?.trim()
  if (!token) throw new Error('LIGHTPANDA_TOKEN is not set')

  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined
  let ssrfError: Error | undefined
  try {
    // Connect through route registration is provider setup, not navigation — failures here throw CrawlerConnectError so processors.mts retries instead of marking the link unhealthy.
    try {
      // Token stays on this in-memory URL only; redactToken() below scrubs it from any failure.
      const wsEndpoint = new URL(cdpEndpoint.href)
      wsEndpoint.searchParams.set('token', token)
      const session = await openBrowserSession(dependencies.connect, wsEndpoint.href)
      browser = session.browser
      context = session.context
      page = session.page
      page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS)

      const blocker = await getBlocker(dependencies)

      if (blocker) await blocker.enableBlockingInPage(page)

      // SSRF guard: DNS-rebinding protection (a hostname resolving to a private IP only at
      // request time) is delegated to Lightpanda cloud's own private-network blocking.
      await page.route('**/*', async (route: Route) => {
        const rawUrl = route.request().url()
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
          // Non-http(s) resources (data:, blob:, about:) bypass both the SSRF guard and the ad-blocker.
          await route.continue().catch(() => {})
          return
        }
        try {
          dependencies.assertSafeUrlSync(rawUrl)
        } catch (err) {
          // Captured so the navigation catch below can rethrow it as CrawlerSsrfError instead of the generic aborted-navigation error Playwright raises.
          if (route.request().isNavigationRequest() && err instanceof Error) ssrfError = err
          await route.abort('blockedbyclient').catch(() => {})
          return
        }
        // SSRF-safe: defer to the ad-blocker's handler registered below us in the route stack; with none installed, fallback() continues to network.
        await route.fallback().catch(() => {})
      })

      // page.route() does not see WebSocket handshakes — Playwright intercepts them through a
      // separate API. connectToServer() dials the real ws/wss endpoint from inside the page's
      // own sandbox, layering an app-level guard on top of (not replacing) Lightpanda cloud's own network-level private-address blocking.
      await page.routeWebSocket('**/*', async (ws: WebSocketRoute) => {
        try {
          dependencies.assertSafeUrlSync(ws.url(), WEBSOCKET_ALLOWED_SCHEMES)
        } catch {
          await ws.close({ code: 1008, reason: 'blocked by client' }).catch(() => {})
          return
        }
        ws.connectToServer()
      })
    } catch (err) {
      // redactTokenFromError() only redacts when a token is present, so applying it region-wide to non-connect errors here is harmless.
      const original = err instanceof Error ? err : new Error(String(err))
      throw new CrawlerConnectError(url, 0, redactTokenFromError(original, token))
    }

    let statusCode = 200
    try {
      // 'networkidle' requires zero in-flight connections and times out on real-world
      // referral pages that hold a persistent connection open (WebSockets, SSE,
      // long-polling analytics/chat widgets). 'load' plus the csrHydrationWaitMs wait
      // below is the reliable analog of the previous Puppeteer 'networkidle2' milestone
      // (<=2 connections tolerated), which we can no longer express directly in Playwright.
      const gotoResponse = await page.goto(url, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT_MS,
      })
      if (gotoResponse) statusCode = gotoResponse.status()
    } catch (err) {
      if (ssrfError) throw ssrfError
      const error = err instanceof Error ? err : new Error(String(err))
      if (error.name === 'TimeoutError' || error.constructor.name === 'TimeoutError') {
        throw new CrawlerTimeoutError(url, NAVIGATION_TIMEOUT_MS, NAVIGATION_TIMEOUT_MS)
      }
      throw new CrawlerNetworkError(url, 0, error)
    }

    await new Promise(resolve => setTimeout(resolve, dependencies.csrHydrationWaitMs))

    const finalUrl = page.url() // post-redirect landed URL, incl. any redirect-minted tokens
    const pageContent = (await page.evaluate(measureAndSerializePage, {
      maxContentLength: MIN_CONTENT_LENGTH,
      ...PAGE_MEASUREMENT_LIMITS,
      maxTitleBytes: MAX_TITLE_BYTES,
    })) as {
      contentLength: number
      html?: string
      title: string
    }
    const title = pageContent.title

    const hasContent = title.trim().length > 0 || pageContent.contentLength >= MIN_CONTENT_LENGTH

    return {
      statusCode,
      hasContent,
      title,
      contentLength: pageContent.contentLength,
      html: pageContent.html,
      finalUrl,
    }
  } finally {
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser)
      await browser.close().catch((err: unknown) => {
        console.error('Failed to close browser', err)
      })
  }
}
