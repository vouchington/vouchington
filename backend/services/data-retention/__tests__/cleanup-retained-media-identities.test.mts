import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  hasTestRetainedImageIdentity,
  hasTestRetainedMediaBinding,
  pinTestRetainedMediaIdentity,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import {
  getImagePlacementDeliveryKey,
  reserveImagePlacementBinding,
} from '../../media-delivery-safety/index.mts'
import { recordImageDeliveryRepairMarker } from '../../media-delivery-safety/delivery-repair-markers.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupRetainedMediaBindings } from '../cleanup-retained-media-bindings.mts'

async function drainRetainedMediaCleanup(
  tuples: readonly { placementId: string; imageId: string }[],
): Promise<void> {
  await cleanupRetainedMediaBindings(
    1_000,
    tuples.map(tuple => tuple.placementId),
  )
  await cleanupRetainedIdentityRoots(1_000, { image: tuples.map(tuple => tuple.imageId) })
}

describe('retained media identity cleanup', () => {
  it('retains a never-live pair while a repair marker is pending, then reclaims pair before image', async () => {
    const tuple = { placementId: v7(), imageId: v7(), revision: 0 }
    await reserveImagePlacementBinding({ ...tuple, bindingFamily: 'surface' })
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    const edge = installTestMediaDeliveryEdge()
    await recordImageDeliveryRepairMarker(tuple)
    await drainRetainedMediaCleanup([tuple])
    expect(await hasTestRetainedMediaBinding(tuple.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(tuple.imageId)).toBe(true)
    expect(await getTestDeliveryRepairMarker(deliveryKey)).not.toBeNull()

    await reconcileTestDeliveryRepairMarker(deliveryKey)
    expect(edge.records.get(deliveryKey)?.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(deliveryKey)).toBeNull()
    await drainRetainedMediaCleanup([tuple])
    expect(await hasTestRetainedMediaBinding(tuple.placementId)).toBe(false)
    expect(await hasTestRetainedImageIdentity(tuple.imageId)).toBe(false)
  })

  it('preserves a live placement and a locked identity while reclaiming unrelated orphans', async () => {
    const live = await createTestDeliverySurface()
    const held = { placementId: v7(), imageId: v7(), bindingFamily: 'post' as const }
    const orphan = { placementId: v7(), imageId: v7(), bindingFamily: 'post' as const }
    const unselected = { placementId: v7(), imageId: v7(), bindingFamily: 'post' as const }
    await reserveImagePlacementBinding(held)
    await reserveImagePlacementBinding(orphan)
    await reserveImagePlacementBinding(unselected)
    await using pin = await beginTransaction()
    await pinTestRetainedMediaIdentity(pin, held.imageId, held.placementId)
    await drainRetainedMediaCleanup([live.tuple, held, orphan])
    expect(await hasTestRetainedMediaBinding(live.tuple.placementId)).toBe(true)
    expect(await hasTestRetainedMediaBinding(held.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(held.imageId)).toBe(true)
    expect(await hasTestRetainedMediaBinding(orphan.placementId)).toBe(false)
    expect(await hasTestRetainedMediaBinding(unselected.placementId)).toBe(true)
    await pin.commit()
    await drainRetainedMediaCleanup([live.tuple, held, orphan])
    expect(await hasTestRetainedMediaBinding(held.placementId)).toBe(false)
    expect(await hasTestRetainedImageIdentity(held.imageId)).toBe(false)
    expect(await hasTestRetainedMediaBinding(live.tuple.placementId)).toBe(true)
    await drainRetainedMediaCleanup([unselected])
    expect(await hasTestRetainedMediaBinding(unselected.placementId)).toBe(false)
  })
})
