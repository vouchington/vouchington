import { read } from '@data-stores/psql'

export type TopicMergeRatingRevisionState = {
  stage: string
  stage_table_position: number
  generation: number
  metric_rating_revision: string | null
  metric_snapshot_captured: boolean
  metric_users: number
  captured_rating_count_5: number
  ratings_revision: string
  ratings_count_5: number
  source_merged_into_topic_id: string | null
  completed_at: Date | null
  failed_at: Date | null
}

export async function getTopicMergeRatingRevisionState(
  operationId: string,
): Promise<TopicMergeRatingRevisionState> {
  const { rows } = await read<TopicMergeRatingRevisionState>(
    `/* getTopicMergeRatingRevisionState */ SELECT
      operation.stage::text AS stage, operation.stage_table_position,
      operation.generation, operation.metric_rating_revision::text,
      operation.metric_snapshot_xmax IS NOT NULL AS metric_snapshot_captured,
      (SELECT COUNT(*)::integer FROM topic_merge_metric_users scratch
        WHERE scratch.operation_id = operation.id) AS metric_users,
      COALESCE((operation.metric_stats->>'ratings__count__5')::integer, 0)
        AS captured_rating_count_5,
      metrics.ratings__revision::text AS ratings_revision,
      metrics.ratings__count__5 AS ratings_count_5,
      source.merged_into_topic_id AS source_merged_into_topic_id,
      operation.completed_at, operation.failed_at
    FROM topic_merge_operations operation
    JOIN topic_metrics metrics ON metrics.topic_id = operation.destination_topic_id
    JOIN topics source ON source.id = operation.source_topic_id
    WHERE operation.id = $1::uuid`,
    [operationId],
  )
  const state = rows[0]
  if (!state) throw new Error(`Topic merge operation ${operationId} is missing`)
  return state
}
