import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewBanEvasionFlag } from './authorization.mts'
import { resolveBanEvasionSystemReports } from './resolve-system-report.mts'

export async function dismissBanEvasionFlag(
  currentUser: PrivateUser,
  communityId: string,
  userId: string,
): Promise<void> {
  await currentUserCanReviewBanEvasionFlag(currentUser, communityId)
  assert(currentUser.id !== userId, 403, 'Cannot dismiss your own ban-evasion flag')

  const { rowCount } = await write(sql`/* dismissBanEvasionFlag:update-member */
    UPDATE community_members
    SET suspected_ban_evader_dismissed_at = CURRENT_TIMESTAMP,
        suspected_ban_evader_dismissed_by_id = ${currentUser.id}
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
      AND suspected_ban_evader_at IS NOT NULL
      AND suspected_ban_evader_dismissed_at IS NULL
  `)
  assert(rowCount, 404, 'No active ban-evasion flag found for this user in this community')

  await resolveBanEvasionSystemReports(currentUser.id, communityId, userId, 'dismissed')
}
