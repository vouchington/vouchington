import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTestRetainedBindingCleanupCursor } from '@voucha/test-helpers/entities/retained-binding-cleanup-cursor'
import { withTestRetainedBindingCleanupCursor } from '@voucha/test-helpers/retained-binding-cleanup-fixtures'
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

  it('rejects a placement id list and a cursor page together', async () => {
    const id = v7()
    await expect(cleanupRetainedMediaBindings(1, [id], [id])).rejects.toThrow(
      'Retained media cleanup accepts ids or a cursor page, not both',
    )
  })

  it('initializes its own cursor and resumes deleted placement positions without advancing scoped calls', async () => {
    await withTestRetainedBindingCleanupCursor(async query => {
      expect(await getTestRetainedBindingCleanupCursor(query)).toBeUndefined()
      const placements = [v7({ msecs: 0 }), v7({ msecs: 0 })].toSorted()
      const foreignId = v7()
      for (const placementId of placements)
        await seedTestRetainedMediaOrphan(
          { placementId, imageId: v7(), bindingFamily: 'post' },
          query,
        )
      await seedTestRetainedMediaOrphan(
        { placementId: foreignId, imageId: v7(), bindingFamily: 'post' },
        query,
      )
      expect(await cleanupRetainedMediaBindings(1, undefined, placements, query)).toMatchObject({
        scanned: 1,
        deleted: 1,
        hasMore: true,
      })
      expect(await getTestRetainedBindingCleanupCursor(query)).toBe(placements[0])
      await cleanupRetainedMediaBindings(1, [placements[1]!], undefined, query)
      expect(await getTestRetainedBindingCleanupCursor(query)).toBe(placements[0])
      expect(await cleanupRetainedMediaBindings(1, undefined, placements, query)).toMatchObject({
        scanned: 0,
        deleted: 0,
        hasMore: false,
      })
      expect(await getTestRetainedBindingCleanupCursor(query)).toBeNull()
      expect(await hasTestRetainedMediaBinding(placements[0]!, query)).toBe(false)
      expect(await hasTestRetainedMediaBinding(placements[1]!, query)).toBe(false)
      expect(await hasTestRetainedMediaBinding(foreignId, query)).toBe(true)
    })
  })
  it('preserves legal target placement and image identities without a live placement', async () => {
    const fixture = await createCopyrightNoticeSchemaFixture()
    await drainRetainedMediaCleanup([
      { placementId: fixture.placementId, imageId: fixture.imageId },
    ])
    expect(await hasTestRetainedMediaBinding(fixture.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(fixture.imageId)).toBe(true)
  })

  it('retains a committed pair through marker acknowledgement', async () => {
    const { tuple, mediaDeliveryRegistryRecordId } = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    await recordImageDeliveryRepairMarker(tuple)
    await drainRetainedMediaCleanup([tuple])
    expect(await hasTestRetainedMediaBinding(tuple.placementId)).toBe(true)
    expect(await hasTestRetainedImageIdentity(tuple.imageId)).toBe(true)
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).not.toBeNull()

    await reconcileTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).toBeNull()
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
