import sql, { type SQLStatement } from 'sql-template-strings'
import { entityRelationEntityTables, type EntityRelationMetadata } from './metadata.mts'
import { buildEntityRelationObjectData } from './object-projection.mts'
import {
  appendBoundedLookup,
  appendFilters,
  appendRelationOrder,
  buildCreatedByColumn,
  buildCursorFilter,
  buildEligibleExpression,
  objectLookupColumns,
  POST_PAGE_COLUMNS,
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
 * Lists a subject's relations as the viewer may see them. The driving page is live membership
 * rows only. Object and subject visibility are reported as `eligible` for that page, so a short
 * page still carries the last membership key. Listed object posts follow discovery rules, and
 * objects named by `objectIds` follow direct access. An anonymous post's author is hidden as a
 * relation creator.
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

  const query = sql`/* buildEntityRelationSelectQuery */
    WITH driving_page AS MATERIALIZED (
      SELECT
        r.subject_id,
        r.object_id,
        r.created_by_id,
        r.created_at,
        r.deleted_at,
        r.deleted_by_id,`
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
        to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM `)
  // Table names below come from config constants, never from input.
  query.append(metadata.table_name)
  query.append(sql` AS r
      WHERE `)
  const drivingFilters: SQLStatement[] = [
    sql`r.subject_id = ${subjectId}`,
    sql`r.deleted_at IS NULL`,
  ]
  if (objectIds) drivingFilters.push(sql`r.object_id = ANY(${objectIds}::uuid[])`)
  drivingFilters.push(...buildVoteScoreFilters(metadata, options))
  if (after) drivingFilters.push(buildCursorFilter(metadata, sort, after))
  appendFilters(query, drivingFilters)
  query.append(sql`
      ORDER BY `)
  appendRelationOrder(query, metadata, sort)
  query.append(sql`
      LIMIT ${limit}
    )
    SELECT
      r.subject_id,
      r.object_id,
      `)
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
      r.cursor_created_at,
      `)
  query.append(buildEntityRelationObjectData(metadata.object_type))
  query.append(sql` AS object_data,
      COALESCE((`)
  query.append(
    buildEligibleExpression(
      objectEntityConfig.has_soft_delete,
      objectPostFilter,
      subjectPostFilter,
    ),
  )
  query.append(sql`), FALSE) AS eligible
    FROM driving_page r`)
  appendBoundedLookup(
    query,
    'obj',
    objectEntityConfig.select_table ?? objectEntityConfig.foreign_key_table,
    objectLookupColumns(metadata.object_type, objectEntityConfig.has_soft_delete),
    sql`source.id = r.object_id`,
  )
  if (objectPostFilter) {
    appendBoundedLookup(
      query,
      'obj_access',
      'posts',
      POST_PAGE_COLUMNS,
      sql`source.id = COALESCE(obj.root_post_id, obj.id)`,
    )
  }
  if (joinsSubjectPost) {
    appendBoundedLookup(
      query,
      'subject_post',
      'posts',
      POST_PAGE_COLUMNS,
      sql`source.id = r.subject_id`,
    )
    appendBoundedLookup(
      query,
      'subject_access',
      'posts',
      POST_PAGE_COLUMNS,
      sql`source.id = COALESCE(subject_post.root_post_id, subject_post.id)`,
    )
  }
  query.append(sql`
    ORDER BY `)
  appendRelationOrder(query, metadata, sort)
  return query
}
