import { read } from '@data-stores/psql'
import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'
import { isUUID } from '@modules/utils'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { getCommentDescendantMaxDepth, getCommentLookDownLimits } from './placeholder-config.mts'
import { buildCommentIsValidSql, buildLookDownKeepLateral } from './placeholder-sql.mts'

/**
 * One id-ordered page of the comments below `startId` that the viewer can read. A reply is readable
 * when the thread root is. A deleted or unmoderated comment is a placeholder: it is returned only
 * when a valid reply sits below it or a look-down bound prevents a definite answer. Valid rows
 * in the walk seed one climb to their parents without another table read. A hidden or depth-boundary
 * placeholder, below which the walk loaded nothing, asks a bounded look-down. The walk does not
 * descend through a comment the viewer hid, but it returns the hidden comment; expanding it starts
 * a new walk from that comment.
 */
export async function getVisibleCommentDescendantIdsPage(
  currentUser: PrivateUser | null,
  rootId: string,
  startId: string,
  options: { limit: number; afterId?: string },
): Promise<{ results: string[]; hasNextPage: boolean }> {
  if (!isUUID(rootId)) throw createError(422, 'Invalid rootId')
  if (!isUUID(startId)) throw createError(422, 'Invalid startId')
  if (options.afterId && !isUUID(options.afterId)) throw createError(422, 'Invalid cursor')

  const eligibility = {
    currentUserId: currentUser?.id ?? null,
    isModerationStaff: isModerationStaff(currentUser),
  }
  const rootReadable = buildDirectPostEligibilityFilter('access_post', 'access_post', eligibility)
  const maxDepth = getCommentDescendantMaxDepth()
  const hiddenOf = (alias: string) =>
    currentUser
      ? sql`EXISTS (
          SELECT 1 FROM relation__user__hide__post hidden
          WHERE hidden.subject_id = ${currentUser.id}
            AND hidden.object_id = `.append(`${alias}.id`).append(sql` AND hidden.deleted_at IS NULL
        )`)
      : sql`false`
  const query = sql`/* getVisibleCommentDescendantIdsPage */
    WITH RECURSIVE descendants AS (
      SELECT p.id, p.parent_post_id, p.deleted_at, p.approved_at, p.created_by_id,
        1 AS depth, `
    .append(hiddenOf('p'))
    .append(
      sql` AS is_hidden
      FROM posts p
      JOIN posts access_post ON access_post.id = ${rootId}
      WHERE p.root_post_id = ${rootId}
        AND p.parent_post_id = ${startId}
        AND p.post_type = 'comment'
        AND `,
    )
    .append(rootReadable)
    .append(
      sql`
      UNION ALL
      SELECT child.id, child.parent_post_id, child.deleted_at, child.approved_at,
        child.created_by_id, parent.depth + 1 AS depth, `,
    )
    .append(hiddenOf('child'))
    .append(
      sql` AS is_hidden
      FROM posts child
      JOIN descendants parent ON child.parent_post_id = parent.id
      WHERE child.root_post_id = ${rootId}
        AND child.post_type = 'comment'
        AND NOT parent.is_hidden
        AND parent.depth < ${maxDepth}
    ),
    walk AS MATERIALIZED (
      SELECT descendants.* FROM descendants`,
    )
  if (options.afterId) query.append(sql` WHERE descendants.id > ${options.afterId}`)
  // Seeds are valid rows, plus a hidden or depth-boundary placeholder whose replies the walk did
  // not load. Only those placeholders need a look-down; the climb keeps all other ancestors.
  query.append(sql`
    ),
    seeds AS (
      SELECT walk.id, walk.parent_post_id
      FROM walk
      `)
  query.append(
    buildLookDownKeepLateral(
      'walk.id',
      rootId,
      eligibility,
      getCommentLookDownLimits(),
      sql`(walk.is_hidden OR walk.depth = ${maxDepth}) AND NOT `.append(
        buildCommentIsValidSql('walk', eligibility),
      ),
    ),
  )
  query.append(sql`
      WHERE `)
  query.append(buildCommentIsValidSql('walk', eligibility))
  query.append(sql` OR COALESCE(look_down_result.keep, false)`)
  query.append(sql`
    ),
    kept AS (
      SELECT id, parent_post_id FROM seeds
      UNION
      SELECT walk.id, walk.parent_post_id
      FROM walk
      JOIN kept ON walk.id = kept.parent_post_id
    )
    SELECT kept.id
    FROM kept
    ORDER BY kept.id ASC
    LIMIT ${options.limit + 1}`)
  const { rows } = await read<{ id: string }>(query.text, query.values)
  return {
    results: rows.slice(0, options.limit).map(row => row.id),
    hasNextPage: rows.length > options.limit,
  }
}
