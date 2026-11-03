import { beginTransaction } from '@data-stores/psql'
import {
  invalidatePostStrict,
  invalidateUserStrict,
  invalidateTopicStrict,
  invalidateCommunityStrict,
} from '@services/entity-cache/invalidate-strict'
import { getImagePlacementCopyrightOwner } from '@services/images/placements'

export async function invalidateCopyrightPlacementCache(
  placementId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const owner = await getImagePlacementCopyrightOwner(placementId, { query })
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
