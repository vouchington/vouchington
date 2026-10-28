import type { TransactionQuery } from '@data-stores/psql'
import {
  entityRelationMetadatum,
  entityRelationEntityTables,
} from '@voucha/types/entities/entity-relations-metadata'
import type { EntityRelationEntityType } from '@voucha/types/entities/entity-relations-config'
import { relationReferences, relationElectionTables } from './merge-relations.mts'
import { inspectElectedTopicRelationGroup } from './merge-relation-group.mts'
import {
  captureRelationVoteOwners,
  settleRelationVotes,
  settleRelationFlags,
} from './merge-relation-children.mts'
import {
  initialTopicMergeRelationCursor,
  topicMergeRelationWorkTables,
  type TopicMergeRelationCursor,
  type TopicMergeRelationWorkItem,
} from './merge-relation-page-types.mts'
import {
  processTopicMergeRelationPreflightPage,
  readTopicMergeRelationEffectTargets,
  selectSourceRelation,
} from './merge-relation-page-support.mts'
import { processTopicMergeRelationFinalizationPage } from './merge-relation-page-finalize.mts'

export {
  initialTopicMergeRelationCursor,
  processTopicMergeRelationPreflightPage,
  readTopicMergeRelationEffectTargets,
}
export type { TopicMergeRelationCursor }

/** Caller commits this cursor and all effects under the operation row lock. */
export async function processTopicMergeRelationPage(
  query: TransactionQuery,
  operationId: string,
  sourceId: string,
  destinationId: string,
  tablePosition: number,
  cursor: TopicMergeRelationCursor,
  limit: number,
): Promise<{ cursor: TopicMergeRelationCursor; hasMore: boolean }> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Invalid relation page limit')
  const table = Object.keys(relationReferences)[tablePosition] as
    | keyof typeof relationReferences
    | undefined
  if (!table || !relationElectionTables.has(table)) return { cursor, hasMore: false }
  const { work } = topicMergeRelationWorkTables(table)
  if (cursor.phase === 0) {
    let selected = await selectSourceRelation(
      query,
      table,
      sourceId,
      initialTopicMergeRelationCursor,
      1,
    )
    if (!selected.rows[0] && relationReferences[table].length === 2)
      selected = await selectSourceRelation(
        query,
        table,
        sourceId,
        { ...initialTopicMergeRelationCursor, columnPosition: 1 },
        1,
      )
    const row = selected.rows[0]
    if (!row) return { cursor, hasMore: false }
    const group = await inspectElectedTopicRelationGroup(
      query,
      table,
      sourceId,
      destinationId,
      row.subject_id,
      row.object_id,
    )
    const anchor = group.relations[0]!
    const metadata = entityRelationMetadatum.find(item => item.table_name === table)!
    const root =
      entityRelationEntityTables[metadata.subject_type as EntityRelationEntityType]
        .foreign_key_table
    await query(
      `/* processTopicMergeRelationPage retain */ WITH input AS MATERIALIZED (
        SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::smallint[]) AS item(subject_id, id, priority)
      ), roots AS (INSERT INTO retained_${metadata.subject_type}_identities (id)
        SELECT DISTINCT owner.id FROM ${root} owner JOIN input ON input.subject_id = owner.id
        ON CONFLICT DO NOTHING RETURNING id),
      retained AS (INSERT INTO retained_${table} (subject_id, id)
        SELECT subject_id, id FROM input ON CONFLICT DO NOTHING RETURNING id)
      INSERT INTO ${work} (operation_id, priority, old_subject_id, old_relation_id, next_subject_id, next_relation_id)
      SELECT $4::uuid, priority, subject_id, id, $5::uuid, $6::uuid FROM input
      CROSS JOIN (SELECT COUNT(*) FROM roots) root_effect
      CROSS JOIN (SELECT COUNT(*) FROM retained) retained_effect ORDER BY priority`,
      [
        group.relations.map(parent => parent.subject_id),
        group.relations.map(parent => parent.id),
        group.relations.map(parent => parent.priority),
        operationId,
        group.selfDelete ? null : anchor.subject_id,
        group.selfDelete ? null : anchor.id,
      ],
    )
    return { cursor: { ...initialTopicMergeRelationCursor, phase: 1 }, hasMore: true }
  }
  const { rows: parents } = await query<TopicMergeRelationWorkItem>(
    `/* processTopicMergeRelationPage parents */
    SELECT priority, old_subject_id, old_relation_id, next_subject_id, next_relation_id
    FROM ${work} WHERE operation_id = $1::uuid ORDER BY priority LIMIT 4`,
    [operationId],
  )
  const anchor = parents[0]!
  if (!anchor) throw new Error('Topic merge relation mapping missing')
  if (cursor.phase === 1 || cursor.phase === 2 || cursor.phase === 3) {
    const parent = parents[cursor.columnPosition]
    if (!parent)
      return {
        cursor: { ...initialTopicMergeRelationCursor, phase: cursor.phase + 1 },
        hasMore: true,
      }
    const page =
      cursor.phase === 1
        ? await captureRelationVoteOwners(query, table, operationId, parent, cursor.rowId, limit)
        : cursor.phase === 2
          ? await settleRelationVotes(query, table, operationId, parent, cursor.rowId, limit, false)
          : await settleRelationFlags(query, table, parent, cursor.rowId, limit)
    return {
      cursor: {
        ...cursor,
        rowId: page.hasMore ? page.cursor : null,
        columnPosition: cursor.columnPosition + Number(!page.hasMore),
      },
      hasMore: true,
    }
  }
  return processTopicMergeRelationFinalizationPage(
    query,
    table,
    work,
    operationId,
    parents,
    sourceId,
    destinationId,
    cursor,
    limit,
  )
}
