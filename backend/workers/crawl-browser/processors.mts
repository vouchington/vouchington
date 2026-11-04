import net from 'node:net'
import { updateReferralLinkAfterCrawl } from '@services/crawler-referral-links'
import { crawlWithBrowser, type BrowserCrawlResult } from '@services/browser-crawl'
import { isUrlCrawlable } from '@services/urls-domains-robots'
import { isPrivateIp } from 'ssrf-guard'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import { getContentFromHtml } from '@jongleberry/vurst-html'
import type { Crawler } from '@services/crawlers'
import { applyCrawlerRules } from '@services/crawlers/apply-rules'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import type { CrawlerHtmlStructuredObject } from '@services/crawls/types'
import { HttpNoBodyError } from '@vouchington/sentry'
import {
  CrawlerConnectError,
  CrawlerRateLimitError,
  CrawlerTimeoutError,
  CrawlerNetworkError,
  CrawlerSsrfError,
} from '@modules/on-error/errors'
import onError from '@modules/on-error'

function isLocalOrPrivateHostname(hostname: string): boolean {
  const cleaned = hostname.replace(/\.+$/, '').replace(/^\[(.+)\]$/, '$1')
  return (
    cleaned === 'localhost' ||
    cleaned.endsWith('.local') ||
    (net.isIP(cleaned) !== 0 && isPrivateIp(cleaned))
  )
}

export async function processBrowserCrawl(
  url: { id: string; url: string; hostname: { id: string; hostname: string } },
  linkId: string,
  crawler: Crawler,
): Promise<void> {
  if (isLocalOrPrivateHostname(url.hostname.hostname)) return

  const isCrawlable = await isUrlCrawlable(url.url, CRAWLER_USER_AGENT).catch((err: unknown) => {
    onError(err instanceof Error ? err : new Error(String(err)))
    return false
  })
  if (!isCrawlable) return

  const crawl = await createCrawl(url.id, crawler.id)
  try {
    const result = await crawlWithBrowser(url.url)
    await handleBrowserCrawlResult(url.id, linkId, crawler, crawl.id, result)
  } catch (err) {
    await handleBrowserCrawlError(linkId, err)
  }
}

async function handleBrowserCrawlResult(
  urlId: string,
  linkId: string,
  crawler: Crawler,
  reservedCrawlId: string,
  result: BrowserCrawlResult,
): Promise<void> {
  const isNotFound = result.statusCode === 404 || result.statusCode === 410

  let crawlId: string | undefined
  if (result.html) {
    const htmlBuffer = Buffer.from(result.html, 'utf8')
    const options = applyCrawlerRules(crawler)
    const content = await getContentFromHtml(htmlBuffer, options)
    await updateCrawl(reservedCrawlId, urlId, {
      response_status_code: result.statusCode,
      completed_at: new Date(),
      markdown: content.content || '',
      title: content.title ?? null,
      links: (content.links ?? {}) as CrawlerHtmlStructuredObject,
      meta_tags: (content.meta ?? {}) as CrawlerHtmlStructuredObject,
      language: content.lang ?? null,
    })
    crawlId = reservedCrawlId
  } else {
    await updateCrawl(reservedCrawlId, urlId, {
      response_status_code: result.statusCode,
      completed_at: new Date(),
    })
  }

  await updateReferralLinkAfterCrawl(linkId, {
    success: result.hasContent && !isNotFound,
    immediateDeactivation: isNotFound,
    crawlId,
  })
}

async function handleBrowserCrawlError(linkId: string, error: unknown): Promise<void> {
  // Provider/connect-phase failures (rate limits, CDP connect/setup failures) are unrelated
  // to the target link's health: rethrow so GlideMQ retries with backoff instead of marking
  // the referral link failed.
  if (error instanceof CrawlerRateLimitError || error instanceof CrawlerConnectError) throw error
  const isCrawlHealthFailure =
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerSsrfError ||
    error instanceof HttpNoBodyError
  if (isCrawlHealthFailure) {
    await updateReferralLinkAfterCrawl(linkId, { success: false })
  }
  onError(error instanceof Error ? error : new Error(String(error)))
  if (!isCrawlHealthFailure) throw error
}
