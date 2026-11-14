import type { QueryExecutor } from '@data-stores/psql'
import {
  buildDirectPostEligibilityFilter,
  type DirectPostEligibilityOptions,
} from '@modules/feed-query-builders'
import sql, { type SQLStatement } from 'sql-template-strings'
import { getCommentLookDownLimits } from './placeholder-config.mts'
import { buildCommentIsValidSql, buildLookDownKeepLateral } from './placeholder-sql.mts'

export type CommentCandidate = {
  id: string
  parent_post_id: string
  is_hidden: boolean
  is_valid: boolean
}

export type CommentFrontierParent = { id: string; limit: number }
export type CommentFrontierChild = CommentCandidate & { frontier_ordinal: number }

/** Read one keyset page of direct-child heads after checking the thread root. */
export async function readCommentHeads(
  query: QueryExecutor,
  input: {
    rootId: string
    parentId: string
    limit: number
    afterId?: string
    currentUserId: string | null
    eligibility: DirectPostEligibilityOptions
  },
): Promise<CommentCandidate[]> {
  const statement = buildCommentHeadsStatement(input)
  const { rows } = await query<CommentCandidate>(statement.text, statement.values)
  return rows
}

function buildCommentHeadsStatement(input: {
  rootId: string
  parentId: string
  limit: number
  afterId?: string
  currentUserId: string | null
  eligibility: DirectPostEligibilityOptions
}): SQLStatement {
  const { rootId, parentId, limit, afterId, currentUserId, eligibility } = input
  const statement = sql`/* getVisibleCommentDescendantIdsPage:heads */ /* bounded-parent */
    WITH candidate AS MATERIALIZED (
      SELECT p.id, p.parent_post_id, p.deleted_at, p.approved_at, p.created_by_id
      FROM posts p `
  statement.append(sql`JOIN posts access_post ON access_post.id = ${rootId} `)
  // rootId is non-null; null-safe equality preserves the filter without a root-index sibling scan.
  statement.append(sql`
      WHERE p.root_post_id IS NOT DISTINCT FROM ${rootId}
        AND p.parent_post_id = ${parentId}
        AND p.post_type = 'comment'`)
  if (afterId) statement.append(sql` AND p.id > ${afterId}`)
  statement.append(sql` AND `)
  statement.append(buildDirectPostEligibilityFilter('access_post', 'access_post', eligibility))
  statement.append(sql`
      ORDER BY p.id
      LIMIT ${limit}
    )
    SELECT candidate.id, candidate.parent_post_id, `)
  if (currentUserId) {
    statement.append(sql`EXISTS (
      SELECT 1 FROM relation__user__hide__post hidden
      WHERE hidden.subject_id = ${currentUserId}
        AND hidden.object_id = candidate.id
        AND hidden.deleted_at IS NULL
    )`)
  } else {
    statement.append(sql`false`)
  }
  statement.append(sql` AS is_hidden, `)
  statement.append(buildCommentIsValidSql('candidate', eligibility))
  statement.append(sql` AS is_valid FROM candidate ORDER BY candidate.id`)
  return statement
}

/** One indexed, limited lateral slice per allocated parent in the BFS frontier. */
export async function readCommentChildrenForFrontier(
  query: QueryExecutor,
  input: {
    rootId: string
    parents: readonly CommentFrontierParent[]
    currentUserId: string | null
    eligibility: DirectPostEligibilityOptions
  },
): Promise<CommentFrontierChild[]> {
  const { rootId, parents, currentUserId, eligibility } = input
  if (parents.length === 0) return []
  const parentIds = parents.map(parent => parent.id)
  const rowLimits = parents.map(parent => parent.limit)
  const statement = sql`/* getVisibleCommentDescendantIdsPage:frontier */ /* bounded-frontier */
    WITH candidate AS MATERIALIZED (
      SELECT frontier.ordinality::integer AS frontier_ordinal,
        p.id, p.parent_post_id, p.deleted_at, p.approved_at, p.created_by_id
      FROM unnest(${parentIds}::uuid[], ${rowLimits}::integer[])
        WITH ORDINALITY AS frontier(parent_id, row_limit, ordinality)
      CROSS JOIN LATERAL (
        SELECT p.id, p.parent_post_id, p.deleted_at, p.approved_at, p.created_by_id
        FROM posts p
        WHERE p.root_post_id IS NOT DISTINCT FROM ${rootId}
          AND p.parent_post_id = frontier.parent_id
          AND p.id > frontier.parent_id
          AND p.post_type = 'comment'
        ORDER BY p.id
        LIMIT frontier.row_limit
      ) p
    )
    SELECT candidate.frontier_ordinal, candidate.id, candidate.parent_post_id, `
  if (currentUserId) {
    statement.append(sql`EXISTS (
      SELECT 1 FROM relation__user__hide__post hidden
      WHERE hidden.subject_id = ${currentUserId}
        AND hidden.object_id = candidate.id
        AND hidden.deleted_at IS NULL
    )`)
  } else {
    statement.append(sql`false`)
  }
  statement.append(sql` AS is_hidden, `)
  statement.append(buildCommentIsValidSql('candidate', eligibility))
  statement.append(
    sql` AS is_valid FROM candidate ORDER BY candidate.frontier_ordinal, candidate.id`,
  )
  const { rows } = await query<CommentFrontierChild>(statement.text, statement.values)
  return rows
}

/** Only a boundary placeholder needs a look-down; loaded valid descendants seed their ancestors. */
export async function readBoundaryPlaceholderKeeps(
  query: QueryExecutor,
  rootId: string,
  ids: string[],
  eligibility: DirectPostEligibilityOptions,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const statement = sql`/* getVisibleCommentDescendantIdsPage:boundary */ /* boundary-lookdown */
    SELECT boundary.id FROM unnest(${ids}::uuid[]) AS boundary(id) `
  statement.append(
    buildLookDownKeepLateral('boundary.id', rootId, eligibility, getCommentLookDownLimits()),
  )
  statement.append(sql` WHERE COALESCE(look_down_result.keep, false)`)
  const { rows } = await query<{ id: string }>(statement.text, statement.values)
  return new Set(rows.map(row => row.id))
}
