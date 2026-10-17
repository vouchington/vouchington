import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { deletePendingInvitesForMember } from '../invites/delete-pending-for-member.mts'

export async function insertApprovedCommunityMember(
  communityId: string,
  userId: string,
  approvedById: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* insertApprovedCommunityMember */
    INSERT INTO community_members (community_id, user_id, role, approved_by_id)
    VALUES (${communityId}, ${userId}, 'member', ${approvedById})
    ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL DO NOTHING
  `,
    options,
  )
  await deletePendingInvitesForMember(communityId, userId, options)
}
