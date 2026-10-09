export type CrawlHostnamesJobs =
  | 'enqueueCrawlHostnamesDispatcher'
  | 'enqueueCrawlTier1Dispatcher'
  | 'enqueueCrawlTier2Dispatcher'
  | 'crawl_hostnames_dispatcher'
  | 'crawl_urls_per_hostname_dispatcher'
  | 'crawl_tier1_dispatcher'
  | 'crawl_tier2_dispatcher'
  | 'refresh_hostname_crawler_dispatcher'
  | 'refresh_hostname_crawler'
  | 'crawl_cleanup'

/** Fixed sweep bounds prevent retries or newly inserted URLs from starving the tail. */
export type CrawlDispatchCursor = { sweepStartedAt: string; afterId?: string }

/** Each bounded pass retains the position within its threshold and index range. */
export type CrawlHostnameDispatchCursor = {
  sweepStartedAt: string
  rangeLimit: number
  afterBucketDays: number
  bucketDays?: number
  range?: 0 | 1
  afterId?: string
  afterSweptAt?: string
}
