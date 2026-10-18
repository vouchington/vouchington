export type LanguageDetectionEntityType =
  | 'post'
  | 'rss_feed_item'
  | 'crawl'
  | 'community'
  | 'user'
  | 'topic'

export type LanguageDetectionBackfillJobName =
  | 'backfill_posts'
  | 'backfill_rss_feed_items'
  | 'backfill_crawls'
  | 'backfill_communities'
  | 'backfill_users'
  | 'backfill_topics'

/** The snapshot fence and keyset position retained by one backfill job. */
export type LanguageDetectionBackfillCursor = { sweepStartedAt: string; afterId?: string }
