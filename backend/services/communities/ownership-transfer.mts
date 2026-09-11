import { write, beginTransaction } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { getCommunity } from './get.mts'
import { getCommunityMember } from './members/get.mts'
import { lockCommunityUsers } from './bans/lock.mts'
import { getPrivateUserByAny } from '@services/users/get'
import { enqueueSendCommunityOwnershipTransferEmail } from '@queues/emails/enqueues'
import { getSiteUrl } from '@modules/utils'
import {
  createCommunityLifecycleNotification,
  enqueueCommunityLifecycleNotificationPush,
} from '@services/notifications'

export async function transferCommunityOwnershipWithOptions(
  communityId: string,
  fromUserId: string,
  toUserId: string,
  options: QueryOptions,
): Promise<{ demotedUpdatedAt: Date; promotedUpdatedAt: Date }> {
  await lockCommunityUsers(communityId, [fromUserId, toUserId], options)

  // Swap roles atomically in one statement: if either precondition fails, neither update commits.
  const { rows } = await write(
    sql`/* transferCommunityOwnership */
    WITH demote AS (
      UPDATE community_members
      SET role = 'moderator'
      WHERE community_id = ${communityId}
        AND user_id = ${fromUserId}
        AND role = 'owner'
        AND removed_at IS NULL
      RETURNING updated_at
    ),
    promote AS (
      UPDATE community_members
      SET role = 'owner'
      WHERE community_id = ${communityId}
        AND user_id = ${toUserId}
        AND role = 'moderator'
        AND removed_at IS NULL
        AND (SELECT COUNT(*) FROM demote) > 0
      RETURNING updated_at
    )
    SELECT
      (SELECT COUNT(*) FROM demote)::int AS demoted,
      (SELECT COUNT(*) FROM promote)::int AS promoted,
      (SELECT updated_at FROM demote) AS demoted_updated_at,
      (SELECT updated_at FROM promote) AS promoted_updated_at
    `,
    options,
  )
  const { demoted, promoted, demoted_updated_at, promoted_updated_at } = rows[0] as {
    demoted: number
    promoted: number
    demoted_updated_at: Date | null
    promoted_updated_at: Date | null
  }
  if (demoted === 0) throw createHttpError(409, 'Community ownership changed concurrently')
  if (promoted === 0) throw createHttpError(422, 'Target user is no longer an eligible moderator')
  assert(demoted_updated_at && promoted_updated_at, 500, 'Ownership transition timestamps missing')
  return { demotedUpdatedAt: demoted_updated_at, promotedUpdatedAt: promoted_updated_at }
}

/**
 * Allows an owner to voluntarily transfer ownership to a moderator.
 * The target must be an active moderator of the community.
 */
export async function initiateOwnershipTransfer(
  currentUserId: string,
  communityId: string,
  targetUserId: string,
): Promise<void> {
  assert(currentUserId !== targetUserId, 422, 'You cannot transfer ownership to yourself')
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  await using query = await beginTransaction()
  const opts = { query }

  await lockCommunityUsers(communityId, [currentUserId, targetUserId], opts)

  const [currentMember, targetMember] = await Promise.all([
    getCommunityMember(communityId, currentUserId, opts),
    getCommunityMember(communityId, targetUserId, opts),
  ])

  assert(currentMember?.role === 'owner', 403, 'Only owners can transfer ownership')
  assert(targetMember, 404, 'Target user is not a member of this community')
  assert(targetMember.role === 'moderator', 422, 'Ownership can only be transferred to a moderator')

  const transition = await transferCommunityOwnershipWithOptions(
    communityId,
    currentUserId,
    targetUserId,
    opts,
  )
  const transitionId = `${transition.demotedUpdatedAt.toISOString()}:${transition.promotedUpdatedAt.toISOString()}`
  const notifications = await Promise.all([
    createCommunityLifecycleNotification(
      {
        userId: targetUserId,
        communityId,
        entityType: 'community_ownership_transfer',
        eventKey: `community-ownership-transfer:${transitionId}:new-owner`,
        title: `You now own ${community.name}`,
        body: `Ownership of ${community.name} was transferred to you.`,
      },
      opts,
    ),
    createCommunityLifecycleNotification(
      {
        userId: currentUserId,
        communityId,
        entityType: 'community_ownership_transfer',
        eventKey: `community-ownership-transfer:${transitionId}:previous-owner`,
        title: `Ownership of ${community.name} was transferred`,
        body: `You transferred ownership of ${community.name}.`,
      },
      opts,
    ),
  ])

  await query.commit()

  const pushNotifications = notifications.filter(notification => notification !== null)
  if (pushNotifications.length > 0) {
    await enqueueCommunityLifecycleNotificationPush(pushNotifications)
  }

  await sendOwnershipTransferEmails(community.name, community.slug, targetUserId, currentUserId)
}

async function sendOwnershipTransferEmails(
  communityName: string,
  communitySlug: string,
  newOwnerId: string,
  previousOwnerId: string,
): Promise<void> {
  const communityUrl = getSiteUrl(`/communities/${communitySlug}`)
  const [newOwner, previousOwner] = await Promise.all([
    getPrivateUserByAny(newOwnerId),
    getPrivateUserByAny(previousOwnerId),
  ])

  if (newOwner) {
    void enqueueSendCommunityOwnershipTransferEmail(
      {
        userId: newOwner.id,
        uiLocale: newOwner.ui_locale ?? null,
      },
      { communityName, communityUrl, recipientRole: 'new_owner' },
    )
  }
  if (previousOwner) {
    void enqueueSendCommunityOwnershipTransferEmail(
      {
        userId: previousOwner.id,
        uiLocale: previousOwner.ui_locale ?? null,
      },
      { communityName, communityUrl, recipientRole: 'previous_owner' },
    )
  }
}
