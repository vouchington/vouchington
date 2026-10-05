import { afterEach, describe, expect, it, vi } from 'vitest'
import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import {
  clearTestRetainedBindingCleanupCursor,
  getTestRetainedBindingCleanupCursor,
} from '@voucha/test-helpers/entities/retained-binding-cleanup-cursor'
import { v7 } from 'uuid'
import {
  beginTransaction,
  hasTestRetainedImageIdentity,
  hasTestRetainedMediaBinding,
  pinTestRetainedMediaIdentity,
  seedTestRetainedMediaOrphan,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { getImagePlacementDeliveryKey } from '../../media-delivery-safety/index.mts'
import { recordImageDeliveryRepairMarker } from '../../media-delivery-safety/delivery-repair-markers.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupRetainedMediaBindings } from '../cleanup-retained-media-bindings.mts'
import { createCopyrightNoticeSchemaFixture } from '../../../test-helpers/data-stores/psql/copyright-notice-schema.mts'

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
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('initializes its own cursor and resumes deleted placement positions without advancing scoped calls', async () => {
    if (getIsolatedDatabaseCaseMode('retained-binding-cleanup-cursor') === 'parent') {
      await runIsolatedDatabaseCase('retained-binding-cleanup-cursor')
      return
    }
    await clearTestRetainedBindingCleanupCursor()
    const placements = [v7({ msecs: 0 }), v7({ msecs: 0 })].toSorted()
    for (const placementId of placements)
      await seedTestRetainedMediaOrphan({ placementId, imageId: v7(), bindingFamily: 'post' })
    expect(await getTestRetainedBindingCleanupCursor()).toBeUndefined()
    expect(await cleanupRetainedMediaBindings(1)).toMatchObject({
      scanned: 1,
      deleted: 1,
      hasMore: true,
    })
    expect(await getTestRetainedBindingCleanupCursor()).toBe(placements[0])
    await cleanupRetainedMediaBindings(1, [placements[1]!])
    expect(await getTestRetainedBindingCleanupCursor()).toBe(placements[0])
    await cleanupRetainedMediaBindings(1)
    expect(await getTestRetainedBindingCleanupCursor()).toBeNull()
    expect(await hasTestRetainedMediaBinding(placements[0]!)).toBe(false)
    expect(await hasTestRetainedMediaBinding(placements[1]!)).toBe(false)
  }, 240_000)
  it('preserves legal target placement and image identities without a live placement', async () => {
    const fixture = await createCopyrightNoticeSchemaFixture()
    await drainRetainedMediaCleanup([
      { placementId: fixture.placementId, imageId: fixture.imageId },
    ])
    expect(await hasTestRetainedMediaBinding(fixture.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(fixture.imageId)).toBe(true)
  })

  it('retains a committed pair through marker acknowledgement', async () => {
    const { tuple } = await createTestDeliverySurface()
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    const edge = installTestMediaDeliveryEdge()
    await recordImageDeliveryRepairMarker(tuple)
    await drainRetainedMediaCleanup([tuple])
    expect(await hasTestRetainedMediaBinding(tuple.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(tuple.imageId)).toBe(true)
    expect(await getTestDeliveryRepairMarker(deliveryKey)).not.toBeNull()

    await reconcileTestDeliveryRepairMarker(deliveryKey)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestDeliveryRepairMarker(deliveryKey)).toBeNull()
    await drainRetainedMediaCleanup([tuple])
    expect(await hasTestRetainedMediaBinding(tuple.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(tuple.imageId)).toBe(true)
  })

  it('preserves a live placement and a locked identity while reclaiming unrelated orphans', async () => {
    const live = await createTestDeliverySurface()
    const held = { placementId: v7(), imageId: v7(), bindingFamily: 'post' as const }
    const orphan = { placementId: v7(), imageId: v7(), bindingFamily: 'post' as const }
    const unselected = { placementId: v7(), imageId: v7(), bindingFamily: 'post' as const }
    await seedTestRetainedMediaOrphan(held)
    await seedTestRetainedMediaOrphan(orphan)
    await seedTestRetainedMediaOrphan(unselected)
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
