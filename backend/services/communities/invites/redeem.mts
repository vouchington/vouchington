import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import { assertNotBanned } from '../bans/get.mts'
import { lockCommunityUser } from '../bans/lock.mts'
import type { CommunityInvite } from '../types.mts'
import { invalidateCommunityMemberUserMetrics } from '../members/invalidate-user-metrics.mts'
import { hashCommunityInviteCode } from './code.mts'
import { deletePendingInvitesForMember } from './delete-pending-for-member.mts'

export async function redeemInviteCode(
  currentUserId: string,
  code: string,
): Promise<CommunityInvite> {
  await using query = await beginTransaction()
  const options = { query }
  const codeHash = hashCommunityInviteCode(code)

  const { rows } = await read(
    sql`/* redeemInviteCode */
    SELECT 'community_invite'::text AS __entity_type,
      id, community_id, invited_user_id, invited_email, invited_by_id,
      accepted_at, accepted_by_id, declined_at, revoked_at, created_at
    FROM community_invites
    WHERE code_hash = ${codeHash}
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

  // Accepting the invite and adding the member are one statement: the member row is derived from
  // the invite row this statement accepted, so a lost race inserts nothing and fails the count.
  const { rows: acceptRows } = await write(
    sql`/* redeemInviteCode:accept */
    WITH accepted AS (
      UPDATE community_invites
      SET accepted_at = CURRENT_TIMESTAMP,
          accepted_by_id = ${currentUserId}
      WHERE id = ${found.id}
        AND accepted_at IS NULL
        AND declined_at IS NULL
        AND revoked_at IS NULL
      RETURNING id
    ), added AS (
      INSERT INTO community_members (community_id, user_id, role, approved_by_id)
      SELECT
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
            JOIN user_role_types urt ON urt.id = ur.role_type_id
            WHERE ur.user_id = ${found.invited_by_id}
              AND urt.slug = 'administrator'
          )
            THEN ${found.invited_by_id}::uuid
          ELSE NULL::uuid
        END
      FROM accepted
      ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL DO NOTHING
    )
    SELECT COUNT(*)::int AS accepted_count FROM accepted
    `,
    options,
  )
  assert(acceptRows[0]?.accepted_count === 1, 409, 'Invite has already been redeemed')
  await deletePendingInvitesForMember(found.community_id, currentUserId, options)

  const invite = {
    ...found,
    accepted_at: new Date(),
    accepted_by_id: currentUserId,
  } as CommunityInvite

  await query.commit()

  await invalidateCommunityMemberUserMetrics(currentUserId)
  return invite
}
