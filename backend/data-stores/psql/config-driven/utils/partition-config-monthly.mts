import type { MonthlyPartitionTableConfig } from '@vouchington/postgres/partitions'

function monthlyPartitionTable(
  table: string,
  overrides: Omit<MonthlyPartitionTableConfig, 'table'> = {},
): MonthlyPartitionTableConfig {
  return { table, ...overrides }
}

/** RSS feed crawl history retires by whole monthly child after thirty days. */
export const RSS_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('rss_feed_crawls', { retentionDays: 30, futureMonths: 2 }),
]

/** Detailed copyright transitions and staff decisions expire by whole calendar month. */
export const COPYRIGHT_HISTORY_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  'copyright_notice_lifecycle_changes',
  'copyright_territorial_decisions',
  'copyright_territorial_redress_decisions',
  'copyright_notice_submission_assessments',
  'copyright_notice_email_intake_recommendations',
  'copyright_notice_email_intake_reviews',
  'copyright_notice_email_correspondence_reviews',
  'copyright_restriction_administrator_lifts',
  'copyright_repeat_infringer_dispositions',
  'copyright_repeat_infringer_reviews',
].map(table =>
  monthlyPartitionTable(table, { pastMonths: 12, futureMonths: 2, retentionDays: 2192 }),
)

/** Topic revision history expires by whole monthly child after twelve calendar months. */
export const TOPIC_REVISION_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('topic_revisions', { retentionDays: 0, futureMonths: 2 }),
]

// retentionDays: 0 marks both revision tables for filterRetainedMonthlyPartitionTables;
// PARTITION_DROP_POLICIES.minimumRetentionMonths sets their real windows.
/** Post revision history expires by whole monthly child after 72 calendar months. */
export const POST_REVISION_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('post_revisions', { retentionDays: 0, futureMonths: 2 }),
]

/**
 * Crawl tables - partitioned by UUIDv7 timestamp
 * Monthly partitions for 30-day retention via partition drop
 * Drop order: crawl_chunks first (FK dependency), then crawls
 *
 * `retentionDays: 30` is not an exact per-row cutoff: `cleanupPartitions` only drops a whole
 * monthly partition once its exclusive upper bound (the start of the *next* month) passes
 * `now - retentionDays`. That makes the effective retention window roughly 30-61 days depending on where
 * in the month a row falls, and the current month's partition is never droppable before the last day of the
 * following month. `crawl_chunks` also has `ON DELETE CASCADE` on `crawl_id`, so even a direct
 * row-delete of `crawls` (outside this partition-drop path) cannot orphan `crawl_chunks` rows.
 */
export const CRAWL_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('crawl_chunks', { retentionDays: 30, dropPriority: 0, futureMonths: 2 }),
  monthlyPartitionTable('crawls', { retentionDays: 30, dropPriority: 1, futureMonths: 2 }),
]

/** Per-call evidence is folded in bounded pages before its whole monthly child is retired. */
export const AI_USAGE_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('ai_usage_records', { retentionDays: 180 }),
]

/**
 * Monthly decision history is retired by whole guarded partitions after six years.
 * `retentionDays: 0` admits these tables to the shared monthly catalog selector;
 * the local drop guard enforces the exact 72-calendar-month minimum.
 */
export const DECISION_HISTORY_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('post_clearance_changes', { retentionDays: 0, futureMonths: 2 }),
  monthlyPartitionTable('community_post_review_changes', { retentionDays: 0, futureMonths: 2 }),
]
