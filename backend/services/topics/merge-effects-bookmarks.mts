import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'
import { maintainBookmarkBloomForRelations } from '@services/entity-relations/bookmark-bloom-maintenance'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { relationReferences } from './merge-relations.mts'

const bookmarkRelations = entityRelationMetadatum.filter(
  relation =>
    relation.is_bookmark &&
    relation.subject_type === 'user' &&
    relation.table_name in relationReferences,
)
export const topicMergeBookmarkRelationTables = bookmarkRelations.map(
  relation => relation.table_name,
)

export async function processTopicMergeBookmarkBloomPage(
  query: TransactionQuery,
  destinationId: string,
  tablePosition: number,
  afterSubjectId: string | null,
  limit: number,
): Promise<{ cursorId: string | null; hasMore: boolean }> {
  const relation = bookmarkRelations[tablePosition]
  if (!relation) return { cursorId: null, hasMore: false }
  const table = assertWhitelistedSqlIdentifier(
    relation.table_name,
    topicMergeBookmarkRelationTables,
    'topicMergeBookmarkRelationTable',
  )
  const { rows } = await query<{ subject_id: string; object_id: string }>(
    `/* processTopicMergeBookmarkBloomPage */ SELECT subject_id, object_id FROM ${table}
      WHERE object_id = $1::uuid
        AND subject_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY subject_id LIMIT $3::integer`,
    [destinationId, afterSubjectId, limit],
  )
  if (rows.length) await maintainBookmarkBloomForRelations(relation, rows)
  return { cursorId: rows.at(-1)?.subject_id ?? afterSubjectId, hasMore: rows.length === limit }
}
