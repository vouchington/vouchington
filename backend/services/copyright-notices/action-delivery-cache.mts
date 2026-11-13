import { invalidateRssSnapshotsForLegalRemoval } from '@services/entity-cache/rss-snapshot-generation'
import { write } from '@data-stores/psql'
import {
  invalidatePostStrict,
  invalidateUserStrict,
  invalidateTopicStrict,
  invalidateCommunityStrict,
} from '@services/entity-cache/invalidate-strict'
import { getImagePlacementCopyrightOwner } from '@services/images/placements'

export async function invalidateCopyrightPlacementCache(placementId: string): Promise<void> {
  const owner = await getImagePlacementCopyrightOwner(placementId, { query: write })
  if (!owner)
    throw new Error('Copyright placement owner unavailable after committed legal mutation')
  switch (owner.kind) {
    case 'post':
      await invalidateRssSnapshotsForLegalRemoval()
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
