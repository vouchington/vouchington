export type CrawlHostnamesJobs =
  | 'crawl_hostnames_dispatcher'
  | 'crawl_urls_per_hostname_dispatcher'
  | 'crawl_tier1_dispatcher'
  | 'crawl_tier2_dispatcher'
  | 'refresh_hostname_crawler_dispatcher'
  | 'refresh_hostname_crawler'
  | 'crawl_cleanup'

/** Fixed sweep bounds prevent retries or newly inserted URLs from starving the tail. */
export type CrawlDispatchCursor = { sweepStartedAt: string; afterId?: string }
export type CrawlUrlDispatchData = { hostname_id?: string; cursor?: CrawlDispatchCursor }
