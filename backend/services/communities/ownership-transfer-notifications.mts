import type { QueryOptions } from '@data-stores/psql/types'
import { createCommunityLifecycleNotifications } from '@services/notifications'
import type { Community } from './types.mts'

export function createOwnershipTransferNotifications(
  community: Pick<Community, 'id' | 'name'>,
  toUserId: string,
  transition: { demotedUpdatedAt: Date; promotedUpdatedAt: Date },
  options: QueryOptions,
  fromUserId?: string,
) {
  const transitionId = `${transition.demotedUpdatedAt.toISOString()}:${transition.promotedUpdatedAt.toISOString()}`
  const successor = {
    userId: toUserId,
    communityId: community.id,
    entityType: 'community_ownership_transfer' as const,
    eventKey: `community-ownership-transfer:${community.id}:${transitionId}:new-owner`,
    title: `You now own ${community.name}`,
    body: `Ownership of ${community.name} was transferred to you.`,
  }
  return createCommunityLifecycleNotifications(
    [
      successor,
      ...(fromUserId
        ? [
            {
              userId: fromUserId,
              communityId: community.id,
              entityType: 'community_ownership_transfer' as const,
              eventKey: `community-ownership-transfer:${community.id}:${transitionId}:previous-owner`,
              title: `Ownership of ${community.name} was transferred`,
              body: `You transferred ownership of ${community.name}.`,
            },
          ]
        : []),
    ],
    options,
  )
}
