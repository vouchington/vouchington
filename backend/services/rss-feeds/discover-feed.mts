import { enqueueCrawlUrlAndWait } from '@queues/crawler/enqueues'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { getLatestHtmlSnapshotCrawlBefore } from '@services/crawls/get-latest-html-snapshot-before'
import { getCrawlById } from '@services/crawls/get'
import { isRobotsTxtIgnoredForFeeds } from './crawl-config.mts'
import type {
  CrawlerHtmlStructuredObject,
  CrawlerHtmlStructuredValue,
} from '@services/crawls/types'
import { safeResolveUrl } from '@services/crawls/crawl-url-utils'
import { addUrl, getUrlById } from '@services/urls'
import { isPublicRssFeedUrl } from './url-validation.mts'

type DiscoverFeedUrlDependencies = {
  addUrl: typeof addUrl
  enqueueCrawlUrlAndWait: typeof enqueueCrawlUrlAndWait
  getCrawlById: typeof getCrawlById
  getLatestHtmlSnapshotCrawlBefore: typeof getLatestHtmlSnapshotCrawlBefore
  getOrCreateCrawlerForHostname: typeof getOrCreateCrawlerForHostname
  getUrlById: typeof getUrlById
}

const defaultDependencies: DiscoverFeedUrlDependencies = {
  addUrl,
  enqueueCrawlUrlAndWait,
  getCrawlById,
  getLatestHtmlSnapshotCrawlBefore,
  getOrCreateCrawlerForHostname,
  getUrlById,
}

const CRAWL_DISCOVERY_WAIT_TIMEOUT_MS = 30_000
const CRAWL_DISCOVERY_RATE_LIMIT_MS = 1_000
const CRAWL_DISCOVERY_FETCH_TIMEOUT_MS = 10_000
const CRAWL_DISCOVERY_MAX_RESPONSE_SIZE_BYTES = 256 * 1024
const PRIORITY_HIGHEST = 0

// Ordered by preference (first match wins for each type category).
const FEED_TYPE_ORDER = [
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json',
] as const

/**
 * Returns the first RSS/Atom/JSON Feed URL from crawler HTML links, or null.
 *
 * The crawler worker owns HTML parsing. API-facing RSS validation only reads the
 * persisted `links.alternate` output from the crawl result.
 */
export function extractFeedLinkFromCrawlLinks(
  links: CrawlerHtmlStructuredObject | null | undefined,
  baseUrl: string,
): string | null {
  const alternate = links?.alternate
  if (!isStructuredObject(alternate)) return null

  for (const feedType of FEED_TYPE_ORDER) {
    const hrefs = getAlternateHrefsForType(alternate, feedType)
    for (const href of hrefs) {
      const resolved = safeResolveUrl(href, baseUrl)
      if (!resolved) continue
      if (resolved === baseUrl) continue
      if (!isPublicRssFeedUrl(resolved)) continue
      return resolved
    }
  }

  return null
}

/**
 * Runs an HTML crawl through the crawler queue and returns the first
 * autodiscovery feed URL found in the worker-side parsed link graph.
 *
 * Never throws — all errors result in null (the caller then 422s cleanly).
 */
export async function discoverFeedUrlFromHtml(
  pageUrl: string,
  dependencies: DiscoverFeedUrlDependencies = defaultDependencies,
): Promise<string | null> {
  if (process.env.PLAYWRIGHT_TEST === 'true' && process.env.NODE_ENV === 'test') return null

  try {
    const preserveHttp = new URL(pageUrl).protocol === 'http:'
    const url = await dependencies.addUrl(null, pageUrl, {
      preserveHttp,
      skipCreatedEvents: true,
    })
    const hostnameId = url?.hostname?.id
    if (!url || !hostnameId) return null

    await dependencies.getOrCreateCrawlerForHostname(null, hostnameId)
    const result = await dependencies.enqueueCrawlUrlAndWait(
      { urlId: url.id },
      {
        hostnameId,
        crawlTimeoutMs: CRAWL_DISCOVERY_FETCH_TIMEOUT_MS,
        ensureCrawlerForRedirects: true,
        ignoreRobotsTxt: isRobotsTxtIgnoredForFeeds(),
        maxResponseSizeBytes: CRAWL_DISCOVERY_MAX_RESPONSE_SIZE_BYTES,
        preserveHttpRedirects: preserveHttp,
        priority: PRIORITY_HIGHEST,
        rateLimitMs: CRAWL_DISCOVERY_RATE_LIMIT_MS,
        skipCanonicalUrl: true,
        skipChunks: true,
        skipEmbedResolution: true,
        skipCreatedEventsForRedirects: true,
        waitTimeoutMs: CRAWL_DISCOVERY_WAIT_TIMEOUT_MS,
      },
    )
    if (!result) return null
    const crawledUrl = await dependencies.getUrlById(result.url_id)
    const baseUrl = crawledUrl?.url ?? url.url

    if (result.response_status_code === 304) {
      const previousCrawl = await dependencies.getLatestHtmlSnapshotCrawlBefore(
        result.url_id,
        result.crawl_id,
      )
      return extractFeedLinkFromCrawlLinks(previousCrawl?.links, baseUrl)
    }
    if (result.response_status_code < 200 || result.response_status_code >= 300) return null

    const crawl = await dependencies.getCrawlById(result.crawl_id, result.url_id)
    return extractFeedLinkFromCrawlLinks(crawl?.links, baseUrl)
  } catch {
    return null
  }
}

function getAlternateHrefsForType(
  alternate: CrawlerHtmlStructuredObject,
  feedType: string,
): string[] {
  const hrefs: string[] = []
  const exact = alternate[feedType]
  if (exact !== undefined) hrefs.push(...structuredValueToStrings(exact))

  const feedTypeLower = feedType.toLowerCase()
  for (const [type, value] of Object.entries(alternate)) {
    if (type === feedType) continue
    if (type.toLowerCase().trim() === feedTypeLower) {
      hrefs.push(...structuredValueToStrings(value))
    }
  }
  return hrefs
}

function structuredValueToStrings(value: CrawlerHtmlStructuredValue | undefined): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(item => (typeof item === 'string' ? [item] : []))
  return []
}

function isStructuredObject(
  value: CrawlerHtmlStructuredValue | undefined,
): value is CrawlerHtmlStructuredObject {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
