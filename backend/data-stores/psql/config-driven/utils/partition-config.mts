/**
 * Centralized configuration for tables that require partitions.
 *
 * This is the single source of truth for which tables need time-based partitions.
 * Used by both:
 * - Config-driven migrations (initial partition creation)
 * - Monthly scheduled job (ongoing partition creation for conversation tables)
 */

export type MonthlyPartitionTableConfig = {
  table: string
  pastMonths?: number
  futureMonths?: number
  retentionDays?: number
  dropPriority?: number
}

export const DEFAULT_MONTHLY_PARTITION_PAST_MONTHS = 1
export const DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS = 12

function monthlyPartitionTable(
  table: string,
  overrides: Omit<MonthlyPartitionTableConfig, 'table'> = {},
): MonthlyPartitionTableConfig {
  return { table, ...overrides }
}

/**
 * Posts tables - partitioned by UUIDv7 timestamp
 * Default partition, split by adding explicit range partitions when needed
 */
export const POST_PARTITION_TABLES: string[] = [
  'posts',
  'post_review_topic_ratings',
  'post_data_point_topics',
  'post_explicit_topic_categories',
  'post_topic_recommendations',
  'post_autotagger_results',
  'agent_moderations',
]

/**
 * Conversation tables - partitioned by UUIDv7 timestamp
 * Monthly partitions for 30-day retention via partition drop
 */
export const CONVERSATION_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('conversation_message_agentic_runs', {
    retentionDays: 30,
    dropPriority: 1,
  }),
  monthlyPartitionTable('conversation_message_agentic_runs_events', {
    retentionDays: 30,
    dropPriority: 0,
  }),
]

/**
 * Agent response tables - partitioned by UUIDv7 timestamp
 * Monthly partitions for 30-day retention via partition drop
 */
export const AGENT_RESPONSE_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('agent_responses', { retentionDays: 30, dropPriority: 0 }),
]

/**
 * RSS feed crawl history - partitioned by UUIDv7 timestamp
 * Monthly partitions for 30-day retention via partition drop
 */
export const RSS_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  monthlyPartitionTable('rss_feed_crawls', { retentionDays: 30, futureMonths: 2 }),
]

/**
 * Durable publication projection receipts partition by their post UUID, aligned with `posts`.
 * Retained dirty-work keys partition by their owning work UUID. Both start with default children;
 * explicit UUIDv7 ranges are added only after measured pressure.
 */
export const POST_PUBLICATION_PARTITION_TABLES: string[] = [
  'post_publication_projection_receipts',
  'post_publication_dirty_work_keys',
]

/**
 * Session tables - partitioned by UUIDv7 JWT sid/id
 * Default partition only; explicit range partitions are added manually when needed
 */
export const USER_SESSION_PARTITION_TABLES: string[] = ['user_sessions']

/**
 * High-volume tables keyed by a UUIDv7 parent/user identifier.
 * Default partition only; explicit aligned ranges are added when needed.
 */
export const USER_KEY_PARTITION_TABLES: string[] = [
  'conversation_messages',
  'notifications',
  'web_push_subscriptions',
  'post_feed_shares',
  'rss_feed_item_feed_shares',
  'rss_feed_item_read_states',
  'post_read_states',
]

/**
 * Revision tables - partitioned by UUIDv7 timestamp
 * Default partition, split by adding explicit range partitions when needed
 */
export const REVISION_PARTITION_TABLES: string[] = ['post_revisions']

/**
 * Growth ledger tables - partitioned by UUIDv7 id
 * Default partition, split by adding explicit range partitions when needed
 */
export const DEFERRED_LEDGER_PARTITION_TABLES: string[] = [
  'ai_usage_records',
  'post_clearance_changes',
  'session_referral_attributions',
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

/**
 * All tables that require monthly RANGE partitions (conversation tables with retention)
 */
export const ALL_MONTHLY_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  ...CONVERSATION_PARTITION_TABLES,
  ...CRAWL_PARTITION_TABLES,
  ...AGENT_RESPONSE_PARTITION_TABLES,
  ...RSS_PARTITION_TABLES,
]

export const MONTHLY_PARTITION_RETENTION_TABLES = ALL_MONTHLY_PARTITION_TABLES.filter(
  config => config.retentionDays !== undefined,
)
