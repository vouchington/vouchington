import { beginTransaction } from '@data-stores/psql'
import * as provider from '@modules/aws/media-delivery-registry'
import {
  getTestMediaDeliveryRecord,
  insertTestImage,
  markImageModerationFlagged,
  setImageOpenAIModerationResults,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge as enableEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestDeliverySurface as createSurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getImagePlacementDeliveryKey,
  getLegacyImageDeliveryKey,
  lockImageDeliveryMutation,
  processMediaDeliveryRegistryRecord,
  publishImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
  reconcileMediaDeliveryRepairMarkers,
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
} from './index.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'
import { syncImageSurfacePlacement } from '../images/surface-placements.mts'

describe('delivery authority and durable denial repair', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('repairs a provider-accepted denial after its owner rolls back without compensation', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    const initial = edge.records.get(fixture.deliveryKey)!
    {
      await using transaction = await beginTransaction()
      await publishImagePlacementDeliveryRecord(
        { ...fixture.tuple, state: 'withheld' },
        { query: transaction },
      )
      // Disposal simulates losing the owner before commit; no compensation is invoked.
    }
    const leaked = edge.records.get(fixture.deliveryKey)!
    expect(leaked.state).toBe('withheld')
    expect(BigInt(leaked.generation)).toBeGreaterThan(BigInt(initial.generation))
    expect(await getTestDeliveryRepairMarker(fixture.deliveryKey)).not.toBeNull()
    await reconcileTestDeliveryRepairMarker(fixture.deliveryKey)
    expect(await getTestDeliveryRepairMarker(fixture.deliveryKey)).toBeNull()
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    const repaired = edge.records.get(fixture.deliveryKey)!
    expect(repaired.state).toBe('allow')
    expect(BigInt(repaired.generation)).toBeGreaterThan(BigInt(leaked.generation))
  })

  it('keeps a committed retirement denied after marker repair without recreating the marker', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    await using transaction = await beginTransaction()
    await syncImageSurfacePlacement(
      { surfaceKind: 'user-profile-image', userId: fixture.userId },
      null,
      transaction,
    )
    await transaction.commit()
    await reconcileTestDeliveryRepairMarker(fixture.deliveryKey)
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(fixture.deliveryKey)).toBeNull()
  })

  it('denies a never-committed intermediate tuple without an FK-backed outbox row', async () => {
    const tuple = { placementId: crypto.randomUUID(), revision: 0, imageId: crypto.randomUUID() }
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    await reconcileTestDeliveryRepairMarker(deliveryKey)
    expect(edge.records.get(deliveryKey)?.state).toBe('withheld')
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toBeNull()
    expect(await getTestDeliveryRepairMarker(deliveryKey)).toBeNull()
  })

  it('preserves a newer repair marker when an observed token is consumed', async () => {
    const tuple = { placementId: crypto.randomUUID(), revision: 0, imageId: crypto.randomUUID() }
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    const observed = await getTestDeliveryRepairMarker(deliveryKey)
    edge.put.mockImplementationOnce(async input => {
      edge.accept(input)
      await recordImageDeliveryRepairMarker(tuple)
      return { $metadata: {} }
    })
    await reconcileTestDeliveryRepairMarker(deliveryKey)
    const newer = await getTestDeliveryRepairMarker(deliveryKey)
    expect(newer).not.toBeNull()
    expect(newer).not.toBe(observed)
    await reconcileTestDeliveryRepairMarker(deliveryKey)
    expect(await getTestDeliveryRepairMarker(deliveryKey)).toBeNull()
  })

  it('does not serialize unrelated surface placements through a null post identity', async () => {
    const [a, b] = await Promise.all([createSurface(), createSurface()])
    await using first = await beginTransaction()
    await using second = await beginTransaction()
    await lockImageDeliveryMutation(first, { imageIds: [a.tuple.imageId] })
    let result: PromiseSettledResult<void> | undefined
    const locking = lockImageDeliveryMutation(second, { imageIds: [b.tuple.imageId] }).then(
      value => {
        result = { status: 'fulfilled', value }
        return value
      },
      reason => {
        result = { status: 'rejected', reason }
      },
    )
    try {
      await vi.waitFor(() => expect(result).toBeDefined())
      if (result?.status === 'rejected') throw result.reason
      await second.commit()
    } finally {
      await first.rollback()
      await locking
    }
  })

  it('drains no markers when the bounded sweep limit is zero', async () => {
    const tuple = { placementId: crypto.randomUUID(), revision: 0, imageId: crypto.randomUUID() }
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    const token = await getTestDeliveryRepairMarker(deliveryKey)
    await expect(reconcileMediaDeliveryRepairMarkers(0)).resolves.toBe(0)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestDeliveryRepairMarker(deliveryKey)).toBe(token)
  })

  it('refuses a legacy allow when the asset belongs to an active surface', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    const deliveryKey = getLegacyImageDeliveryKey(fixture.tuple.imageId)
    await stageLegacyImageDeliveryRecord(fixture.tuple.imageId, 'allow')
    await processMediaDeliveryRegistryRecord(deliveryKey)
    expect(edge.records.get(deliveryKey)?.state).toBe('withheld')
  })

  it('repairs an unauthorized allow denial accepted before invalidation fails and authority recovers', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    await markImageModerationFlagged(fixture.tuple.imageId)
    edge.invalidatePath.mockRejectedValueOnce(new Error('invalidation outage'))
    await expect(publishStagedMediaDeliveryRecord(fixture.deliveryKey)).rejects.toThrow(
      'invalidation outage',
    )
    const leaked = edge.records.get(fixture.deliveryKey)!
    expect(leaked.state).toBe('withheld')
    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      desired_state: 'allow',
    })
    await setImageOpenAIModerationResults(fixture.tuple.imageId, [], false)
    await reconcileTestDeliveryRepairMarker(fixture.deliveryKey)
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    const repaired = edge.records.get(fixture.deliveryKey)!
    expect(repaired.state).toBe('allow')
    expect(BigInt(repaired.generation)).toBeGreaterThan(BigInt(leaked.generation))
    expect(await getTestDeliveryRepairMarker(fixture.deliveryKey)).toBeNull()
  })

  it('repairs A to B to C replacement rollback without FK-blocking the never-committed B tuple', async () => {
    const fixture = await createSurface()
    const [imageB, imageC] = await Promise.all([
      insertTestImage(fixture.userId),
      insertTestImage(fixture.userId),
    ])
    const edge = enableEdge()
    let intermediateKey = ''
    {
      await using transaction = await beginTransaction()
      const b = await syncImageSurfacePlacement(
        { surfaceKind: 'user-profile-image', userId: fixture.userId },
        imageB,
        transaction,
      )
      if (!b) throw new Error('Intermediate tuple missing')
      intermediateKey = getImagePlacementDeliveryKey({
        placementId: b.placement_id,
        revision: b.placement_revision,
        imageId: imageB,
      })
      await syncImageSurfacePlacement(
        { surfaceKind: 'user-profile-image', userId: fixture.userId },
        imageC,
        transaction,
      )
    }
    expect(edge.records.get(intermediateKey)?.state).toBe('withheld')
    expect(await getTestMediaDeliveryRecord(intermediateKey)).toBeNull()
    await reconcileTestDeliveryRepairMarker(fixture.deliveryKey)
    await reconcileTestDeliveryRepairMarker(intermediateKey)
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('allow')
    expect(edge.records.get(intermediateKey)?.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(intermediateKey)).toBeNull()
  })

  it('revalidates a captured allow after a newer denial commits', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    const captured = await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    await using transaction = await beginTransaction()
    await syncImageSurfacePlacement(
      { surfaceKind: 'user-profile-image', userId: fixture.userId },
      null,
      transaction,
    )
    await transaction.commit()
    const denied = edge.records.get(fixture.deliveryKey)!
    expect(BigInt(denied.generation)).toBeGreaterThan(BigInt(captured.generation))
    await publishStagedMediaDeliveryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('withheld')
    await expect(
      provider.putMediaDeliveryRegistryRecord({
        deliveryKey: fixture.deliveryKey,
        state: 'allow',
        generation: captured.generation,
      }),
    ).rejects.toThrow('Stale edge generation')
    await expect(
      provider.putMediaDeliveryRegistryRecord({ ...denied, state: 'allow' }),
    ).rejects.toThrow('Stale edge generation')
    await expect(provider.putMediaDeliveryRegistryRecord(denied)).resolves.toBeDefined()
  })
})
