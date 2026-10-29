/** Shared bootstrap, maintenance, and retirement configuration for partitioned tables. */

import type { MonthlyPartitionTableConfig } from '@vouchington/postgres/partitions'
import {
  COPYRIGHT_HISTORY_PARTITION_TABLES,
  CRAWL_PARTITION_TABLES,
  POST_REVISION_PARTITION_TABLES,
  RSS_PARTITION_TABLES,
  TOPIC_REVISION_PARTITION_TABLES,
} from './partition-config-monthly.mts'

export {
  COPYRIGHT_HISTORY_PARTITION_TABLES,
  CRAWL_PARTITION_TABLES,
  POST_REVISION_PARTITION_TABLES,
  RSS_PARTITION_TABLES,
  TOPIC_REVISION_PARTITION_TABLES,
} from './partition-config-monthly.mts'

/** UUIDv7 post tables start with a default child and split on demand. */
export const POST_PARTITION_TABLES: string[] = [
  'posts',
  'post_review_topic_ratings',
  'post_data_point_topics',
  'post_explicit_topic_categories',
  'post_topic_recommendations',
  'agent_moderations',
]

/** Export history and its S3-attempt ledger share UUIDv7 request ranges. */
export const USER_DATA_REQUEST_PARTITION_TABLES = [
  'user_data_requests',
  'user_data_request_attempts',
] as const

/**
 * Classifier results retain one row per candidate. Topic and story-family ownership use
 * separate parents. All result families range by the UUIDv7 decision batch so batch-scoped replay
 * and retention share one time key. Topic and story lookups also have entity-leading indexes.
 */
export const CLASSIFIER_RESULT_PARTITION_TABLES: string[] = [
  'topic_classifier_results',
  'story_classifier_results',
  'community_prompt_classifier_results',
  'classifier_decision_batch_candidates',
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

/** All tables that require monthly RANGE partitions with retention. */
export const ALL_MONTHLY_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  ...CRAWL_PARTITION_TABLES,
  ...RSS_PARTITION_TABLES,
  ...COPYRIGHT_HISTORY_PARTITION_TABLES,
  ...POST_REVISION_PARTITION_TABLES,
  ...TOPIC_REVISION_PARTITION_TABLES,
]

export type PartitionDropPolicy = {
  /** Null refuses every drop until the table owner specifies a minimum. */
  minimumRetentionDays: number | null
  /** Calendar-month minimum for monthly legal history; overrides approximate day windows. */
  minimumRetentionMonths?: number
  legalBasis?: string
  /** A partition-column FK to the held account's retained user identity. */
  legalHoldAccountColumn?: string
  /** History row is preserved by a legal hold on a copyright case party or review account. */
  copyrightHistory?: true
  /** Referenced tables whose FK teardown locks precede the history parent lock. */
  retirementReferenceTables?: readonly string[]
  /** Each predicate must have a matching partial index on the partition parent. */
  inFlightPredicates?: readonly string[]
}

/** A null minimum makes retirement fail closed until the table owner chooses a window. */
export const PARTITION_DROP_POLICIES: Record<string, PartitionDropPolicy> = Object.fromEntries(
  [
    ...POST_PARTITION_TABLES,
    ...USER_DATA_REQUEST_PARTITION_TABLES,
    ...CLASSIFIER_RESULT_PARTITION_TABLES,
    ...USER_SESSION_PARTITION_TABLES,
    ...USER_KEY_PARTITION_TABLES,
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

for (const config of COPYRIGHT_HISTORY_PARTITION_TABLES) {
  PARTITION_DROP_POLICIES[config.table] = {
    minimumRetentionDays: config.retentionDays ?? null,
    minimumRetentionMonths: 72,
    legalBasis: 'docs/requirements/moderation/COPYRIGHT-NOTICES.md#evidence-retention',
    copyrightHistory: true,
  }
}

for (const table of CLASSIFIER_RESULT_PARTITION_TABLES) {
  PARTITION_DROP_POLICIES[table] = {
    minimumRetentionDays: 90,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  }
}

PARTITION_DROP_POLICIES.user_data_requests = {
  minimumRetentionDays: 30,
  legalBasis: 'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
}
PARTITION_DROP_POLICIES.user_data_request_attempts = {
  minimumRetentionDays: 30,
  legalBasis: 'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
}

PARTITION_DROP_POLICIES.topic_revisions = {
  minimumRetentionDays: null,
  minimumRetentionMonths: 12,
  legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  retirementReferenceTables: ['topics', 'users'],
}

PARTITION_DROP_POLICIES.post_revisions = {
  minimumRetentionDays: null,
  minimumRetentionMonths: 72,
  legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  retirementReferenceTables: ['posts', 'users'],
}

// Security call audits may be retired only after the privacy-policy window. The legal
// decision rationale lives with its copyright case and is not retained by this partition.
PARTITION_DROP_POLICIES['mcp_call_audit_events'] = {
  minimumRetentionDays: 366,
  legalBasis: 'articles/privacy-policy.md',
  legalHoldAccountColumn: 'actor_user_id',
}
