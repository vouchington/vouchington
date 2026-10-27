import type { TransactionQuery } from '@data-stores/psql'
import { lockTopicMergeLifecycles } from './merge-preflight.mts'
import { olderTopicMergeOwnsAny } from './merge-priority-preflight.mts'
import { getTopicsWorkLimit } from './work-limits.mts'

interface ParentWorkItem {
  topic_id: string
  depth: number
  cursor_object_id: string | null
}

/** Expand one frozen ancestor's indexed outgoing edges; the operation owns the transaction. */
export async function processTopicMergeParentPreflightPage(
  query: TransactionQuery,
  operationId: string,
  sourceTopicId: string,
  destinationTopicId: string,
  limit: number,
): Promise<{ hasMore: boolean; errorCode: string | null }> {
  await query(
    `/* seedTopicMergeParentWork */
      INSERT INTO topic_merge_parent_ancestors (operation_id, topic_id, depth)
      SELECT $1::uuid, topic_id, 0
      FROM unnest($2::uuid[]) AS participants(topic_id)
      ORDER BY topic_id
      ON CONFLICT (operation_id, topic_id) DO NOTHING`,
    [operationId, [sourceTopicId, destinationTopicId]],
  )
  const { rows: workItems } = await query<ParentWorkItem>(
    `/* claimTopicMergeParentWork */
      SELECT topic_id, depth, cursor_object_id
      FROM topic_merge_parent_ancestors
      WHERE operation_id = $1 AND completed_at IS NULL
      ORDER BY topic_id LIMIT 1 FOR UPDATE`,
    [operationId],
  )
  const workItem = workItems[0]
  if (!workItem) return { hasMore: false, errorCode: null }

  const maxDepth = getTopicsWorkLimit('parent_merge_cycle_max_depth')
  const { rows: edgePage } = await query<{ object_id: string; deleted_at: Date | null }>(
    `/* pageTopicMergeParentEdges */
      SELECT object_id, deleted_at FROM relation__topic__parent__topic
      WHERE subject_id = $1
        AND ($2::uuid IS NULL OR object_id > $2::uuid)
      ORDER BY object_id LIMIT $3`,
    [workItem.topic_id, workItem.cursor_object_id, limit],
  )
  // Page tombstones too: the composite primary key supplies the order and cannot scan an
  // unbounded deleted prefix while trying to fill a live-edge page.
  const edges = edgePage.filter(
    edge =>
      edge.deleted_at === null &&
      edge.object_id !== workItem.topic_id &&
      (workItem.depth !== 0 ||
        (edge.object_id !== sourceTopicId && edge.object_id !== destinationTopicId)),
  )
  if (
    edges.length > 0 &&
    (workItem.depth >= maxDepth ||
      edges.some(edge => edge.object_id === sourceTopicId || edge.object_id === destinationTopicId))
  )
    return { hasMore: false, errorCode: 'topic_merge_parent_cycle' }

  if (
    edges.length > 0 &&
    (await olderTopicMergeOwnsAny(
      query,
      operationId,
      edges.map(edge => edge.object_id),
    ))
  )
    return { hasMore: false, errorCode: 'topic_merge_reservation_conflict' }

  if (edges.length > 0)
    await reserveTopicMergeParentAncestors(
      query,
      operationId,
      edges.map(edge => edge.object_id),
      workItem.depth + 1,
    )

  await query(
    `/* advanceTopicMergeParentWork */
      UPDATE topic_merge_parent_ancestors
      SET cursor_object_id = $3::uuid,
        completed_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE operation_id = $1 AND topic_id = $2`,
    [
      operationId,
      workItem.topic_id,
      edgePage.at(-1)?.object_id ?? workItem.cursor_object_id,
      edgePage.length < limit,
    ],
  )
  // A full last page deliberately needs one empty continuation before completing its item.
  return { hasMore: true, errorCode: null }
}

async function reserveTopicMergeParentAncestors(
  query: TransactionQuery,
  operationId: string,
  topicIds: string[],
  depth: number,
): Promise<void> {
  // Drain pre-existing parent writers before publishing reservations. Future parent writers
  // acquire the shared lifecycle fence and reject the durable reservation after this commits.
  await lockTopicMergeLifecycles(query, topicIds)
  await query(
    `/* reserveTopicMergeParentAncestors */
      INSERT INTO topic_merge_parent_ancestors (operation_id, topic_id, depth)
      SELECT $1::uuid, topic_id, $3::integer
      FROM unnest($2::uuid[]) AS ancestors(topic_id)
      ORDER BY topic_id
      ON CONFLICT (operation_id, topic_id) DO UPDATE
      SET depth = EXCLUDED.depth, cursor_object_id = NULL, completed_at = NULL
      WHERE topic_merge_parent_ancestors.depth < EXCLUDED.depth`,
    [operationId, topicIds, depth],
  )
}
