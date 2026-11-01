/** Shared bootstrap, maintenance, and retirement configuration for partitioned tables. */

import type { MonthlyPartitionTableConfig } from '@vouchington/postgres/partitions'
import {
  AI_USAGE_PARTITION_TABLES,
  COPYRIGHT_HISTORY_PARTITION_TABLES,
  CRAWL_PARTITION_TABLES,
  DECISION_HISTORY_PARTITION_TABLES,
  POST_REVISION_PARTITION_TABLES,
  RSS_PARTITION_TABLES,
  TOPIC_REVISION_PARTITION_TABLES,
} from './partition-config-monthly.mts'

export {
  AI_USAGE_PARTITION_TABLES,
  COPYRIGHT_HISTORY_PARTITION_TABLES,
  CRAWL_PARTITION_TABLES,
  DECISION_HISTORY_PARTITION_TABLES,
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
export const CLASSIFIER_RESULT_PARTITION_TABLES = [
  'topic_classifier_results',
  'story_classifier_results',
  'community_prompt_classifier_results',
  'classifier_decision_batch_candidates',
] as const

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
  'mcp_call_audit_events',
  'session_referral_attributions',
]

/** All tables that require monthly RANGE partitions with retention. */
export const ALL_MONTHLY_PARTITION_TABLES: MonthlyPartitionTableConfig[] = [
  ...CRAWL_PARTITION_TABLES,
  ...RSS_PARTITION_TABLES,
  ...COPYRIGHT_HISTORY_PARTITION_TABLES,
  ...POST_REVISION_PARTITION_TABLES,
  ...TOPIC_REVISION_PARTITION_TABLES,
  ...DECISION_HISTORY_PARTITION_TABLES,
  ...AI_USAGE_PARTITION_TABLES,
]
