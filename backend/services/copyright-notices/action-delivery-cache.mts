import { beginTransaction } from '@data-stores/psql'
import {
  invalidatePostStrict,
  invalidateUserStrict,
  invalidateTopicStrict,
  invalidateCommunityStrict,
} from '@services/entity-cache/invalidate-strict'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'

export async function invalidateCopyrightPlacementCache(
  placementId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
  dependencies: CopyrightActionDeliveryDependencies,
): Promise<void> {
  const owner = await dependencies.getImagePlacementCopyrightOwner(placementId, { query })
  if (!owner) return
  switch (owner.kind) {
    case 'post':
      await invalidatePostStrict(owner.id)
      break
    case 'user':
      await invalidateUserStrict(owner.id)
      break
    case 'topic':
      await invalidateTopicStrict(owner.id)
      break
    case 'community':
      await invalidateCommunityStrict(owner.id)
      break
  }
}
