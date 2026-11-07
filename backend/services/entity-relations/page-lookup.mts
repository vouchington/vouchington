import sql, { type SQLStatement } from 'sql-template-strings'
import type { EntityRelationMetadata } from './metadata.mts'
import { anonymousAuthorMaskFor, type EntityRelationViewer } from './viewer.mts'

export type EntityRelationPageCursor = {
  id: string
  createdAt?: string
  votesScoreSort?: number
  orderIndex?: number
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
