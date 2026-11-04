import { writeCommunityMembershipMutation } from '@services/communities/members/write-membership'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { deletePendingInvitesForMember } from '../invites/delete-pending-for-member.mts'
import { assertCommunityMembershipCapacity } from '../membership-limits.mts'

export async function insertApprovedCommunityMember(
  communityId: string,
  userId: string,
  approvedById: string,
  options: QueryOptions,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- capacity must be checked before admission; only a successful membership insertion consumes pending invitations
  await assertCommunityMembershipCapacity(userId, communityId, options)
  await writeCommunityMembershipMutation(
    sql`/* insertApprovedCommunityMember */
    INSERT INTO community_members (community_id, user_id, role, approved_by_id)
    VALUES (${communityId}, ${userId}, 'member', ${approvedById})
    ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL DO NOTHING
  `,
    { userIds: [userId], communityIds: [communityId] },
    options,
  )
  await deletePendingInvitesForMember(communityId, userId, options)
}
