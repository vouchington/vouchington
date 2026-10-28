import { transferLockedCommunityOwnership } from './ownership-transfer-core.mts'
import { createOwnershipTransferNotifications } from './ownership-transfer-notifications.mts'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import { getActiveCommunityMembersForUsers } from './members/batch.mts'
import type { Community } from './types.mts'
import { lockCommunityRoleMutation } from './bans/lock.mts'
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
