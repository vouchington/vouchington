import { writeCommunityMembershipMutation } from '@services/communities/members/write-membership'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getActiveCommunityMembersForUsers } from './batch.mts'
import type { Community } from '../types.mts'
import { enqueueOnCommunityAgentPromptsDeactivated } from '@queues/entity-listeners/enqueues'
import { recordModeratorAction } from '@services/moderator-actions'
import { invalidateCommunityMemberUserMetrics } from './invalidate-user-metrics.mts'

export async function removeMember(
  currentUserId: string,
  community: Community,
  targetUserId: string,
): Promise<void> {
  assert(currentUserId !== targetUserId, 422, 'Use leaveCommunity to remove yourself')
  const communityId = community.id
  assert(!community.archived_at, 403, 'Community is archived')

  await using query = await beginTransaction()

  const options = { query }

  const members = await getActiveCommunityMembersForUsers(
    communityId,
    [currentUserId, targetUserId],
    options,
  )
  const currentMembership = members.get(currentUserId) ?? null
  assert(currentMembership, 403, 'Forbidden')
  assert(
    currentMembership.role === 'owner' || currentMembership.role === 'moderator',
    403,
    'Forbidden',
  )

  const targetMembership = members.get(targetUserId) ?? null
  assert(targetMembership, 404, 'Target user is not a member of this community')

  // Owners can remove anyone, moderators can only remove regular members
  if (currentMembership.role === 'moderator') {
    assert(targetMembership.role === 'member', 403, 'Moderators can only remove regular members')
  }

  const { rowCount } = await writeCommunityMembershipMutation(
    sql`/* removeMember */
      UPDATE community_members
      SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${currentUserId}
      WHERE community_id = ${communityId}
        AND user_id = ${targetUserId}
        AND removed_at IS NULL
      `,
    { userIds: [targetUserId], communityIds: [communityId] },
    options,
  )

  await query.commit()
  const shouldDeactivatePrompts =
    targetMembership.role === 'moderator' || targetMembership.role === 'owner'
  const removed = (rowCount ?? 0) > 0

  if (removed) {
    await recordModeratorAction(currentUserId, {
      actionType: 'remove_member',
      communityId,
      targetUserId,
    })
    await invalidateCommunityMemberUserMetrics(targetUserId)
  }

  // Free any agent prompt slots when removing an owner or moderator
  if (shouldDeactivatePrompts) {
    await enqueueOnCommunityAgentPromptsDeactivated(currentUserId, targetUserId, communityId)
  }
}
