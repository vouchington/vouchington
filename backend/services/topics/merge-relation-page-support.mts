import type { TransactionQuery } from '@data-stores/psql'
import { relationReferences, relationElectionTables } from './merge-relations.mts'
import { inspectElectedTopicRelationGroups } from './merge-relation-group.mts'
import { findElectedTopicRelationFlagConflicts } from './merge-relation-flags.mts'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import {
  initialTopicMergeRelationCursor,
  topicMergeRelationWorkTables,
  type TopicMergeRelationCursor,
  type TopicMergeRelationWorkItem,
} from './merge-relation-page-types.mts'

export async function processTopicMergeRelationPreflightPage(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
  tablePosition: number,
  cursor: TopicMergeRelationCursor,
  limit: number,
) {
  const table = Object.keys(relationReferences)[tablePosition] as
    | keyof typeof relationReferences
    | undefined
  if (!table || !relationElectionTables.has(table))
    return { cursor, hasMore: false, errorCode: null }
  const selected = await selectSourceRelation(query, table, sourceId, cursor, limit)
  const conflict = await findPageConflict(query, table, sourceId, destinationId, selected.rows)
  if (conflict) return { cursor, hasMore: false, errorCode: conflict }
  const last = selected.rows.at(-1)
  if (selected.rows.length === limit)
    return {
      cursor: { ...cursor, subjectId: last!.subject_id, objectId: last!.object_id },
      hasMore: true,
      errorCode: null,
    }
  const columns: readonly string[] = relationReferences[table]
  const hasMore = cursor.columnPosition + 1 < columns.length
  return {
    cursor: { ...initialTopicMergeRelationCursor, columnPosition: cursor.columnPosition + 1 },
    hasMore,
    errorCode: null,
  }
}

async function findPageConflict(
  query: TransactionQuery,
  table: keyof typeof relationReferences,
  sourceId: string,
  destinationId: string,
  rows: readonly { subject_id: string; object_id: string }[],
) {
  const groups = await inspectElectedTopicRelationGroups(
    query,
    table,
    sourceId,
    destinationId,
    rows,
  )
  const conflicts = await findElectedTopicRelationFlagConflicts(query, groups, sourceId)
  return conflicts.find(Boolean)?.kind ?? null
}

export async function selectSourceRelation(
  query: TransactionQuery,
  table: keyof typeof relationReferences,
  sourceId: string,
  cursor: TopicMergeRelationCursor,
  limit: number,
) {
  const columns: readonly string[] = relationReferences[table]
  const column = columns[cursor.columnPosition]!
  const other = column === 'subject_id' ? 'object_id' : 'subject_id'
  // Effects repeatedly drain the first indexed source group. Preflight advances a stable frozen keyset.
  return query<{ subject_id: string; object_id: string }>(
    `/* selectSourceRelation */
    SELECT subject_id, object_id FROM ${table} WHERE ${column} = $1::uuid
      AND ${other} > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY ${other} LIMIT $3::integer`,
    [sourceId, other === 'subject_id' ? cursor.subjectId : cursor.objectId, limit],
  )
}

/** Read after the phase-8 deletion commit; admit these idempotent effects before phase-9 cleanup. */
export async function readTopicMergeRelationEffectTargets(
  query: TransactionQuery,
  operationId: string,
  tablePosition: number,
) {
  const table = Object.keys(relationReferences)[tablePosition] as keyof typeof relationReferences
  const { work } = topicMergeRelationWorkTables(table)
  const { rows } = await query<TopicMergeRelationWorkItem>(
    `/* readTopicMergeRelationEffectTargets */
    SELECT priority, old_subject_id, old_relation_id, next_subject_id, next_relation_id
    FROM ${work} WHERE operation_id = $1::uuid ORDER BY priority LIMIT 4`,
    [operationId],
  )
  const original = rows.map(row => createEntityRelationElectionTarget(row.old_relation_id, table))
  const nextId = rows[0]?.next_relation_id
  return nextId ? [...original, createEntityRelationElectionTarget(nextId, table)] : original
}
