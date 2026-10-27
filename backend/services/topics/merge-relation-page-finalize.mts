import type { TransactionQuery } from '@data-stores/psql'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { relationReferences } from './merge-relations.mts'
import {
  applyRelationMetrics,
  settleRelationFlags,
  settleRelationVotes,
} from './merge-relation-children.mts'
import {
  initialTopicMergeRelationCursor,
  type TopicMergeRelationCursor,
  type TopicMergeRelationWorkItem,
} from './merge-relation-page-types.mts'

export async function processTopicMergeRelationFinalizationPage(
  query: TransactionQuery,
  table: keyof typeof relationReferences,
  work: string,
  operationId: string,
  parents: TopicMergeRelationWorkItem[],
  sourceId: string,
  destinationId: string,
  cursor: TopicMergeRelationCursor,
  limit: number,
): Promise<{ cursor: TopicMergeRelationCursor; hasMore: boolean }> {
  const anchor = parents[0]!
  if (cursor.phase === 4) {
    // Every child was independently drained before deleting a parent. Retained old FKs survive.
    const losers = parents.slice(1)
    await query(
      `/* processTopicMergeRelationPage delete losers */ DELETE FROM ${table} relation
      USING unnest($1::uuid[], $2::uuid[]) loser(subject_id, id)
      WHERE relation.subject_id = loser.subject_id AND relation.id = loser.id`,
      [losers.map(parent => parent.old_subject_id), losers.map(parent => parent.old_relation_id)],
    )
    if (!anchor.next_relation_id) {
      await query(
        `/* processTopicMergeRelationPage self cleanup */
        DELETE FROM ${table} WHERE subject_id = $1::uuid AND id = $2::uuid`,
        [anchor.old_subject_id, anchor.old_relation_id],
      )
      return { cursor: { ...initialTopicMergeRelationCursor, phase: 8 }, hasMore: true }
    }
    await createFinalRelationParent(
      query,
      table,
      work,
      operationId,
      anchor,
      sourceId,
      destinationId,
    )
    return { cursor: { ...initialTopicMergeRelationCursor, phase: 5 }, hasMore: true }
  }
  if (cursor.phase === 5 || cursor.phase === 6) {
    const page =
      cursor.phase === 5
        ? await settleRelationVotes(query, table, operationId, anchor, cursor.rowId, limit, true)
        : await settleRelationFlags(query, table, anchor, cursor.rowId, limit)
    return {
      cursor: {
        ...cursor,
        phase: cursor.phase + Number(!page.hasMore),
        rowId: page.hasMore ? page.cursor : null,
      },
      hasMore: true,
    }
  }
  if (cursor.phase === 7) {
    const page = await applyRelationMetrics(query, table, operationId, anchor, cursor.rowId, limit)
    return {
      cursor: { ...cursor, phase: page.hasMore ? 7 : 8, rowId: page.hasMore ? page.cursor : null },
      hasMore: true,
    }
  }
  if (cursor.phase === 8) {
    if (anchor.old_relation_id !== anchor.next_relation_id)
      await query(
        `/* processTopicMergeRelationPage old anchor */ DELETE FROM ${table}
        WHERE subject_id = $1::uuid AND id = $2::uuid`,
        [anchor.old_subject_id, anchor.old_relation_id],
      )
    return { cursor: { ...initialTopicMergeRelationCursor, phase: 9 }, hasMore: true }
  }
  if (cursor.phase !== 9) throw new Error('Invalid topic relation merge phase')
  // The owner scratch is empty after metric pages. Four mapping rows are the finite control set.
  await query(
    `/* processTopicMergeRelationPage cleanup */ DELETE FROM ${work} WHERE operation_id = $1::uuid`,
    [operationId],
  )
  return { cursor: initialTopicMergeRelationCursor, hasMore: true }
}

async function createFinalRelationParent(
  query: TransactionQuery,
  table: keyof typeof relationReferences,
  work: string,
  operationId: string,
  anchor: TopicMergeRelationWorkItem,
  sourceId: string,
  destinationId: string,
) {
  const columns: readonly string[] = relationReferences[table]
  const subject = columns.includes('subject_id')
    ? 'CASE WHEN subject_id = $4::uuid THEN $5::uuid ELSE subject_id END'
    : 'subject_id'
  const object = columns.includes('object_id')
    ? 'CASE WHEN object_id = $4::uuid THEN $5::uuid ELSE object_id END'
    : 'object_id'
  const orderIndex = entityRelationMetadatum.find(item => item.table_name === table)!.order_index
  await query(
    `/* createFinalRelationParent */
    WITH original AS MATERIALIZED (SELECT *, ${subject} AS next_subject, ${object} AS next_object
      FROM ${table} WHERE subject_id = $2::uuid AND id = $3::uuid LIMIT 1),
    inserted AS (INSERT INTO ${table} (id, subject_id, object_id, created_at, created_by_id, deleted_at, deleted_by_id${orderIndex ? ', order_index' : ''})
      SELECT uuidv7(), next_subject, next_object, created_at, created_by_id, deleted_at, deleted_by_id${orderIndex ? ', order_index' : ''}
      FROM original WHERE next_subject <> subject_id OR next_object <> object_id
      RETURNING subject_id, id),
    target AS (SELECT subject_id, id FROM inserted UNION ALL SELECT subject_id, id FROM original
      WHERE next_subject = subject_id AND next_object = object_id)
    UPDATE ${work} SET next_subject_id = target.subject_id, next_relation_id = target.id
    FROM target WHERE operation_id = $1::uuid`,
    [operationId, anchor.old_subject_id, anchor.old_relation_id, sourceId, destinationId],
  )
  await query(
    `/* createFinalRelationParent reset metrics */ UPDATE ${table} SET
    votes_score_up = 0, votes_score_none = 0, votes_score_down = 0,
    votes_count_up = 0, votes_count_none = 0, votes_count_down = 0
    WHERE subject_id = (SELECT next_subject_id FROM ${work} WHERE operation_id = $1::uuid AND priority = 1)
      AND id = (SELECT next_relation_id FROM ${work} WHERE operation_id = $1::uuid AND priority = 1)`,
    [operationId],
  )
}
