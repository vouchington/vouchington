import { beginTransaction, write } from '@data-stores/psql'
import { processTopicMergeParentPreflightPage } from '../../services/topics/merge-parent-pages.mts'
import { lockTopicMergeAdmission } from '../../services/topics/merge-preflight.mts'

export async function getTopicMergeParentEdge(subjectId: string, objectId: string) {
  const { rows } = await write<{ deleted_at: Date | null }>(
    `/* getTopicMergeParentEdge */ SELECT deleted_at
      FROM relation__topic__parent__topic
      WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
    [subjectId, objectId],
  )
  return rows[0] ?? null
}

export async function createTopicMergeParentTestOperation(
  sourceId: string,
  destinationId: string,
  requestedById: string,
): Promise<string> {
  await using query = await beginTransaction()
  await lockTopicMergeAdmission(query)
  const { rows } = await query<{ id: string }>(
    `/* createTopicMergeParentTestOperation */
      INSERT INTO topic_merge_operations (source_topic_id, destination_topic_id, requested_by_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid) RETURNING id`,
    [sourceId, destinationId, requestedById],
  )
  await query.commit()
  return rows[0]!.id
}

export async function runTopicMergeParentTestPage(
  operationId: string,
  sourceId: string,
  destinationId: string,
  limit: number,
) {
  await using query = await beginTransaction()
  await query(
    `/* authorizeTopicMergeParentTestPage */
      SELECT set_config('voucha.topic_merge_operation_id', id::text, TRUE),
        set_config('voucha.topic_merge_fence_token', fence_token::text, TRUE)
      FROM topic_merge_operations WHERE id = $1::uuid FOR UPDATE`,
    [operationId],
  )
  const result = await processTopicMergeParentPreflightPage(
    query,
    operationId,
    sourceId,
    destinationId,
    limit,
  )
  await query.commit()
  return result
}

export async function getTopicMergeParentTestWork(operationId: string) {
  const { rows } = await write<{
    topic_id: string
    depth: number
    cursor_object_id: string | null
  }>(
    `/* getTopicMergeParentTestWork */
      SELECT topic_id, depth, cursor_object_id FROM topic_merge_parent_ancestors
      WHERE operation_id = $1::uuid ORDER BY topic_id LIMIT 10`,
    [operationId],
  )
  return rows
}

export async function deleteTopicMergeParentTestOperation(operationId: string) {
  await write(
    `/* deleteTopicMergeParentTestOperation */ DELETE FROM topic_merge_operations WHERE id = $1::uuid`,
    [operationId],
  )
}

export async function mutateTopicMergeParentTestEdge(
  subjectId: string,
  objectId: string,
  mutation: 'delete' | 'tombstone',
) {
  if (mutation === 'delete') {
    await write(
      `/* deleteTopicMergeParentTestEdge */ DELETE FROM relation__topic__parent__topic
        WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
      [subjectId, objectId],
    )
    return
  }
  await write(
    `/* tombstoneTopicMergeParentTestEdge */ UPDATE relation__topic__parent__topic
      SET deleted_at = CURRENT_TIMESTAMP WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
    [subjectId, objectId],
  )
}
