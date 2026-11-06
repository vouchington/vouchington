import sql, { type SQLStatement } from 'sql-template-strings'
import type { EntityRelationEntityType } from './config.mts'
import type { EntityRelationMetadata } from './metadata.mts'
import {
  entityRelationObjectColumns,
  isProjectedEntityRelationObjectType,
} from './object-projection.mts'
import { anonymousAuthorMaskFor, type EntityRelationViewer } from './viewer.mts'

export type EntityRelationPageCursor = {
  id: string
  createdAt?: string
  votesScoreSort?: number
  orderIndex?: number
}

export const POST_PAGE_COLUMNS =
  'id, root_post_id, post_type, title, declared_language, lingua_rs_detected_language, deleted_at, approved_at, created_by_id, community_id, privacy, broadcast, archived_at, is_anonymous'

export function objectLookupColumns(
  objectType: EntityRelationEntityType,
  hasSoftDelete: boolean,
): string {
  if (!isProjectedEntityRelationObjectType(objectType)) {
    throw new Error(`Entity relation reads do not project ${objectType} objects`)
  }
  if (objectType === 'post') return POST_PAGE_COLUMNS
  const columns: string[] = [...entityRelationObjectColumns[objectType]]
  if (hasSoftDelete) columns.push('deleted_at')
  return columns.join(', ')
}

/** One indexed child row. LIMIT 1 keeps the planner on the primary key for a page of ids. */
export function appendBoundedLookup(
  query: SQLStatement,
  alias: string,
  table: string,
  columns: string,
  predicate: SQLStatement,
): void {
  query.append(sql`
    LEFT JOIN LATERAL (
      SELECT `)
  query.append(columns)
  query.append(sql`
      FROM `)
  query.append(table)
  query.append(sql` AS source
      WHERE `)
  query.append(predicate)
  query.append(sql`
      LIMIT 1
    ) `)
  query.append(alias)
  query.append(sql` ON TRUE`)
}

export function appendFilters(query: SQLStatement, filters: readonly SQLStatement[]): void {
  filters.forEach((filter, index) => {
    if (index > 0)
      query.append(sql`
        AND `)
    query.append(filter)
  })
}

export function appendRelationOrder(
  query: SQLStatement,
  metadata: EntityRelationMetadata,
  sort: 'best' | 'newest',
): void {
  // sort=best on non-election relations falls back to order_index or created_at DESC.
  if (sort === 'best' && metadata.election) {
    query.append(sql`r.votes_score_sort DESC, r.created_at DESC, r.object_id DESC`)
  } else if (sort === 'newest' || !metadata.order_index) {
    query.append(sql`r.created_at DESC, r.object_id DESC`)
  } else {
    query.append(sql`r.order_index ASC, r.object_id ASC`)
  }
}

export function buildEligibleExpression(
  objectHasSoftDelete: boolean,
  objectPostFilter: SQLStatement | null,
  subjectPostFilter: SQLStatement | null,
): SQLStatement {
  const parts: SQLStatement[] = [sql`obj.id IS NOT NULL`]
  if (objectHasSoftDelete && !objectPostFilter) parts.push(sql`obj.deleted_at IS NULL`)
  if (objectPostFilter) {
    parts.push(sql`obj_access.id IS NOT NULL`)
    parts.push(objectPostFilter)
  }
  if (subjectPostFilter) {
    parts.push(sql`subject_post.id IS NOT NULL`)
    parts.push(sql`subject_access.id IS NOT NULL`)
    parts.push(subjectPostFilter)
  }
  const statement = sql`(`
  parts.forEach((part, index) => {
    if (index > 0) statement.append(sql` AND `)
    statement.append(part)
  })
  return statement.append(sql`)`)
}

export function buildCreatedByColumn(
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

export function buildCursorFilter(
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
