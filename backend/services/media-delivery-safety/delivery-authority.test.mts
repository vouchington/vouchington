import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import * as provider from '@modules/aws/media-delivery-registry'
import {
  beginTransaction,
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
  lockImageDeliveryMutation,
  lockImageAssetAdmission,
  processMediaDeliveryRegistryRecord,
  prepublishImagePlacementDenial,
  publishStagedMediaDeliveryRecord,
  reconcileMediaDeliveryRepairMarkers,
  stageImagePlacementDeliveryRecord,
  ensureImagePlacementBinding,
} from './index.mts'
import {
  recordImageDeliveryRepairMarker,
  reconcileDeliveryRepairMarker,
} from './delivery-repair-markers.mts'
import { syncImageSurfacePlacement } from './surface-placement-sync.mts'

describe('delivery authority and durable denial repair', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rejects a conflicting retained binding in the owner transaction', async () => {
    const { tuple } = await createSurface()
    const otherImageId = (await createSurface()).tuple.imageId
    await using query = await beginTransaction()
    await expect(
      ensureImagePlacementBinding(query, {
        ...tuple,
        imageId: otherImageId,
        bindingFamily: 'surface',
      }),
    ).rejects.toThrow('already bound')
    await expect(
      ensureImagePlacementBinding(query, { ...tuple, bindingFamily: 'post' }),
    ).rejects.toThrow('already bound')
    await expect(
      ensureImagePlacementBinding(query, { ...tuple, bindingFamily: 'surface' }),
    ).resolves.toBeUndefined()
  })

  it('does not persist a marker without a committed registry parent', async () => {
    const tuple = {
      placementId: crypto.randomUUID(),
      revision: 0,
      imageId: crypto.randomUUID(),
    }
    await recordImageDeliveryRepairMarker(tuple)
    expect(await getTestDeliveryRepairMarker(crypto.randomUUID())).toBeNull()
  })

  it('repairs a provider-accepted denial after its owner rolls back without compensation', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    await processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId)
    const initial = edge.records.get(fixture.deliveryKey)!
    {
      await using transaction = await beginTransaction()
      await prepublishImagePlacementDenial({ ...fixture.tuple }, { query: transaction })
    }
    const leaked = edge.records.get(fixture.deliveryKey)!
    expect(leaked.state).toBe('withheld')
    expect(BigInt(leaked.generation)).toBeGreaterThan(BigInt(initial.generation))
    expect(await getTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)).not.toBeNull()
    await reconcileTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)
    expect(await getTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)).toBeNull()
    await processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId)
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
      null,
      transaction,
    )
    await transaction.commit()
    await reconcileTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)
    await processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId)
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)).toBeNull()
  })

  it('does not persist or publish a never-committed repair tuple', async () => {
    const tuple = { placementId: crypto.randomUUID(), revision: 0, imageId: crypto.randomUUID() }
    const mediaDeliveryRegistryRecordId = crypto.randomUUID()
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)).toBeNull()
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).toBeNull()
  })

  it('preserves a newer repair marker when an observed token is consumed', async () => {
    const { tuple, mediaDeliveryRegistryRecordId } = await createSurface()
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    const observed = await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    if (!observed) throw new Error('Committed repair marker missing')
    await recordImageDeliveryRepairMarker(tuple)
    await reconcileDeliveryRepairMarker({
      media_delivery_registry_record_id: mediaDeliveryRegistryRecordId,
      marker_token: observed,
    })
    const newer = await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    expect(newer).not.toBeNull()
    expect(newer).not.toBe(observed)
    expect(edge.put).not.toHaveBeenCalled()
    await reconcileTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).toBeNull()
  })

  it('does not serialize unrelated surface placements through a null post identity', async () => {
    const [a, b] = await Promise.all([createSurface(), createSurface()])
    await using first = await beginTransaction()
    await using second = await beginTransaction()
    await lockImageDeliveryMutation(first, { imageIds: [a.tuple.imageId] })
    try {
      await expect(
        lockImageDeliveryMutation(second, { imageIds: [b.tuple.imageId] }),
      ).resolves.toBeUndefined()
      await second.commit()
    } finally {
      await first.rollback()
    }
  })

  it('drains no markers when the bounded sweep limit is zero', async () => {
    const { tuple, mediaDeliveryRegistryRecordId } = await createSurface()
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    const token = await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    await expect(
      reconcileMediaDeliveryRepairMarkers(0, [mediaDeliveryRegistryRecordId]),
    ).resolves.toBe(0)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).toBe(token)
  })

  it('consumes only an owned repair marker and preserves the unrelated token', async () => {
    const [selected, unrelated] = await Promise.all([createSurface(), createSurface()])
    const selectedKey = selected.mediaDeliveryRegistryRecordId
    const unrelatedKey = unrelated.mediaDeliveryRegistryRecordId
    enableEdge()
    await Promise.all([
      recordImageDeliveryRepairMarker(selected.tuple),
      recordImageDeliveryRepairMarker(unrelated.tuple),
    ])
    const unrelatedToken = await getTestDeliveryRepairMarker(unrelatedKey)
    expect(unrelatedToken).not.toBeNull()
    expect(await reconcileMediaDeliveryRepairMarkers(10, [selectedKey])).toBe(1)
    expect(await getTestDeliveryRepairMarker(selectedKey)).toBeNull()
    expect(await getTestDeliveryRepairMarker(unrelatedKey)).toBe(unrelatedToken)
    await reconcileTestDeliveryRepairMarker(unrelatedKey)
  })

  it('retains a committed repair marker while publication is disabled', async () => {
    const { tuple, deliveryKey, mediaDeliveryRegistryRecordId } = await createSurface()
    const edge = enableEdge()
    await recordImageDeliveryRepairMarker(tuple)
    const token = await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'false')
    await reconcileTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    await expect(
      reconcileMediaDeliveryRepairMarkers(1, [mediaDeliveryRegistryRecordId]),
    ).resolves.toBe(0)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).toBe(token)
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    await reconcileTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)
    await processMediaDeliveryRegistryRecord(mediaDeliveryRegistryRecordId)
    expect(edge.records.get(deliveryKey)?.state).toBe('allow')
    expect(await getTestDeliveryRepairMarker(mediaDeliveryRegistryRecordId)).toBeNull()
  })

  it('repairs an unauthorized allow denial accepted before invalidation fails and authority recovers', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    await markImageModerationFlagged(fixture.tuple.imageId)
    edge.invalidatePath.mockRejectedValueOnce(new Error('invalidation outage'))
    await expect(
      publishStagedMediaDeliveryRecord(fixture.mediaDeliveryRegistryRecordId),
    ).rejects.toThrow('invalidation outage')
    const leaked = edge.records.get(fixture.deliveryKey)!
    expect(leaked.state).toBe('withheld')
    expect(await getTestMediaDeliveryRecord(fixture.mediaDeliveryRegistryRecordId)).toMatchObject({
      desired_state: 'allow',
    })
    await setImageOpenAIModerationResults(fixture.tuple.imageId, [], false)
    await reconcileTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)
    await processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId)
    const repaired = edge.records.get(fixture.deliveryKey)!
    expect(repaired.state).toBe('allow')
    expect(BigInt(repaired.generation)).toBeGreaterThan(BigInt(leaked.generation))
    expect(await getTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)).toBeNull()
  })

  it('repairs A to B to C replacement rollback without persisting a never-committed B wakeup', async () => {
    const fixture = await createSurface()
    const [imageB, imageC] = await Promise.all([
      insertTestImage(fixture.userId),
      insertTestImage(fixture.userId),
    ])
    const edge = enableEdge()
    let intermediateKey = ''
    let intermediateId = ''
    {
      await using transaction = await beginTransaction()
      await lockImageAssetAdmission([imageB, imageC], transaction)
      const b = await syncImageSurfacePlacement(
        { surfaceKind: 'user-profile-image', userId: fixture.userId },
        imageB,
        fixture.userId,
        transaction,
      )
      if (!b) throw new Error('Intermediate tuple missing')
      intermediateKey = getImagePlacementDeliveryKey({
        placementId: b.placement_id,
        revision: b.placement_revision,
        imageId: imageB,
      })
      intermediateId = (
        await stageImagePlacementDeliveryRecord(
          {
            placementId: b.placement_id,
            revision: b.placement_revision,
            imageId: imageB,
            state: 'allow',
          },
          { query: transaction },
        )
      ).mediaDeliveryRegistryRecordId
      await syncImageSurfacePlacement(
        { surfaceKind: 'user-profile-image', userId: fixture.userId },
        imageC,
        fixture.userId,
        transaction,
      )
    }
    expect(edge.records.get(intermediateKey)?.state).toBe('withheld')
    expect(await getTestMediaDeliveryRecord(intermediateId)).toBeNull()
    expect(await getTestDeliveryRepairMarker(intermediateId)).toBeNull()
    await reconcileTestDeliveryRepairMarker(fixture.mediaDeliveryRegistryRecordId)
    await processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId)
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('allow')
    expect(edge.records.get(intermediateKey)?.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(intermediateId)).toBeNull()
  })

  it('revalidates a captured allow after a newer denial commits', async () => {
    const fixture = await createSurface()
    const edge = enableEdge()
    const captured = await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    await using transaction = await beginTransaction()
    await syncImageSurfacePlacement(
      { surfaceKind: 'user-profile-image', userId: fixture.userId },
      null,
      null,
      transaction,
    )
    await transaction.commit()
    const denied = edge.records.get(fixture.deliveryKey)!
    expect(BigInt(denied.generation)).toBeGreaterThan(BigInt(captured.generation))
    await publishStagedMediaDeliveryRecord(fixture.mediaDeliveryRegistryRecordId)
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
