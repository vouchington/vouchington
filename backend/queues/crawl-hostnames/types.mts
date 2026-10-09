export type CrawlHostnamesJobs =
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

/** Each threshold and its two index ranges receive a bounded share of a fixed sweep. */
export type CrawlHostnameDispatchCursor = {
  sweepStartedAt: string
  rangeLimit: number
  afterBucketDays: number
  bucketDays?: number
  range?: 0 | 1
  rangeRows?: number
  afterId?: string
  afterSweptAt?: string
}
