import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { VOTE_SCHEMA_CONFIGS } from './config-driven/utils/election-schema-config.mts'
import { buildUnboundedUnpartitionedTables } from './schema-growth-classification.mts'

export type PartitionAccessClass = 'target-scoped' | 'retention-window' | 'intentional-fanout'

export type PartitionPolicy = {
  strategy: 'RANGE'
  key: string
  children: 'default' | 'monthly'
  retentionOwner: 'cleanupPartitions' | null
  accessClass: PartitionAccessClass
}

const defaultRange = (key: string): PartitionPolicy => ({
  strategy: 'RANGE',
  key,
  children: 'default',
  retentionOwner: null,
  accessClass: 'target-scoped',
})

const monthlyRange = (key: string): PartitionPolicy => ({
  strategy: 'RANGE',
  key,
  children: 'monthly',
  retentionOwner: 'cleanupPartitions',
  accessClass: 'retention-window',
})

const PARTITION_POLICY_ENTRIES: [string, PartitionPolicy][] = [
  ['retained_post_identities', defaultRange('id')],
  ['retained_rss_feed_item_identities', defaultRange('id')],
  ['retained_image_identities', defaultRange('id')],
  ['retained_image_placement_bindings', defaultRange('placement_id')],
  ['posts', defaultRange('id')],
  ['rss_feed_items', defaultRange('id')],
  ['post_review_topic_ratings', defaultRange('post_id')],
  ['post_data_point_topics', defaultRange('post_id')],
  ['post_explicit_topic_categories', defaultRange('post_id')],
  ['post_topic_recommendations', defaultRange('post_id')],
  ['post_autotagger_results', defaultRange('post_id')],
  ['agent_moderations', defaultRange('post_id')],
  ['classifier_decision_batch_candidates', defaultRange('batch_id')],
  ['topic_classifier_results', defaultRange('topic_id')],
  ['story_classifier_results', defaultRange('batch_id')],
  ['community_prompt_classifier_results', defaultRange('batch_id')],
  ['rss_feed_crawls', monthlyRange('id')],
  ['post_publication_projection_receipts', defaultRange('post_identity_id')],
  ['post_publication_post_identities', defaultRange('id')],
  ['post_publication_dirty_work_keys', defaultRange('dirty_work_id')],
  ['post_revisions', defaultRange('id')],
  ['ai_usage_records', defaultRange('id')],
  ['post_clearance_changes', defaultRange('id')],
  ['mcp_call_audit_events', defaultRange('id')],
  ['community_post_review_changes', defaultRange('id')],
  ['user_sessions', defaultRange('id')],
  ['session_referral_attributions', defaultRange('id')],
  ['conversation_messages', defaultRange('conversation_id')],
  ['notifications', defaultRange('user_id')],
  ['web_push_subscriptions', defaultRange('user_id')],
  ['post_feed_shares', defaultRange('recipient_user_id')],
  ['rss_feed_item_feed_shares', defaultRange('recipient_user_id')],
  ['post_read_states', defaultRange('user_id')],
  ['rss_feed_item_read_states', defaultRange('user_id')],
  ['crawls', monthlyRange('id')],
  ['crawl_chunks', monthlyRange('crawl_id')],
  ...VOTE_SCHEMA_CONFIGS.map(({ voteTable, entityIdColumn }): [string, PartitionPolicy] => [
    voteTable,
    defaultRange(entityIdColumn),
  ]),
  ...entityRelationMetadatum.flatMap(({ subject_type, table_name }): [string, PartitionPolicy][] =>
    subject_type === 'post' ? [[table_name, defaultRange('subject_id')]] : [],
  ),
  ...entityRelationMetadatum.flatMap((metadata): [string, PartitionPolicy][] =>
    metadata.election
      ? [[getEntityRelationVoteTableName(metadata), defaultRange('entity_relation_id')]]
      : [],
  ),
]

export const PARTITION_POLICIES = new Map(PARTITION_POLICY_ENTRIES)
export const UNBOUNDED_UNPARTITIONED_TABLES = buildUnboundedUnpartitionedTables(
  new Set(PARTITION_POLICIES.keys()),
)
