import type { QueryOptions } from '@data-stores/psql/types'
import { createCommunityLifecycleNotifications } from '@services/notifications'
import type { Community } from './types.mts'

type CommunityLifecycleNotificationInput = Parameters<
  typeof createCommunityLifecycleNotifications
>[0][number]

export function createOwnershipTransferNotifications(
  community: Pick<Community, 'id'>,
  toUserId: string,
  transition: { demotedUpdatedAt: Date; promotedUpdatedAt: Date },
  options: QueryOptions,
  fromUserId?: string,
) {
  return createCommunityLifecycleNotifications(
    buildOwnershipTransferNotifications(community, toUserId, transition, fromUserId),
    options,
  )
}

/** Pure inputs, so a page of transfers can be inserted by one batched statement. */
export function buildOwnershipTransferNotifications(
  community: Pick<Community, 'id'>,
  toUserId: string,
  transition: { demotedUpdatedAt: Date; promotedUpdatedAt: Date },
  fromUserId?: string,
): CommunityLifecycleNotificationInput[] {
  const transitionId = `${transition.demotedUpdatedAt.toISOString()}:${transition.promotedUpdatedAt.toISOString()}`
  const successor = {
    userId: toUserId,
    communityId: community.id,
    kind: 'community_ownership_received' as const,
    eventKey: `community-ownership-transfer:${community.id}:${transitionId}:new-owner`,
  }
  return [
    successor,
    ...(fromUserId
      ? [
          {
            userId: fromUserId,
            communityId: community.id,
            kind: 'community_ownership_transferred_away' as const,
            eventKey: `community-ownership-transfer:${community.id}:${transitionId}:previous-owner`,
          },
        ]
      : []),
  ]
}
