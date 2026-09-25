import sql, { type SQLStatement } from 'sql-template-strings'
import { entityRelationEntityTables, type EntityRelationMetadata } from './metadata.mts'
import { buildEntityRelationObjectData } from './object-projection.mts'
import { buildObjectPostAccessFilter, buildSubjectPostAccessFilter } from './post-access.mts'
import { buildVoteScoreFilters } from './vote-score-filters.mts'
import { anonymousAuthorMaskFor, type EntityRelationViewer } from './viewer.mts'

export type EntityRelationPageCursor = {
  id: string
  createdAt?: string
  votesScoreSort?: number
  orderIndex?: number
}

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
 * Lists a subject's relations as the viewer may see them. The subject post follows direct access
 * (plus its author); listed object posts follow discovery rules, and objects named by `objectIds`
 * follow direct access. An anonymous post's author is hidden as a relation creator. Visibility is
 * filtered in SQL so LIMIT-based page detection stays exact.
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

  const query = sql`/* buildEntityRelationSelectQuery */
    SELECT
      r.subject_id,
      r.object_id,
      `
    .append(buildCreatedByColumn(viewer, joinsSubjectPost, objectIsPost))
    .append(
      sql`,
      r.created_at,
      r.deleted_at,
      r.deleted_by_id,`,
    )
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
  // Table and alias names below come from config constants, never from input.
  query.append(metadata.table_name)
  query.append(sql` AS r`)

  // select_table swaps in a redacted view (view_users_public for users).
  const objectEntityConfig = entityRelationEntityTables[metadata.object_type]
  query.append(sql`
    JOIN `)
  query.append(objectEntityConfig.select_table ?? objectEntityConfig.foreign_key_table)
  query.append(sql` AS obj ON r.object_id = obj.id`)
  if (objectPostFilter) {
    query.append(sql`
    JOIN posts AS obj_access ON obj_access.id = COALESCE(obj.root_id, obj.id)`)
  }
  if (joinsSubjectPost) {
    query.append(sql`
    JOIN posts AS subject_post ON subject_post.id = r.subject_id
    JOIN posts AS subject_access ON subject_access.id = COALESCE(subject_post.root_id, subject_post.id)`)
  }

  const filters: SQLStatement[] = [sql`r.subject_id = ${subjectId}`, sql`r.deleted_at IS NULL`]
  if (objectEntityConfig.has_soft_delete) filters.push(sql`obj.deleted_at IS NULL`)
  if (objectIds) filters.push(sql`r.object_id = ANY(${objectIds}::uuid[])`)
  if (objectPostFilter) filters.push(objectPostFilter)
  if (subjectPostFilter) filters.push(subjectPostFilter)
  filters.push(...buildVoteScoreFilters(metadata, options))
  if (after) filters.push(buildCursorFilter(metadata, sort, after))

  query.append(sql`
    WHERE `)
  filters.forEach((filter, index) => {
    if (index > 0)
      query.append(sql`
      AND `)
    query.append(filter)
  })

  // sort=best on non-election relations falls back to order_index or created_at DESC.
  query.append(sql`
    ORDER BY `)
  if (sort === 'best' && metadata.election) {
    query.append(sql`r.votes_score_sort DESC, r.created_at DESC, r.object_id DESC`)
  } else if (sort === 'newest' || !metadata.order_index) {
    query.append(sql`r.created_at DESC, r.object_id DESC`)
  } else {
    query.append(sql`r.order_index ASC, r.object_id ASC`)
  }
  query.append(sql`
    LIMIT ${limit}`)
  return query
}

function buildCreatedByColumn(
  viewer: EntityRelationViewer,
  joinsSubjectPost: boolean,
  objectIsPost: boolean,
): SQLStatement {
  const mask = anonymousAuthorMaskFor(viewer)
  const anonymousAuthorships: string[] = []
  if (joinsSubjectPost) {
    anonymousAuthorships.push(
      '(subject_post.is_anonymous AND subject_post.created_by_id = r.created_by_id)',
    )
  }
  if (objectIsPost) {
    anonymousAuthorships.push('(obj.is_anonymous AND obj.created_by_id = r.created_by_id)')
  }
  if (!mask || anonymousAuthorships.length === 0) return sql`r.created_by_id`
  return sql`CASE WHEN r.created_by_id IS DISTINCT FROM ${mask.viewerUserId}::uuid AND (`
    .append(anonymousAuthorships.join(' OR '))
    .append(sql`) THEN NULL ELSE r.created_by_id END AS created_by_id`)
}

function buildCursorFilter(
  metadata: EntityRelationMetadata,
  sort: 'best' | 'newest',
  after: EntityRelationPageCursor,
): SQLStatement {
  if (sort === 'best' && metadata.election) {
    return sql`(r.votes_score_sort, r.created_at, r.object_id) < (${after.votesScoreSort}, ${after.createdAt}, ${after.id})`
  }
  if (sort === 'newest' || !metadata.order_index) {
    return sql`(r.created_at, r.object_id) < (${after.createdAt}, ${after.id})`
  }
  return sql`(r.order_index, r.object_id) > (${after.orderIndex}, ${after.id})`
}
