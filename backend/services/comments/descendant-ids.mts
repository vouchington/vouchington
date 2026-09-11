import { read } from '@data-stores/psql'
import {
  buildDirectPostEligibilityFilter,
  type DirectPostEligibilityOptions,
} from '@modules/feed-query-builders'
import { isUUID } from '@modules/utils'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql, { type SQLStatement } from 'sql-template-strings'

export async function getVisibleCommentDescendantIdsPage(
  currentUser: PrivateUser | null,
  rootId: string,
  startId: string,
  options: { limit: number; afterId?: string },
): Promise<{ results: string[]; hasNextPage: boolean }> {
  if (!isUUID(rootId)) throw createError(422, 'Invalid rootId')
  if (!isUUID(startId)) throw createError(422, 'Invalid startId')
  if (options.afterId && !isUUID(options.afterId)) throw createError(422, 'Invalid cursor')

  const eligibilityOptions = {
    currentUserId: currentUser?.id ?? null,
    isModerationStaff: isModerationStaff(currentUser),
  }
  const baseEligibility = buildTraversableCommentEligibility('p', 'access_post', eligibilityOptions)
  const childEligibility = buildTraversableCommentEligibility(
    'child',
    'access_post',
    eligibilityOptions,
  )
  const query = sql`/* getVisibleCommentDescendantIdsPage */
    WITH RECURSIVE descendants AS (
      SELECT p.id, p.parent_id
      FROM posts p
      JOIN posts access_post ON access_post.id = ${rootId}
      WHERE p.root_id = ${rootId}
        AND p.parent_id = ${startId}
        AND p.post_type = 'comment'
        AND `
    .append(baseEligibility)
    .append(sql`
      UNION ALL
      SELECT child.id, child.parent_id
      FROM posts child
      JOIN descendants parent ON child.parent_id = parent.id
      JOIN posts access_post ON access_post.id = ${rootId}
      WHERE child.root_id = ${rootId}
        AND child.post_type = 'comment'
        AND `)
    .append(childEligibility).append(sql`
    )
    SELECT descendants.id
    FROM descendants`)
  if (options.afterId) query.append(sql` WHERE descendants.id > ${options.afterId}`)
  query.append(sql` ORDER BY descendants.id ASC LIMIT ${options.limit + 1}`)
  const { rows } = await read<{ id: string }>(query)
  return {
    results: rows.slice(0, options.limit).map(row => row.id),
    hasNextPage: rows.length > options.limit,
  }
}

function buildTraversableCommentEligibility(
  candidateAlias: string,
  rootAlias: string,
  options: DirectPostEligibilityOptions,
): SQLStatement {
  const candidateEligibility = buildDirectPostEligibilityFilter(candidateAlias, rootAlias, options)
  const tombstoneRootEligibility = buildDirectPostEligibilityFilter(rootAlias, rootAlias, options)
  return sql`(`
    .append(candidateEligibility)
    .append(sql` OR (`)
    .append(`${candidateAlias}.deleted_at IS NOT NULL AND `)
    .append(tombstoneRootEligibility)
    .append(sql`))`)
}
