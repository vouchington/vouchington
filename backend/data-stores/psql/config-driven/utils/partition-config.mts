/**
 * Centralized configuration for tables that require partitions.
 *
 * This is the single source of truth for which tables need time-based partitions.
 * Used by both:
 * - Config-driven migrations (initial partition creation)
 * - Monthly scheduled job (ongoing partition creation for crawl and RSS history tables)
 */

import type { MonthlyPartitionTableConfig } from '@vouchington/postgres/partitions'

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
 * Classifier results retain one row per candidate. Topic and story-family ownership use
 * separate parents; topic results prune by topic_id, while story-family results hold either a
 * story or a standalone RSS item (so no single entity column can be the key) and prune by the
 * UUIDv7 decision batch_id instead. Community prompt results have no stable per-prompt key worth
 * pruning on, so they range over their decision batch too.
 */
export const CLASSIFIER_RESULT_PARTITION_TABLES: string[] = [
  'classifier_decision_batch_candidates',
  'topic_classifier_results',
  'story_classifier_results',
  'community_prompt_classifier_results',
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
  'post_publication_post_identities',
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
  'community_post_review_changes',
  'mcp_call_audit_events',
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
 * All tables that require monthly RANGE partitions (crawl and RSS history with retention)
 */
export const ALL_MONTHLY_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  ...CRAWL_PARTITION_TABLES,
  ...RSS_PARTITION_TABLES,
]

export type PartitionDropPolicy = {
  /** Null refuses every drop unless the table owner declares calendar months instead. */
  minimumRetentionDays: number | null
  /** Exact calendar-month minimum, with month-end clamping. */
  minimumRetentionMonths?: number
  legalBasis?: string
  /** A partition-column FK to the held account's retained user identity. */
  legalHoldAccountColumn?: string
  /** A partition-column FK to posts; a held post author blocks retirement. */
  legalHoldPostColumn?: string
  /** Each predicate must have a matching partial index on the partition parent. */
  inFlightPredicates?: readonly string[]
}

/** A null minimum makes retirement fail closed until the table owner chooses a window. */
export const PARTITION_DROP_POLICIES: Record<string, PartitionDropPolicy> = Object.fromEntries(
  [
    ...POST_PARTITION_TABLES,
    ...CLASSIFIER_RESULT_PARTITION_TABLES,
    ...POST_PUBLICATION_PARTITION_TABLES,
    ...USER_SESSION_PARTITION_TABLES,
    ...USER_KEY_PARTITION_TABLES,
    ...REVISION_PARTITION_TABLES,
    ...DEFERRED_LEDGER_PARTITION_TABLES,
  ].map(table => [table, { minimumRetentionDays: null }]),
)

for (const config of ALL_MONTHLY_PARTITION_TABLES) {
  PARTITION_DROP_POLICIES[config.table] = {
    minimumRetentionDays: config.retentionDays ?? null,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
    ...(config.table === 'crawls' && {
      inFlightPredicates: ['completed_at IS NULL', 'has_pending_embeddings = TRUE'],
    }),
    ...(config.table === 'crawl_chunks' && {
      inFlightPredicates: ['bedrock_nova_multimodal_v1_embedding_created_at IS NULL'],
    }),
  }
}

// Security call audits may be retired only after the privacy-policy window. The legal
// decision rationale lives with its copyright case and is not retained by this partition.
PARTITION_DROP_POLICIES['mcp_call_audit_events'] = {
  minimumRetentionDays: 366,
  legalBasis: 'articles/privacy-policy.md',
}

// Proposed defaults: history older than these complete UUIDv7 ranges may be retired by the
// owner. The guard is not an automatic schedule or range creator.
for (const [table, retention] of [
  ['post_revisions', { minimumRetentionDays: 90 }],
  ['post_clearance_changes', { minimumRetentionDays: null, minimumRetentionMonths: 12 }],
  ['community_post_review_changes', { minimumRetentionDays: null, minimumRetentionMonths: 12 }],
] as const) {
  PARTITION_DROP_POLICIES[table] = {
    ...retention,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
    legalHoldPostColumn: 'post_id',
    ...(table === 'post_revisions' && { legalHoldAccountColumn: 'revised_by_id' }),
    ...(table === 'post_clearance_changes' && { legalHoldAccountColumn: 'changed_by_id' }),
    ...(table === 'community_post_review_changes' && { legalHoldAccountColumn: 'changed_by_id' }),
  }
}
