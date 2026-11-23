import {
  BrowserCrawlConnectError,
  BrowserCrawlNavigationError,
  BrowserCrawlTimeoutError,
  crawlWithBrowser as crawlWithPlatformBrowser,
  type BrowserCrawlResult,
} from '@vouchington/browser-crawl'
import { chromium } from 'playwright-core'
import onError from '@modules/on-error'
import {
  CrawlerConnectError,
  CrawlerNetworkError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import { assertSafeUrlSync } from './ssrf.mts'
import { NAVIGATION_TIMEOUT_MS, CSR_HYDRATION_WAIT_MS } from './config.mts'
import { getBlocker } from './adblocker-cache.mts'
import { redactTokenFromError } from './token-redaction.mts'

const WEBSOCKET_ALLOWED_SCHEMES = ['ws:', 'wss:'] as const

/* no-mistakes: integration=http */
/** Crawl a URL using the Lightpanda cloud CDP endpoint. */
export async function crawlWithBrowser(url: string): Promise<BrowserCrawlResult> {
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

  // Token stays on this in-memory URL only; redactTokenFromError() scrubs it from any failure.
  const wsEndpoint = new URL(cdpEndpoint.href)
  wsEndpoint.searchParams.set('token', token)

  let result: BrowserCrawlResult
  try {
    result = await crawlWithPlatformBrowser({
      url,
      endpoint: wsEndpoint.href,
      connect: endpoint => chromium.connectOverCDP(endpoint),
      navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
      // 'load' plus this wait is the analog of the previous Puppeteer 'networkidle2' milestone,
      // which Playwright cannot express; 'networkidle' times out on persistent connections.
      hydrationWaitMs: CSR_HYDRATION_WAIT_MS,
      onCleanupError: err => onError(asError(err)),
      // Provider setup, not navigation: a failing blocker is a connect error so processors.mts retries.
      preparePage: async page => {
        const blocker = await getBlocker()
        if (blocker) await blocker.enableBlockingInPage(page)
      },
      // DNS-rebinding protection is delegated to Lightpanda cloud's own private-network blocking.
      requestPolicy: (requestUrl, kind) => {
        if (kind === 'websocket') {
          assertSafeUrlSync(requestUrl, WEBSOCKET_ALLOWED_SCHEMES)
        } else if (requestUrl.startsWith('http://') || requestUrl.startsWith('https://')) {
          // Non-http(s) resources (data:, blob:, about:) bypass both the SSRF guard and the ad-blocker.
          assertSafeUrlSync(requestUrl)
        }
      },
    })
  } catch (err) {
    throw toLocalCrawlError(err, url, token)
  }

  // Lightpanda completes navigation with status 0 when its egress proxy fetched nothing; that is a provider failure, not an HTTP response.
  if (result.statusCode === 0) {
    throw new CrawlerNetworkError(
      url,
      0,
      new Error('navigation completed without an HTTP response'),
    )
  }
  return result
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function toLocalCrawlError(err: unknown, url: string, token: string): unknown {
  if (err instanceof BrowserCrawlConnectError) {
    return new CrawlerConnectError(url, 0, redactTokenFromError(asError(err.cause), token))
  }
  if (err instanceof BrowserCrawlTimeoutError) {
    return new CrawlerTimeoutError(url, NAVIGATION_TIMEOUT_MS, NAVIGATION_TIMEOUT_MS)
  }
  if (err instanceof BrowserCrawlNavigationError) {
    return new CrawlerNetworkError(url, 0, asError(err.cause))
  }
  return err
}
