import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getTopicMergeWorkLimit } from './merge-work-limits.mts'
import { lockTopicMergeLifecycles } from './merge-preflight.mts'
import { executeTopicMergeStagePage } from './merge-page-stages.mts'
import { nextTopicMergeStage, type TopicMergeOperationRow } from './merge-operation-types.mts'

/** One job owns one committed page; stale duplicate generations never perform an effect. */
export async function processTopicMergeOperationPage(
  operationId: string,
  expectedGeneration: number,
): Promise<number | null> {
  await using query = await beginTransaction()
  // no-mistakes-disable-next-line postgres-required-predicates: committed redirect sources remain readable while this operation settles effects and cleanup.
  const { rows } = await query<TopicMergeOperationRow>(
    `/* processTopicMergeOperationPage lock */
    SELECT operation.id, operation.source_topic_id, operation.destination_topic_id,
      operation.requested_by_id, operation.fence_token, operation.stage,
      operation.stage_table_position, operation.relation_column_position,
      operation.relation_phase, operation.alias_phase, operation.cursor_row_id,
      operation.cursor_subject_id, operation.cursor_object_id, operation.cursor_alias,
      operation.cursor_country_position, operation.generation, operation.started_at,
      operation.completed_at, operation.failed_at, operation.metric_stats,
      operation.metric_snapshot_xmax, operation.metric_snapshot_xip_count,
      operation.metric_rating_revision::text AS metric_rating_revision,
      source.slug AS source_slug FROM topic_merge_operations operation
    JOIN topics source ON source.id=operation.source_topic_id AND source.deleted_at IS NULL
    WHERE operation.id=$1::uuid FOR UPDATE OF operation`,
    [operationId],
  )
  const operation = rows[0]
  if (
    !operation ||
    operation.completed_at ||
    operation.failed_at ||
    operation.generation !== expectedGeneration
  )
    return null
  return await processLockedPage(query, operation)
}

async function processLockedPage(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  operation: TopicMergeOperationRow,
) {
  await lockTopicMergeLifecycles(query, [operation.source_topic_id, operation.destination_topic_id])
  const result = await executeLockedPage(query, operation)
  return commitPage(query, operation, result)
}

async function commitPage(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  operation: TopicMergeOperationRow,
  result: Awaited<ReturnType<typeof executeTopicMergeStagePage>>,
): Promise<number | null> {
  const p = result.errorCode ? nextTopicMergeStage(operation, 'cleanup_failed') : result.progress
  const { rows: updated } = await query<{ generation: number }>(
    `/* processTopicMergeOperationPage checkpoint */ UPDATE topic_merge_operations SET
    stage=$2::topic_merge_stages,stage_table_position=$3,relation_column_position=$4,relation_phase=$5,alias_phase=$6,
    cursor_row_id=$7::uuid,cursor_subject_id=$8::uuid,cursor_object_id=$9::uuid,cursor_alias=$10,
    cursor_country_position=$14::smallint,metric_stats=$11::jsonb,generation=generation+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
    rejected_at=CASE WHEN $12::text IS NOT NULL THEN COALESCE(rejected_at,CURRENT_TIMESTAMP) ELSE rejected_at END,
    failed_at=CASE WHEN $15::boolean THEN CURRENT_TIMESTAMP ELSE failed_at END,error_code=COALESCE(error_code,$12),
    completed_at=CASE WHEN $13::boolean THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id=$1::uuid RETURNING generation`,
    [
      operation.id,
      p.stage,
      p.stage_table_position,
      p.relation_column_position,
      p.relation_phase,
      p.alias_phase,
      p.cursor_row_id,
      p.cursor_subject_id,
      p.cursor_object_id,
      p.cursor_alias,
      JSON.stringify(p.metric_stats),
      result.errorCode ?? null,
      result.completed ?? false,
      p.cursor_country_position,
      result.failed ?? false,
    ],
  )
  await query.commit()
  return result.failed || result.completed ? null : updated[0]!.generation
}

async function executeLockedPage(query: TransactionQuery, operation: TopicMergeOperationRow) {
  await query(
    `/* processTopicMergeOperationPage context */
    SELECT set_config('voucha.topic_merge_operation_id',$1,TRUE),set_config('voucha.topic_merge_fence_token',$2,TRUE)`,
    [operation.id, operation.fence_token],
  )
  return executeTopicMergeStagePage(query, operation, getTopicMergeWorkLimit('page_size'))
}
