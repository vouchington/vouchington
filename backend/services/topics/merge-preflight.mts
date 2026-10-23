import type { Topic } from './types.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { buildTopicRelationAuditConflictsSql } from './merge-relations.mts'
import { createCodedError } from '@modules/on-error/create-coded-error'
import assert from 'http-assert'

type MergeRow = Pick<Topic, 'id' | 'slug' | 'topic_type'> &
  Record<'is_deleted' | 'is_merged', boolean>

/** Lock both participants after publication capture and retain precise inactive-topic errors. */
export async function lockAndAssertMergeParticipants(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): Promise<MergeRow> {
  const { rows } = await query<MergeRow>(
    // no-mistakes-disable-next-line postgres-required-predicates: lifecycle output enables precise 404/409 assertions below
    `/* mergeTopicAliases lockTopics */ SELECT id, slug, topic_type, deleted_at IS NOT NULL AS is_deleted, merged_into_topic_id IS NOT NULL AS is_merged FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceTopicId, destinationTopicId]],
  )
  const sourceRow = rows.find(row => row.id === sourceTopicId)
  const destinationRow = rows.find(row => row.id === destinationTopicId)
  assert(sourceRow && !sourceRow.is_deleted, 404, 'Source topic not found')
  assert(destinationRow && !destinationRow.is_deleted, 404, 'Destination topic not found')
  assert(!sourceRow.is_merged, 409, 'Source topic has already been merged')
  assert(!destinationRow.is_merged, 409, 'Destination topic has already been merged')
  assertLockedTopicMergeTypes(sourceRow, destinationRow)
  return sourceRow
}

/** Exclusive topic lifecycle fences protect every changed reference during this read; rejection precedes publication and merge writes. */
export async function assertTopicMergeReferenceCompatibility(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): Promise<void> {
  const { rows } = await query<{
    kind:
      | 'feed'
      | 'lifetime_version'
      | 'subtype_reference'
      | 'audit_flag'
      | 'self_relation_audit_flag'
      | 'topic_type'
    source_id: string
    destination_id: string
  }>(
    `/* assertTopicMergeReferenceCompatibility */
      SELECT 'topic_type' AS kind, s.id AS source_id, d.id AS destination_id
      FROM topics s JOIN topics d ON d.id = $2::uuid
      WHERE s.id = $1::uuid AND s.topic_type <> d.topic_type
        AND s.deleted_at IS NULL AND s.merged_into_topic_id IS NULL
        AND d.deleted_at IS NULL AND d.merged_into_topic_id IS NULL
      UNION ALL
      SELECT 'feed' AS kind, s.id AS source_id, d.id AS destination_id
      FROM rss_feeds s JOIN rss_feeds d ON d.topic_id = $2::uuid AND d.deleted_at IS NULL
      WHERE s.topic_id = $1::uuid AND s.deleted_at IS NULL
      UNION ALL
      SELECT 'lifetime_version', s.topic_id, d.topic_id
      FROM rewards_program_status_topics s JOIN rewards_program_status_topics d
        ON d.lifetime_version_id = $2::uuid
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
        : conflict.kind === 'topic_type'
          ? 'topic_merge_type_conflict'
          : 'topic_merge_reference_conflict'
  throw Object.assign(
    createCodedError(
      409,
      conflict.kind === 'self_relation_audit_flag'
        ? `Cannot merge topics: relation ${conflict.source_id} has unresolved vote integrity flag ${conflict.destination_id}`
        : `Cannot merge topics with conflicting ${conflict.kind} rows ${conflict.source_id} and ${conflict.destination_id}`,
      code,
    ),
    {
      source_id: conflict.source_id,
      destination_id: conflict.destination_id,
    },
  )
}

export async function lockTopicMergeLifecycles(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  await query(
    `/* lockTopicMergeLifecycles */
      SELECT pg_advisory_xact_lock(hashtextextended('topic-merge-lifecycle:' || id::text, 0))
      FROM (SELECT DISTINCT unnest($1::uuid[]) AS id ORDER BY id) ordered_ids`,
    [topicIds],
  )
}

export function rethrowTopicMergeError(err: unknown): never {
  const pgError = err as { code?: string; constraint?: string }
  if (pgError.code === '23505' && pgError.constraint === 'idx_rss_feeds__topic_id__unique')
    throw Object.assign(
      createCodedError(
        409,
        'Cannot merge topics with conflicting live feeds',
        'topic_merge_feed_conflict',
      ),
      { cause: err },
    )
  throw err
}

/** updateTopic does not take the merge fence; validate the current locked rows as well. */
export function assertLockedTopicMergeTypes(
  source: Pick<Topic, 'id' | 'topic_type'>,
  destination: Pick<Topic, 'id' | 'topic_type'>,
): void {
  if (source.topic_type === destination.topic_type) return
  throw Object.assign(
    createCodedError(
      409,
      'Cannot merge topics with conflicting topic types',
      'topic_merge_type_conflict',
    ),
    { source_id: source.id, destination_id: destination.id },
  )
}
