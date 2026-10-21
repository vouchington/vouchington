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

/** A frozen maintenance interval, retained on the actual CPU queue job. */
export type UploadCleanupKey = { stagedAt: string; id: string }
export type UploadCleanupPhase = 'staged' | 'recovery' | 'abandonment'
export type UploadCleanupWindow = {
  upper: UploadCleanupKey | null
  after?: UploadCleanupKey
  done: boolean
}
export type AbandonedUploadSweep = {
  recoveryCutoff: string
  abandonmentCutoff: string
  windows: Record<UploadCleanupPhase, UploadCleanupWindow>
}
export type CleanupAbandonedUploadsData = { sweep?: AbandonedUploadSweep }
