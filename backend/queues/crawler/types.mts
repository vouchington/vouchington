export type CrawlerJobs = 'crawl_url'

export type EnqueueCrawlerJobOptions = {
  delay?: number
  priority?: number
  /** Hostname ID used as the ordering key for per-domain rate limiting */
  hostnameId?: string
  /** Rate limit window in ms (max 1 job per window per hostname). Default: 1000 */
  rateLimitMs?: number
  /** Timeout for the underlying HTML fetch, distinct from queue wait timeout */
  crawlTimeoutMs?: number
  /** Synchronously create crawler rows for redirect targets before recursive crawls */
  ensureCrawlerForRedirects?: boolean
  /** Ignore robots.txt checks for callers whose policy already allows the fetch */
  ignoreRobotsTxt?: boolean
  /** Maximum HTML response body size for the underlying fetch */
  maxResponseSizeBytes?: number
  /** Preserve HTTP scheme when creating redirect target URLs */
  preserveHttpRedirects?: boolean
  /** Skip canonical URL writes while persisting crawl content */
  skipCanonicalUrl?: boolean
  /** Skip expensive post-processing when the caller only needs parsed crawl metadata */
  skipChunks?: boolean
  /** Skip optional embed resolution when the caller only needs crawl metadata */
  skipEmbedResolution?: boolean
  /** Suppress URL-created side effects for redirect target URLs */
  skipCreatedEventsForRedirects?: boolean
  /** Retain completed job results for a synchronous waiter */
  waitForResult?: boolean
}

export type EnqueueCrawlUrlEntry = {
  urlId: string
  options?: EnqueueCrawlerJobOptions
  crawlTimeoutMs?: number
  /** Number of times this job has already been re-enqueued due to 429 rate limit responses */
  rateLimitRetryCount?: number
  skipChunks?: boolean
}
