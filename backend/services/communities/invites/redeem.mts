import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import { assertNotBanned } from '../bans/get.mts'
import { lockCommunityUser } from '../bans/lock.mts'
import type { CommunityInvite } from '../types.mts'
import { invalidateCommunityMemberUserMetrics } from '../members/invalidate-user-metrics.mts'

export async function redeemInviteCode(
  currentUserId: string,
  code: string,
): Promise<CommunityInvite> {
  await using query = await beginTransaction()
  const options = { query }

  const { rows } = await read(
    sql`/* redeemInviteCode */
    SELECT *
    FROM community_invites
    WHERE code = ${code.toLowerCase()}
      AND accepted_at IS NULL
      AND declined_at IS NULL
      AND revoked_at IS NULL
    LIMIT 1
    `,
    options,
  )

  const found = rows[0] as CommunityInvite | undefined
  assert(found, 404, 'Invite not found or has expired')
  assert(
    found.invited_user_id == null || found.invited_user_id === currentUserId,
    403,
    'This invite was sent to a specific user',
  )

  const community = await getCommunity(found.community_id, options)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  // Serialize against a concurrent ban for this user so the check + insert are atomic.
  await lockCommunityUser(found.community_id, currentUserId, options)

  const existing = await getCommunityMember(found.community_id, currentUserId, options)
  assert(!existing, 409, 'You are already a member of this community')
  await assertNotBanned(found.community_id, currentUserId, options)

  const { rowCount } = await write(
    sql`/* redeemInviteCode */
    UPDATE community_invites
    SET accepted_at = CURRENT_TIMESTAMP,
        accepted_by_user_id = ${currentUserId}
    WHERE code = ${code.toLowerCase()}
      AND accepted_at IS NULL
      AND declined_at IS NULL
      AND revoked_at IS NULL
    `,
    options,
  )
  assert(rowCount === 1, 409, 'Invite has already been redeemed')

  await write(
    sql`/* redeemInviteCode */
    INSERT INTO community_members (community_id, user_id, role, approved_by_id)
    VALUES (
      ${found.community_id},
      ${currentUserId},
      'member',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM community_members inviter
          WHERE inviter.community_id = ${found.community_id}
            AND inviter.user_id = ${found.invited_by_id}
            AND inviter.role IN ('owner', 'moderator')
            AND inviter.removed_at IS NULL
        ) OR EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN user_roles_types urt ON urt.id = ur.role_type_id
          WHERE ur.user_id = ${found.invited_by_id}
            AND urt.slug = 'administrator'
        )
          THEN ${found.invited_by_id}::uuid
        ELSE NULL::uuid
      END
    )
    ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL DO NOTHING
    `,
    options,
  )

  const invite = {
    ...found,
    accepted_at: new Date(),
    accepted_by_user_id: currentUserId,
  } as CommunityInvite

  await query.commit()

  await invalidateCommunityMemberUserMetrics(currentUserId)
  return invite
}
