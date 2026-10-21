import { TOPIC_MERGE_REFERENCE_GROUPS } from './merge-reference-inventory.mts'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import type { TransactionQuery } from '@data-stores/psql'
import { buildReferenceMergeCtes, type MergeReferenceTable } from './merge-reference-sql.mts'
import {
  buildTopicRelationMergeCtes,
  buildTopicRelationMergeTargetsSql,
} from './merge-relations.mts'

export const plainReferences = getPlainTopicMergeReferences()

export const collisionReferences: readonly MergeReferenceTable[] = [
  { table: 'post_data_point_topics', columns: ['topic_id'], collisionKey: ['post_id', 'topic_id'] },
  {
    table: 'post_explicit_topic_categories',
    columns: ['topic_id'],
    collisionKey: ['post_id', 'topic_id'],
  },
  {
    table: 'post_review_topic_ratings',
    columns: ['topic_id'],
    collisionKey: ['post_id', 'topic_id'],
  },
  {
    table: 'community_list_topics',
    columns: ['topic_id'],
    collisionKey: ['community_id', 'topic_id'],
    live: 'removed_at IS NULL',
  },
  {
    table: 'curated_aside_items',
    columns: ['topic_id'],
    collisionKey: ['aside_type', 'topic_id'],
    live: 'deleted_at IS NULL',
  },
  {
    table: 'topic_claims',
    preferVerified: true,
    columns: ['topic_id'],
    collisionKey: ['topic_id', 'claimant_user_id'],
    live: 'rejected_at IS NULL AND revoked_at IS NULL',
  },
  { table: 'topic_votes', columns: ['topic_id'], collisionKey: ['topic_id', 'user_id'] },
]

/** Each group is one statement across all of its tables; all share the merge transaction. */
export async function repointTopicReferences(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
) {
  await query(
    `/* mergeTopicPlainReferences */ WITH ${buildReferenceMergeCtes(plainReferences).join(',\n')} SELECT 1`,
    [sourceId, destinationId],
  )
  const { rows } = await query<{
    kind: 'election' | 'bookmark'
    entity_relation_id: string | null
    previous_relation_id: string | null
    relation_table: string
    subject_id: string | null
    object_id: string | null
  }>(
    `/* mergeTopicCollisionReferences */ WITH ${[...buildReferenceMergeCtes(collisionReferences), ...buildTopicRelationMergeCtes()].join(',\n')} ${buildTopicRelationMergeTargetsSql()}`,
    [sourceId, destinationId],
  )
  return {
    relationElectionTargets: rows.flatMap(row =>
      row.entity_relation_id
        ? [createEntityRelationElectionTarget(row.entity_relation_id, row.relation_table)]
        : [],
    ),
    previousRelationElectionTargets: rows.flatMap(row =>
      row.previous_relation_id
        ? [createEntityRelationElectionTarget(row.previous_relation_id, row.relation_table)]
        : [],
    ),
    bookmarkMoves: rows.flatMap(row =>
      row.subject_id && row.object_id
        ? [
            {
              relationTable: row.relation_table,
              subject_id: row.subject_id,
              object_id: row.object_id,
            },
          ]
        : [],
    ),
  }
}

function getPlainTopicMergeReferences(): readonly MergeReferenceTable[] {
  const columnsByTable = new Map<string, string[]>()
  for (const [reference, group] of Object.entries(TOPIC_MERGE_REFERENCE_GROUPS)) {
    if (group !== 'references') continue
    const separator = reference.indexOf('.')
    const table = reference.slice(0, separator)
    const column = reference.slice(separator + 1)
    const columns = columnsByTable.get(table) ?? []
    columns.push(column)
    columnsByTable.set(table, columns)
  }
  return [...columnsByTable].map(([table, columns]) => ({ table, columns }))
}
