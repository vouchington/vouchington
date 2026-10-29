import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { VOTE_SCHEMA_CONFIGS } from './config-driven/utils/election-schema-config.mts'
import { buildUnboundedUnpartitionedTables } from './schema-growth-classification.mts'

export type PartitionAccessClass = 'target-scoped' | 'retention-window' | 'intentional-fanout'

type PartitionPolicy = {
  strategy: 'RANGE'
  key: string
  children: 'default' | 'monthly'
  retentionOwner: 'cleanupPartitions' | 'runDataRetentionCleanup' | 'operatorPartitionDrop' | null
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

const operatorRetentionRange = (key: string): PartitionPolicy => ({
  strategy: 'RANGE',
  key,
  children: 'default',
  retentionOwner: 'operatorPartitionDrop',
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
  ['agent_moderations', defaultRange('post_id')],
  ['topic_classifier_results', operatorRetentionRange('batch_id')],
  ['user_data_requests', operatorRetentionRange('id')],
  ['user_data_request_attempts', operatorRetentionRange('request_id')],
  ['classifier_decision_batch_candidates', operatorRetentionRange('batch_id')],
  ['story_classifier_results', operatorRetentionRange('batch_id')],
  ['community_prompt_classifier_results', operatorRetentionRange('batch_id')],
  ['rss_feed_crawls', monthlyRange('id')],
  ['copyright_notice_lifecycle_changes', monthlyRange('id')],
  ['copyright_territorial_decisions', monthlyRange('id')],
  ['copyright_territorial_redress_decisions', monthlyRange('id')],
  ['copyright_notice_submission_assessments', monthlyRange('id')],
  ['copyright_notice_email_intake_recommendations', monthlyRange('id')],
  ['copyright_notice_email_intake_reviews', monthlyRange('id')],
  ['copyright_notice_email_correspondence_reviews', monthlyRange('id')],
  ['copyright_restriction_administrator_lifts', monthlyRange('id')],
  ['copyright_repeat_infringer_dispositions', monthlyRange('id')],
  ['copyright_repeat_infringer_reviews', monthlyRange('id')],
  ['post_revisions', monthlyRange('id')],
  ['topic_revisions', monthlyRange('id')],
  ['ai_usage_records', defaultRange('id')],
  ['post_clearance_changes', defaultRange('id')],
  ['mcp_call_audit_events', defaultRange('id')],
  ['community_post_review_changes', defaultRange('id')],
  [
    'user_sessions',
    {
      ...defaultRange('id'),
      accessClass: 'retention-window',
      retentionOwner: 'runDataRetentionCleanup',
    },
  ],
  ['session_referral_attributions', defaultRange('id')],
  ['conversation_messages', defaultRange('conversation_id')],
  ['notifications', defaultRange('user_id')],
  [
    'web_push_subscriptions',
    {
      ...defaultRange('user_id'),
      accessClass: 'retention-window',
      retentionOwner: 'runDataRetentionCleanup',
    },
  ],
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
