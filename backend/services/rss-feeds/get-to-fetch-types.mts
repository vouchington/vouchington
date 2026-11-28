export type RssFeedToFetch = {
  id: string
  url: string
  url_hostname_id: string
  crawlable: boolean
  title: string | null
  declared_language: string | null
  last_modified_at: Date | null
  etag: string | null
  last_fetch_succeeded_at: Date | null
  last_fetch_failed_at: Date | null
  feed_type: 'article' | 'podcast' | 'video' | 'mixed'
  feed_ignore_robots_txt: boolean | null
  hostname_ignore_robots_txt: boolean | null
  feed_unreliable_status_codes: number[] | null
  hostname_unreliable_status_codes: number[] | null
  crawl_score: number
  crawl_tier: number
  priority_group: 1 | 2
}

export type RssFeedDispatchCursor = {
  lane: number
  afterId: string
  afterLastFetchedAt?: string | null
  throughId?: string
}

export type RssFeedDispatchCandidate = RssFeedToFetch & { dispatch_lane: number }

export type RssFeedDispatchPage = {
  feeds: RssFeedDispatchCandidate[]
  rawRowsRead: number
  nextCursor?: RssFeedDispatchCursor
}
