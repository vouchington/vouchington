import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users/authorization'

export async function currentUserCanReviewBanEvasionFlag(
  currentUser: PrivateUser,
  communityId: string,
): Promise<void> {
  if (isModerationStaff(currentUser)) return

  const { rows } = await read<{ role: string }>(sql`/* currentUserCanReviewBanEvasionFlag */
    SELECT role
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${currentUser.id}
      AND removed_at IS NULL
    LIMIT 1
  `)

  const membership = rows[0]
  assert(membership, 403, 'Forbidden')
  assert(membership.role === 'owner' || membership.role === 'moderator', 403, 'Forbidden')
}
