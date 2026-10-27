import { transferLockedCommunityOwnership } from './ownership-transfer-core.mts'
import { createOwnershipTransferNotifications } from './ownership-transfer-notifications.mts'
import {
  lockActiveUserLifecycleForMutation,
  lockUserSubjectMutationFences,
} from '@services/users/active-user-lifecycle-lock'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getActiveCommunityMembersForUsers } from './members/batch.mts'
import type { Community } from './types.mts'
import {
  lockCommunityMembershipRoles,
  lockCommunityRoleMutation,
  lockCommunityUsers,
} from './bans/lock.mts'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { enqueueSendCommunityOwnershipTransferEmail } from '@queues/emails/enqueues'
import { getSiteUrl } from '@modules/utils'
import { enqueueCommunityLifecycleNotificationPush } from '@services/notifications'

/**
 * Allows an owner to voluntarily transfer ownership to a moderator.
 * The target must be an active moderator of the community.
 */
export async function initiateOwnershipTransfer(
  currentUserId: string,
  community: Community,
  targetUserId: string,
): Promise<OwnershipTransferEmailEnqueues> {
  assert(currentUserId !== targetUserId, 422, 'You cannot transfer ownership to yourself')
  const communityId = community.id
  assert(!community.archived_at, 403, 'Community is archived')

  await using query = await beginTransaction()
  const opts = { query }

  await lockCommunityRoleMutation(query, communityId, [currentUserId, targetUserId])

  const members = await getActiveCommunityMembersForUsers(
    communityId,
    [currentUserId, targetUserId],
    opts,
  )
  const currentMember = members.get(currentUserId) ?? null
  const targetMember = members.get(targetUserId) ?? null

  assert(currentMember?.role === 'owner', 403, 'Only owners can transfer ownership')
  assert(targetMember, 404, 'Target user is not a member of this community')
  assert(targetMember.role === 'moderator', 422, 'Ownership can only be transferred to a moderator')

  const transition = await transferLockedCommunityOwnership(
    communityId,
    currentUserId,
    targetUserId,
    opts,
  )
  const pushNotifications = await createOwnershipTransferNotifications(
    community,
    targetUserId,
    transition,
    opts,
    currentUserId,
  )

  await query.commit()

  if (pushNotifications.length > 0) {
    await enqueueCommunityLifecycleNotificationPush(pushNotifications)
  }

  return await sendOwnershipTransferEmails(
    community.name,
    community.slug,
    targetUserId,
    currentUserId,
  )
}

/** Trusted account purge shares the transition and successor delivery, inside its transaction. */
export async function transferCommunityOwnershipForUserPurge(
  query: TransactionQuery,
  community: Pick<Community, 'id' | 'name' | 'slug'>,
  fromUserId: string,
  toUserId: string,
): Promise<(() => Promise<void>) | null> {
  await lockCommunityMembershipRoles(query, [community.id])
  // The SQL active-user guard raises for an inactive subject, which would poison the caller-owned
  // transaction. Fence deletion first, then make expected ineligibility an ordinary empty result.
  await lockUserSubjectMutationFences(query, [toUserId])
  const { rows: activeUsers } = await query(sql`/* transferCommunityOwnershipForUserPurge:active */
    SELECT id FROM users WHERE id = ${toUserId} AND deleted_at IS NULL`)
  if (!activeUsers[0]) return null
  // ast-grep-ignore: no-three-sequential-awaits -- lifecycle, sorted member locks, then eligibility must be ordered.
  await lockActiveUserLifecycleForMutation(query, toUserId)
  await lockCommunityUsers(community.id, [fromUserId, toUserId], { query })
  const { rows } = await query(sql`/* transferCommunityOwnershipForUserPurge:eligible */
    SELECT member.id FROM community_members member JOIN users target ON target.id = member.user_id
    WHERE member.community_id = ${community.id} AND member.user_id = ${toUserId}
      AND member.role = 'moderator' AND member.removed_at IS NULL AND target.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM community_members owner
        WHERE owner.community_id = ${community.id} AND owner.user_id = ${fromUserId}
          AND owner.role = 'owner' AND owner.removed_at IS NULL
      )
      AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = target.id AND lifted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM user_deletion_requests WHERE user_id = target.id AND completed_at IS NULL)
    LIMIT 1`)
  if (!rows[0]) return null
  const transition = await transferLockedCommunityOwnership(community.id, fromUserId, toUserId, {
    query,
  })
  const notifications = await createOwnershipTransferNotifications(
    community,
    toUserId,
    transition,
    { query },
  )
  return async () => {
    await enqueueCommunityLifecycleNotificationPush(notifications)
    const emails = await sendOwnershipTransferEmails(community.name, community.slug, toUserId)
    await Promise.all(Object.values(emails).filter(email => email !== null))
  }
}

type OwnershipTransferEmailEnqueues = {
  newOwnerEmailEnqueue: ReturnType<typeof enqueueSendCommunityOwnershipTransferEmail> | null
  previousOwnerEmailEnqueue: ReturnType<typeof enqueueSendCommunityOwnershipTransferEmail> | null
}

async function sendOwnershipTransferEmails(
  communityName: string,
  communitySlug: string,
  newOwnerId: string,
  previousOwnerId?: string,
): Promise<OwnershipTransferEmailEnqueues> {
  const communityUrl = getSiteUrl(`/communities/${communitySlug}`)
  const [newOwner, previousOwner] = await Promise.all([
    getPrivateUserByAny(newOwnerId),
    previousOwnerId ? getPrivateUserByAny(previousOwnerId) : Promise.resolve(null),
  ])

  return {
    newOwnerEmailEnqueue: newOwner
      ? enqueueOwnershipTransferEmail(newOwner, communityName, communityUrl, 'new_owner')
      : null,
    previousOwnerEmailEnqueue: previousOwner
      ? enqueueOwnershipTransferEmail(previousOwner, communityName, communityUrl, 'previous_owner')
      : null,
  }
}

function enqueueOwnershipTransferEmail(
  recipient: PrivateUser,
  communityName: string,
  communityUrl: string,
  recipientRole: 'new_owner' | 'previous_owner',
): ReturnType<typeof enqueueSendCommunityOwnershipTransferEmail> {
  return enqueueSendCommunityOwnershipTransferEmail(
    { userId: recipient.id, uiLocale: recipient.ui_locale ?? null },
    { communityName, communityUrl, recipientRole },
  )
}
