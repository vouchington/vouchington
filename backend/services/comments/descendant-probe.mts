import type { QueryExecutor } from '@data-stores/psql'
import {
  buildDirectPostEligibilityFilter,
  type DirectPostEligibilityOptions,
} from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import { getCommentLookDownLimits } from './placeholder-config.mts'
import { buildCommentIsValidSql, buildLookDownKeepLateral } from './placeholder-sql.mts'

export type CommentCandidate = {
  id: string
  parent_post_id: string
  is_hidden: boolean
  is_valid: boolean
}

/** Every probe takes an indexed parent/id slice before any placeholder look-down. */
export async function readCommentCandidates(
  query: QueryExecutor,
  input: {
    rootId: string
    parentId: string
    limit: number
    afterId?: string
    checkRoot: boolean
    currentUserId: string | null
    eligibility: DirectPostEligibilityOptions
  },
): Promise<CommentCandidate[]> {
  const { rootId, parentId, limit, afterId, checkRoot, currentUserId, eligibility } = input
  const statement = sql`/* getVisibleCommentDescendantIdsPage */ /* bounded-parent */
    WITH candidate AS MATERIALIZED (
      SELECT p.id, p.parent_post_id, p.deleted_at, p.approved_at, p.created_by_id
      FROM posts p `
  if (checkRoot) statement.append(sql`JOIN posts access_post ON access_post.id = ${rootId} `)
  statement.append(sql`
      WHERE p.root_post_id = ${rootId}
        AND p.parent_post_id = ${parentId}
        AND p.id > ${parentId}
        AND p.post_type = 'comment'`)
  if (afterId) statement.append(sql` AND p.id > ${afterId}`)
  if (checkRoot) {
    statement.append(sql` AND `)
    statement.append(buildDirectPostEligibilityFilter('access_post', 'access_post', eligibility))
  }
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
  const { rows } = await query<CommentCandidate>(statement.text, statement.values)
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
  const statement = sql`/* getVisibleCommentDescendantIdsPage */ /* boundary-lookdown */
    SELECT boundary.id FROM unnest(${ids}::uuid[]) AS boundary(id) `
  statement.append(
    buildLookDownKeepLateral('boundary.id', rootId, eligibility, getCommentLookDownLimits()),
  )
  statement.append(sql` WHERE COALESCE(look_down_result.keep, false)`)
  const { rows } = await query<{ id: string }>(statement.text, statement.values)
  return new Set(rows.map(row => row.id))
}
