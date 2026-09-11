import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from './get.mts'
import { enqueueOnCommunityAgentPromptsDeactivated } from '@queues/entity-listeners/enqueues'
import { lockCommunityUsers } from '../bans/lock.mts'
import { recordModeratorAction } from '@services/moderator-actions'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateCommunityMemberUserMetrics } from './invalidate-user-metrics.mts'

export async function removeMember(
  currentUserId: string,
  communityId: string,
  targetUserId: string,
): Promise<void> {
  assert(currentUserId !== targetUserId, 422, 'Use leaveCommunity to remove yourself')
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  await using query = await beginTransaction()

  const options = { query }

  await lockCommunityUsers(communityId, [currentUserId, targetUserId], options)

  const currentMembership = await getCommunityMember(communityId, currentUserId, options)
  assert(currentMembership, 403, 'Forbidden')
  assert(
    currentMembership.role === 'owner' || currentMembership.role === 'moderator',
    403,
    'Forbidden',
  )

  const targetMembership = await getCommunityMember(communityId, targetUserId, options)
  assert(targetMembership, 404, 'Target user is not a member of this community')

  // Owners can remove anyone, moderators can only remove regular members
  if (currentMembership.role === 'moderator') {
    assert(targetMembership.role === 'member', 403, 'Moderators can only remove regular members')
  }

  const { rowCount } = await write(
    sql`/* removeMember */
      UPDATE community_members
      SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${currentUserId}
      WHERE community_id = ${communityId}
        AND user_id = ${targetUserId}
        AND removed_at IS NULL
      `,
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
    await Promise.all([
      invalidate.communities(communityId),
      invalidateCommunityMemberUserMetrics(targetUserId),
    ])
  }

  // Free any agent prompt slots when removing an owner or moderator
  if (shouldDeactivatePrompts) {
    void enqueueOnCommunityAgentPromptsDeactivated(currentUserId, targetUserId, communityId)
  }
}
