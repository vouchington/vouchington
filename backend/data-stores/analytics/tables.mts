export * from './table-records.mts'
export * from './table-records-pg.mts'

import type {
  CrawlerRequestRecord,
  ValkeyCacheCallRecord,
  QueueJobRecord,
  QueueWorkerRecord,
  RssFeedProcessingRecord,
  AICallRecord,
  WebPageViewRecord,
  WebClickRecord,
  AuthSessionRecord,
  ContributionAdmissionRecord,
} from './table-records.mts'
import type {
  PgQueryTimingRecord,
  PgPoolStatsRecord,
  PgVoteDriftRecord,
} from './table-records-pg.mts'

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface AnalyticsTableRegistry {
  crawler_requests: CrawlerRequestRecord
  valkey_cache_calls: ValkeyCacheCallRecord
  queue_jobs: QueueJobRecord
  queue_workers: QueueWorkerRecord
  rss_feed_processing: RssFeedProcessingRecord
  ai_calls: AICallRecord
  web_page_view: WebPageViewRecord
  web_click: WebClickRecord
  auth_sessions: AuthSessionRecord
  contribution_admission: ContributionAdmissionRecord
  pg_query_timing: PgQueryTimingRecord
  pg_pool_stats: PgPoolStatsRecord
  pg_vote_drift: PgVoteDriftRecord
}

export type AnalyticsTableName = keyof AnalyticsTableRegistry

export const ANALYTICS_TABLES: AnalyticsTableName[] = [
  'crawler_requests',
  'valkey_cache_calls',
  'queue_jobs',
  'queue_workers',
  'rss_feed_processing',
  'ai_calls',
  'web_page_view',
  'web_click',
  'auth_sessions',
  'contribution_admission',
  'pg_query_timing',
  'pg_pool_stats',
  'pg_vote_drift',
]
