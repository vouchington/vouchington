import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'
import type { TopicMergeOperationRow } from './merge-operation-types.mts'
import { emptyTopicMergeMetricStats } from './merge-metrics-stats.mts'
import { processTopicMergeFinalizeImages } from './merge-effects.mts'
import { buildElectionStatsUpdateQuery } from '@services/elections-votes/shared/vote-stats-update-query'
import { TOPIC_ELECTION_CONFIG } from '@services/elections-votes/topic/config'
import { recordTopicMergePublicationChange } from '@services/post-publication/capture-topic-merge'

/** The redirect is the last domain mutation, after every bounded reference and metric page. */
export async function finalizeTopicMergeDomain(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
): Promise<boolean> {
  // A canonical refresh can commit after a bounded metric page. Serialize with it
  // before any finalizer mutation, then rebuild scratch if its reconciliation moved.
  await lockTopicMergeRatingStats(query, operation)
  if (operation.metric_rating_revision === null)
    throw new Error('Topic merge rating revision was not captured')
  const { rows } = await query<{ revision: string }>(
    `/* checkTopicMergeRatingRevision */ SELECT ratings__revision::text AS revision
      FROM topic_metrics WHERE topic_id = $1::uuid`,
    [operation.destination_topic_id],
  )
  if ((rows[0]?.revision ?? '0') !== operation.metric_rating_revision) return false
  await processTopicMergeFinalizeImages(query, operation.source_topic_id)
  await finalizeTopicMergeProjection(query, operation)
  // Every moved reference now belongs to the destination; the committed redirect starts direct
  // publication effects after this page commits.
  recordTopicMergePublicationChange(query, operation.source_topic_id, operation.destination_topic_id)
  return true
}

async function finalizeTopicMergeProjection(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
): Promise<void> {
  const metricKeys = Object.keys(emptyTopicMergeMetricStats())
  const statsKeys: string[] = []
  for (const key of metricKeys) {
    const valid = assertWhitelistedSqlIdentifier(key, metricKeys, 'topicMergeMetricStat')
    if (!key.startsWith('votes_')) statsKeys.push(valid)
  }
  await writeTopicMergeVoteProjection(query, operation)
  await writeTopicMergeRatingsAndSource(query, operation, statsKeys)
}

async function writeTopicMergeVoteProjection(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
): Promise<void> {
  const stats = operation.metric_stats
  const { metric_snapshot_xmax: xmax, metric_snapshot_xip_count: xipCount } = operation
  if (xmax === null || xipCount === null)
    throw new Error('Topic merge vote metric snapshot was not captured')
  await query(
    `/* finalizeTopicMergeDomain destination aliases */ UPDATE topics SET
    aliases=(SELECT (jsonb_populate_record(NULL::topics,
      jsonb_build_object('aliases', destination_aliases_after))).aliases
      FROM topic_merge_operations WHERE id=$2::uuid)
    WHERE id=$1::uuid`,
    [operation.destination_topic_id, operation.id],
  )
  await query(
    buildElectionStatsUpdateQuery(TOPIC_ELECTION_CONFIG, operation.destination_topic_id, {
      votes_score_up: stats.votes_score_up,
      votes_score_none: stats.votes_score_none,
      votes_score_down: stats.votes_score_down,
      votes_count_up: stats.votes_count_up,
      votes_count_none: stats.votes_count_none,
      votes_count_down: stats.votes_count_down,
      snapshot: { xmax, xipCount },
    }),
  )
}

async function writeTopicMergeRatingsAndSource(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
  statsKeys: string[],
): Promise<void> {
  const stats = operation.metric_stats
  await query(
    `/* finalizeTopicMergeDomain metrics */ INSERT INTO topic_metrics(topic_id,ratings__revision,${statsKeys.join(', ')})
    VALUES($1::uuid,1,${statsKeys.map((_, index) => `$${index + 2}`).join(', ')})
    ON CONFLICT(topic_id) DO UPDATE SET ${statsKeys.map(key => `${key}=EXCLUDED.${key}`).join(', ')},
      ratings__updated_at=CURRENT_TIMESTAMP,ratings__revision=topic_metrics.ratings__revision+1`,
    [operation.destination_topic_id, ...statsKeys.map(key => stats[key as keyof typeof stats])],
  )
  await finalizeTopicMergeSource(query, operation)
}

async function lockTopicMergeRatingStats(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
): Promise<void> {
  // Rating refreshers use these same advisory keys after their attachment fences.
  const firstRatingTopicId =
    operation.source_topic_id < operation.destination_topic_id
      ? operation.source_topic_id
      : operation.destination_topic_id
  const secondRatingTopicId =
    operation.source_topic_id < operation.destination_topic_id
      ? operation.destination_topic_id
      : operation.source_topic_id
  await query(
    `/* lockTopicMergeFirstRatingStats */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`topic-rating:${firstRatingTopicId}`],
  )
  await query(
    `/* lockTopicMergeSecondRatingStats */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`topic-rating:${secondRatingTopicId}`],
  )
}

async function finalizeTopicMergeSource(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
) {
  await query(
    `/* finalizeTopicMergeDomain source */ UPDATE topics SET merged_into_topic_id=$2::uuid,
    merged_at=CURRENT_TIMESTAMP,merged_by_id=$3::uuid,
    updated_by_id=(SELECT id FROM users WHERE id=$3::uuid AND deleted_at IS NULL),
    aliases='{}'::text[] WHERE id=$1::uuid`,
    [operation.source_topic_id, operation.destination_topic_id, operation.requested_by_id],
  )
  await query(
    `/* finalizeTopicMergeDomain source metrics */ DELETE FROM topic_metrics WHERE topic_id=$1::uuid`,
    [operation.source_topic_id],
  )
}
