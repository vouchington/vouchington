import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import createHttpError from 'http-errors'

export async function transferLockedCommunityOwnership(
  communityId: string,
  fromUserId: string,
  toUserId: string,
  options: QueryOptions,
): Promise<{ demotedUpdatedAt: Date; promotedUpdatedAt: Date }> {
  // Swap roles atomically in one statement: if either precondition fails, neither update commits.
  const { rows } = await write(
    sql`/* transferCommunityOwnership */
    WITH demote AS (
      UPDATE community_members
      SET role = 'moderator'
      WHERE community_id = ${communityId}
        AND user_id = ${fromUserId}
        AND role = 'owner'
        AND removed_at IS NULL
      RETURNING updated_at
    ),
    promote AS (
      UPDATE community_members
      SET role = 'owner'
      WHERE community_id = ${communityId}
        AND user_id = ${toUserId}
        AND role = 'moderator'
        AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM users target WHERE target.id = ${toUserId} AND target.deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = ${toUserId} AND lifted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM user_deletion_requests WHERE user_id = ${toUserId} AND completed_at IS NULL)
        AND EXISTS (SELECT 1 FROM demote)
      RETURNING updated_at
    )
    SELECT
      (SELECT COUNT(*) FROM demote)::int AS demoted,
      (SELECT COUNT(*) FROM promote)::int AS promoted,
      (SELECT updated_at FROM demote) AS demoted_updated_at,
      (SELECT updated_at FROM promote) AS promoted_updated_at
    `,
    options,
  )
  const { demoted, promoted, demoted_updated_at, promoted_updated_at } = rows[0] as {
    demoted: number
    promoted: number
    demoted_updated_at: Date | null
    promoted_updated_at: Date | null
  }
  if (demoted === 0) throw createHttpError(409, 'Community ownership changed concurrently')
  if (promoted === 0) throw createHttpError(422, 'Target user is no longer an eligible moderator')
  assert(demoted_updated_at && promoted_updated_at, 500, 'Ownership transition timestamps missing')
  return { demotedUpdatedAt: demoted_updated_at, promotedUpdatedAt: promoted_updated_at }
}
