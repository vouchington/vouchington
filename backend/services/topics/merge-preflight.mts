import type { TransactionQuery } from '@data-stores/psql'
import { buildTopicRelationAuditConflictsSql } from './merge-relations.mts'
import { createCodedError } from '@modules/on-error/create-coded-error'

/** Exclusive topic lifecycle fences protect every changed reference during this read; rejection precedes publication and merge writes. */
export async function assertTopicMergeReferenceCompatibility(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): Promise<void> {
  const { rows } = await query<{
    kind: 'feed' | 'lifetime_version' | 'subtype_reference' | 'audit_flag'
    source_id: string
    destination_id: string
  }>(
    `/* assertTopicMergeReferenceCompatibility */
      SELECT 'feed' AS kind, s.id AS source_id, d.id AS destination_id
      FROM rss_feeds s JOIN rss_feeds d ON d.topic_id = $2::uuid AND d.deleted_at IS NULL
      WHERE s.topic_id = $1::uuid AND s.deleted_at IS NULL
      UNION ALL
      SELECT 'lifetime_version', s.topic_id, d.topic_id
      FROM rewards_program_status_topics s JOIN rewards_program_status_topics d
        ON d.lifetime_version_id = $2::uuid AND d.topic_id <> $1::uuid
      WHERE s.lifetime_version_id = $1::uuid AND s.topic_id <> $1::uuid
      UNION ALL
      SELECT 'lifetime_version', status.topic_id, $2::uuid
      FROM rewards_program_status_topics status
      WHERE status.topic_id = $2::uuid AND status.lifetime_version_id = $1::uuid
      UNION ALL
      SELECT 'lifetime_version', status.topic_id, destination.id
      FROM rewards_program_status_topics status
      JOIN topics owner ON owner.id = status.topic_id AND owner.deleted_at IS NULL AND owner.merged_into_topic_id IS NULL
      JOIN topics destination ON destination.id = $2::uuid AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL
      WHERE status.lifetime_version_id = $1::uuid AND status.topic_id <> $1::uuid
        AND owner.rewards_program_topic_id IS DISTINCT FROM destination.rewards_program_topic_id
      UNION ALL
      SELECT 'subtype_reference', s.id, d.id FROM user_referral_program_links s
      JOIN user_referral_program_links d ON d.referral_program_topic_id = $2::uuid
        AND d.user_id = s.user_id AND d.url_id = s.url_id AND d.deleted_at IS NULL
      WHERE s.referral_program_topic_id = $1::uuid AND s.deleted_at IS NULL
      UNION ALL
      SELECT 'subtype_reference', s.id, d.id FROM individual_rewards_program_point_valuations s
      JOIN individual_rewards_program_point_valuations d ON d.rewards_program_topic_id = $2::uuid AND d.individual_id = s.individual_id
      WHERE s.rewards_program_topic_id = $1::uuid
      UNION ALL
      SELECT 'subtype_reference', s.retailer_topic_id, d.retailer_topic_id FROM retailer_countries s
      JOIN retailer_countries d ON d.retailer_topic_id = $2::uuid AND d.country_id = s.country_id
      WHERE s.retailer_topic_id = $1::uuid
      UNION ALL
      SELECT 'subtype_reference', s.referral_program_topic_id, d.referral_program_topic_id
      FROM referral_program_topic_link_validation_rule_sets s
      JOIN referral_program_topic_link_validation_rule_sets d ON d.referral_program_topic_id = $2::uuid
        AND d.referral_program_link_validation_rule_set_id = s.referral_program_link_validation_rule_set_id
      WHERE s.referral_program_topic_id = $1::uuid
      UNION ALL ${buildTopicRelationAuditConflictsSql()}`,
    [sourceTopicId, destinationTopicId],
  )
  const conflict = rows[0]
  if (!conflict) return
  const code =
    conflict.kind === 'feed'
      ? 'topic_merge_feed_conflict'
      : conflict.kind === 'lifetime_version'
        ? 'topic_merge_lifetime_version_conflict'
        : 'topic_merge_reference_conflict'
  throw Object.assign(
    createCodedError(
      409,
      `Cannot merge topics with conflicting ${conflict.kind} rows ${conflict.source_id} and ${conflict.destination_id}`,
      code,
    ),
    {
      source_id: conflict.source_id,
      destination_id: conflict.destination_id,
    },
  )
}
