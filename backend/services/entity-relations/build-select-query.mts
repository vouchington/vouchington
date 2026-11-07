import sql, { type SQLStatement } from 'sql-template-strings'
import { entityRelationEntityTables, type EntityRelationMetadata } from './metadata.mts'
import { buildEntityRelationObjectData } from './object-projection.mts'
import {
  appendFilters,
  appendRelationOrder,
  buildCreatedByColumn,
  buildCursorFilter,
  type EntityRelationPageCursor,
} from './page-lookup.mts'
import { buildObjectPostAccessFilter, buildSubjectPostAccessFilter } from './post-access.mts'
import { buildVoteScoreFilters } from './vote-score-filters.mts'
import type { EntityRelationViewer } from './viewer.mts'

export type { EntityRelationPageCursor }

export type EntityRelationSelectOptions = {
  viewer: EntityRelationViewer
  minNetVoteScore?: number
  positiveNetVoteScore?: boolean
  limit: number
  sort: 'best' | 'newest'
  after?: EntityRelationPageCursor
  objectIds?: readonly string[]
}

/**
 * Lists a subject's relations as the viewer may see them. One walk of the membership index,
 * joined to the target, with eligibility in WHERE. Listed object posts follow discovery rules,
 * and objects named by `objectIds` follow direct access. An anonymous post's author is hidden
 * as a relation creator.
 */
export function buildEntityRelationSelectQuery(
  metadata: EntityRelationMetadata,
  subjectId: string,
  options: EntityRelationSelectOptions,
): SQLStatement {
  const { limit, sort, after, viewer, objectIds } = options
  const objectIsPost = metadata.object_type === 'post'
  const objectPostFilter = objectIsPost
    ? buildObjectPostAccessFilter('obj', 'obj_access', viewer, objectIds ? 'named' : 'listed')
    : null
  const subjectPostFilter =
    metadata.subject_type === 'post'
      ? buildSubjectPostAccessFilter('subject_post', 'subject_access', viewer)
      : null
  const joinsSubjectPost = subjectPostFilter !== null
  const objectEntityConfig = entityRelationEntityTables[metadata.object_type]
  const objectTable = objectEntityConfig.select_table ?? objectEntityConfig.foreign_key_table

  const query = sql`/* buildEntityRelationSelectQuery */
    SELECT
      r.subject_id,
      r.object_id,
      `
  query.append(buildCreatedByColumn(viewer, joinsSubjectPost, objectIsPost))
  query.append(sql`,
      r.created_at,
      r.deleted_at,
      r.deleted_by_id,`)
  if (metadata.election) {
    query.append(sql`
      r.id,
      r.votes_score_up,
      r.votes_score_none,
      r.votes_score_down,
      r.votes_count_up,
      r.votes_count_none,
      r.votes_count_down,
      r.votes_score_sort,
      r.votes_score_net,`)
  }
  if (metadata.order_index) {
    query.append(sql`
      r.order_index,`)
  }
  query.append(sql`
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
      `)
  query.append(buildEntityRelationObjectData(metadata.object_type))
  query.append(sql` AS object_data
    FROM `)
  // Table names below come from config constants, never from input.
  query.append(metadata.table_name)
  query.append(sql` AS r
    JOIN `)
  query.append(objectTable)
  query.append(sql` AS obj ON obj.id = r.object_id`)
  if (objectPostFilter) {
    query.append(sql`
    JOIN posts AS obj_access ON obj_access.id = COALESCE(obj.root_post_id, obj.id)`)
  }
  if (joinsSubjectPost) {
    query.append(sql`
    JOIN posts AS subject_post ON subject_post.id = r.subject_id
    JOIN posts AS subject_access
      ON subject_access.id = COALESCE(subject_post.root_post_id, subject_post.id)`)
  }
  query.append(sql`
    WHERE `)
  const filters: SQLStatement[] = [sql`r.subject_id = ${subjectId}`, sql`r.deleted_at IS NULL`]
  if (objectIds) filters.push(sql`r.object_id = ANY(${objectIds}::uuid[])`)
  filters.push(...buildVoteScoreFilters(metadata, options))
  if (after) filters.push(buildCursorFilter(metadata, sort, after))
  if (objectEntityConfig.has_soft_delete && !objectPostFilter) {
    filters.push(sql`obj.deleted_at IS NULL`)
  }
  if (objectPostFilter) filters.push(objectPostFilter)
  if (subjectPostFilter) filters.push(subjectPostFilter)
  appendFilters(query, filters)
  query.append(sql`
    ORDER BY `)
  appendRelationOrder(query, metadata, sort)
  query.append(sql`
    LIMIT ${limit}`)
  return query
}
