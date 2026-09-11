import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from './get.mts'
import { enqueueOnCommunityAgentPromptsDeactivated } from '@queues/entity-listeners/enqueues'
import { enqueueSendCommunityRoleChangeEmail } from '@queues/emails/enqueues'
import { lockCommunityUsers } from '../bans/lock.mts'
import type { CommunityMemberRole } from '../types.mts'
import { recordModeratorAction } from '@services/moderator-actions'
import { invalidate } from '@services/entity-cache/invalidate'
import { getPrivateUserByAny } from '@services/users/get'
import { getSiteUrl } from '@modules/utils'
import {
  createCommunityLifecycleNotification,
  enqueueCommunityLifecycleNotificationPush,
} from '@services/notifications'
import { invalidateCommunityMemberUserMetrics } from './invalidate-user-metrics.mts'

const ROLE_RANK: Record<CommunityMemberRole, number> = { member: 0, moderator: 1, owner: 2 }

export async function updateMemberRole(
  currentUserId: string,
  communityId: string,
  targetUserId: string,
  role: CommunityMemberRole,
): Promise<void> {
  assert(currentUserId !== targetUserId, 422, 'You cannot change your own role')
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  await using query = await beginTransaction()

  const options = { query }

  await lockCommunityUsers(communityId, [currentUserId, targetUserId], options)

  const currentMembership = await getCommunityMember(communityId, currentUserId, options)
  assert(currentMembership?.role === 'owner', 403, 'Only owners can change member roles')

  const targetMembership = await getCommunityMember(communityId, targetUserId, options)
  assert(targetMembership, 404, 'Target user is not a member of this community')
  assert(targetMembership.role !== 'owner', 422, 'Cannot change the role of another owner')

  const { rows } = await write<{ updated_at: Date }>(
    sql`/* updateMemberRole */
      UPDATE community_members
      SET role = ${role}
      WHERE community_id = ${communityId}
        AND user_id = ${targetUserId}
        AND removed_at IS NULL
        AND role <> ${role}
      RETURNING updated_at
      `,
    options,
  )

  const transition = rows[0]
  const changed = transition !== undefined
  const notificationInTransaction = changed
    ? await createCommunityLifecycleNotification(
        {
          userId: targetUserId,
          communityId,
          entityType: 'community_role_change',
          eventKey: `community-role-change:${communityId}:${targetUserId}:${transition.updated_at.toISOString()}`,
          title: `Your role in ${community.name} changed`,
          body: `Your community role changed from ${targetMembership.role} to ${role}.`,
        },
        options,
      )
    : null
  await query.commit()
  const shouldDeactivatePrompts = targetMembership.role === 'moderator' && role === 'member'
  const previousRole = targetMembership.role
  const updated = changed
  const notification = notificationInTransaction
  if (notification) await enqueueCommunityLifecycleNotificationPush([notification])

  // Only log when the role actually changed — PostgreSQL reports rowCount=1 even for no-ops
  if (updated && previousRole !== role) {
    const [, , , targetUser] = await Promise.all([
      recordModeratorAction(currentUserId, {
        actionType: 'change_role',
        communityId,
        targetUserId,
        metadata: { role, previous_role: previousRole },
      }),
      invalidate.communities(communityId),
      invalidateCommunityMemberUserMetrics(targetUserId),
      getPrivateUserByAny(targetUserId),
    ])
    if (targetUser) {
      const direction: 'promoted' | 'demoted' =
        ROLE_RANK[role] > ROLE_RANK[previousRole] ? 'promoted' : 'demoted'
      void enqueueSendCommunityRoleChangeEmail(
        {
          userId: targetUser.id,
          uiLocale: targetUser.ui_locale ?? null,
        },
        {
          communityName: community.name,
          communityUrl: getSiteUrl(`/communities/${community.slug}`),
          newRole: role,
          direction,
        },
      )
    }
  }

  // Free any agent prompt slots when demoting a moderator to a regular member
  if (shouldDeactivatePrompts) {
    void enqueueOnCommunityAgentPromptsDeactivated(currentUserId, targetUserId, communityId)
  }
}
