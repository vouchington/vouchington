import type { CrawlerHtmlResult } from '@services/crawler-html'
import type CrawlerHtml from '@services/crawler-html'
import type { getOrCreateCrawlerForHostname } from '@services/crawlers'
import type { getUrlById } from '@services/urls/get'
import type { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import type { resolveSafeCrawlerAddresses } from './safety.mts'
import type { CrawlBasic } from '../types.mts'

export type CrawlUrlOptions = {
  dependencies?: Partial<CrawlUrlDependencies>
  ensureCrawlerForRedirects?: boolean
  ignoreRobotsTxt?: boolean
  maxResponseSizeBytes?: number
  preserveHttpRedirects?: boolean
  skipCanonicalUrl?: boolean
  skipChunks?: boolean
  skipEmbedResolution?: boolean
  skipCreatedEventsForRedirects?: boolean
  /** Per-phase timeout (DNS resolution, request-to-headers, response-body download each get this
   *  budget independently — not divided between them). Unset phases fall back to their own
   *  hardcoded defaults. */
  timeoutMs?: number
  /** Total ceiling across the whole redirect-hop chain. Default: 60000ms (60s). Independent of
   *  `timeoutMs` — a hard stop between hops, not a divisor of the per-phase budgets. */
  totalTimeoutMs?: number
  /** Internal: absolute deadline (`Date.now()`-based) stamped on the first hop and carried
   *  verbatim through the redirect recursion so hop 2+ inherits hop 1's remaining budget instead
   *  of restarting a fresh `totalTimeoutMs`. Callers should not set this directly. */
  deadlineAt?: number
}

export type CrawlUrlDependencies = {
  ensureCrawlerForHostname: typeof getOrCreateCrawlerForHostname
  fetchCrawlerHtml: typeof CrawlerHtml
  isUrlCrawlable: (url: string, userAgent: string) => Promise<boolean>
  onRedirectError: (error: Error) => void
  resolveDnsCanary: () => Promise<void>
  resolveSafeCrawlerAddresses: typeof resolveSafeCrawlerAddresses
}

export type CrawlUrlReturn = CrawlBasic | null
export type CrawlUrlRecord = NonNullable<Awaited<ReturnType<typeof getUrlById>>>
export type CrawlHostnameRecord = NonNullable<
  Awaited<ReturnType<typeof getUrlHostnameCrawlerDetailsById>>
>
export type CrawlUrlRunner = (
  urlId: string,
  hopCount: number,
  visitedUrls: Set<string>,
  options?: CrawlUrlOptions,
) => Promise<CrawlUrlReturn>

export type RedirectResult = {
  crawl?: CrawlBasic
  handled: boolean
  statusRecorded: boolean
}

export type CrawlHtmlFetchResult = CrawlerHtmlResult
