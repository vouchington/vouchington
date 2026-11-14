import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import {
  invalidatePostStrict,
  invalidateUserStrict,
  invalidateTopicStrict,
  invalidateCommunityStrict,
} from '@services/entity-cache/invalidate-strict'
import { purgeLegalRemovalSurfaces } from '@services/entity-cache/legal-removal'
import { getImagePlacementCopyrightOwner } from '@services/images/placements'

/**
 * The single copyright legal-removal cache hook. Callers run it after the placement's public
 * projection change has committed and before committing the intent outcome, so that commit is
 * the eviction receipt and a failure leaves the intent owed. A restore denial removes the
 * placement again, so its callers pass `action: 'withhold'`.
 */
export async function invalidateCopyrightLegalRemovalSurfaces(
  legal: { placement_id: string; action: 'withhold' | 'restore' },
  query: QueryExecutor = write,
): Promise<void> {
  await invalidateCopyrightPlacementCache(legal.placement_id, query)
  if (legal.action === 'withhold') await purgeLegalRemovalSurfaces()
}

async function invalidateCopyrightPlacementCache(
  placementId: string,
  query: QueryExecutor,
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
