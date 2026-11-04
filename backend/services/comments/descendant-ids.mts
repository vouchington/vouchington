import { read } from '@data-stores/psql'
import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'
import { isUUID } from '@modules/utils'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { getCommentLookDownLimits } from './placeholder-config.mts'
import { buildCommentIsValidSql, buildLookDownKeepLateral } from './placeholder-sql.mts'

/**
 * One id-ordered page of the comments below `startId` that the viewer can read. A reply is readable
 * when the thread root is. A deleted or unmoderated comment is a placeholder: it is returned only
 * when a valid reply sits below it within the look-down limits, so a chain of placeholders with no
 * valid reply is not. The walk does not descend through a comment the viewer hid, but it returns the
 * hidden comment; expanding it starts a new walk from that comment. A signed-out viewer has no hide.
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
  const query = sql`/* getVisibleCommentDescendantIdsPage */
    WITH RECURSIVE descendants AS (
      SELECT p.id, p.deleted_at, p.approved_at, p.created_by_id
      FROM posts p
      JOIN posts access_post ON access_post.id = ${rootId}
      WHERE p.root_post_id = ${rootId}
        AND p.parent_post_id = ${startId}
        AND p.post_type = 'comment'
        AND `
    .append(rootReadable)
    .append(
      sql`
      UNION ALL
      SELECT child.id, child.deleted_at, child.approved_at, child.created_by_id
      FROM posts child
      JOIN descendants parent ON child.parent_post_id = parent.id
      WHERE child.root_post_id = ${rootId}
        AND child.post_type = 'comment'`,
    )
  // A hidden comment is a collapsed one: its replies load when the viewer expands it.
  if (currentUser) {
    query.append(sql`
        AND NOT EXISTS (
          SELECT 1 FROM relation__user__hide__post hidden
          WHERE hidden.subject_id = ${currentUser.id}
            AND hidden.object_id = parent.id
            AND hidden.deleted_at IS NULL
        )`)
  }
  query.append(sql`
    ),
    ordered AS MATERIALIZED (
      SELECT descendants.id, descendants.deleted_at, descendants.approved_at, descendants.created_by_id
      FROM descendants`)
  if (options.afterId) query.append(sql` WHERE descendants.id > ${options.afterId}`)
  query.append(sql`
      ORDER BY descendants.id ASC
    )
    SELECT ordered.id
    FROM ordered
    `)
  query.append(
    buildLookDownKeepLateral(
      'ordered.id',
      rootId,
      eligibility,
      getCommentLookDownLimits(),
      sql`NOT `.append(buildCommentIsValidSql('ordered', eligibility)),
    ),
  )
  query.append(sql`
    WHERE `)
  query.append(buildCommentIsValidSql('ordered', eligibility))
  query.append(sql` OR COALESCE(look_down_result.keep, false)
    ORDER BY ordered.id ASC
    LIMIT ${options.limit + 1}`)
  const { rows } = await read<{ id: string }>(query.text, query.values)
  return {
    results: rows.slice(0, options.limit).map(row => row.id),
    hasNextPage: rows.length > options.limit,
  }
}
