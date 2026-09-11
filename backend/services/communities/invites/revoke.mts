import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import type { CommunityInvite } from '../types.mts'

export async function revokeInvite(currentUserId: string, inviteId: string): Promise<void> {
  const { rows } = await read(
    sql`/* revokeInvite */
    SELECT *
    FROM community_invites
    WHERE id = ${inviteId}
    LIMIT 1
    `,
  )

  const invite = rows[0] as CommunityInvite | undefined
  assert(invite, 404, 'Invite not found')
  assert(!invite.revoked_at && !invite.accepted_at, 422, 'Invite has already been used or revoked')

  const [community, membership] = await Promise.all([
    getCommunity(invite.community_id),
    getCommunityMember(invite.community_id, currentUserId),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  assert(membership?.role === 'owner' || membership?.role === 'moderator', 403, 'Forbidden')

  await write(
    sql`/* revokeInvite */
    UPDATE community_invites
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ${inviteId}
      AND revoked_at IS NULL
      AND accepted_at IS NULL
    `,
  )
}
