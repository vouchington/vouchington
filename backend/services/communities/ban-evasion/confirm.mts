import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { banUserFromCommunity } from '@services/communities/bans/create'
import { getPublicUserByAny } from '@services/users/get'
import { isModerationStaff } from '@services/users/authorization'
import { resolveBanEvasionSystemReports } from './resolve-system-report.mts'

export async function confirmBanEvasion(
  currentUser: PrivateUser,
  communityId: string,
  userId: string,
): Promise<void> {
  assert(isModerationStaff(currentUser), 403, 'Forbidden')

  // Atomically claim the active flag; if a concurrent dismiss already cleared it, abort before
  // touching community_bans so a dismissed false-positive is never promoted to a real ban.
  await using query = await beginTransaction()

  const flagClaim = await write<{ suspected_ban_evader_source_user_id: string | null }>(
    sql`/* confirmBanEvasion:claim-flag */
      UPDATE community_members
      SET suspected_ban_evader_dismissed_at = CURRENT_TIMESTAMP,
          suspected_ban_evader_dismissed_by_id = ${currentUser.id}
      WHERE community_id = ${communityId}
        AND user_id = ${userId}
        AND removed_at IS NULL
        AND suspected_ban_evader_at IS NOT NULL
        AND suspected_ban_evader_dismissed_at IS NULL
      RETURNING suspected_ban_evader_source_user_id
      `,
    { query },
  )

  await query.commit()
  const { rows, rowCount } = flagClaim

  assert(rowCount, 422, 'No active ban-evasion flag found for this member')

  const sourceUserId = rows[0]?.suspected_ban_evader_source_user_id ?? null
  const sourceUsername = sourceUserId
    ? ((await getPublicUserByAny(sourceUserId))?.username ?? null)
    : null

  const reason = sourceUsername
    ? `Confirmed ban evasion of @${sourceUsername}`
    : 'Confirmed ban evasion'

  try {
    await banUserFromCommunity(currentUser, communityId, userId, {
      reason,
      bypassCommunityMemberCheck: true,
    })
  } catch (err) {
    // Restore the flag so the member re-appears in the moderation queue rather than
    // silently disappearing without a ban when the ban itself fails.
    await write(sql`/* confirmBanEvasion:restore-flag */
      UPDATE community_members
      SET suspected_ban_evader_dismissed_at = NULL,
          suspected_ban_evader_dismissed_by_id = NULL
      WHERE community_id = ${communityId}
        AND user_id = ${userId}
        AND suspected_ban_evader_dismissed_by_id = ${currentUser.id}
    `)
    throw err
  }

  await resolveBanEvasionSystemReports(currentUser.id, communityId, userId, 'actioned')
}
