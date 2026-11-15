import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { mediaDeliverySafetyWorkConfig } from './work-limits.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'
import * as mediaDeliveryRegistryProvider from '@modules/aws/media-delivery-registry'
import {
  advanceTestDeliveryPlacementRevision,
  getTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import {
  beginTransaction,
  getTestMediaDeliveryRecord,
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  repairFailedImageDeliveryMutation,
  reconcileMediaDeliveryRepairMarkers,
  processMediaDeliveryRegistryRecord,
  prepublishImagePlacementDenial,
  stageImagePlacementDeliveryRecord,
} from './index.mts'

describe('media delivery rollback recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('repairs an owned surface marker without consuming an unrelated durable marker', async () => {
    const user = await createTestUserDirect()
    const neighbor = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const neighborImageId = await insertTestImage(neighbor.id)
    await setTestUserProfileImage(user.id, imageId)
    await setTestUserProfileImage(neighbor.id, neighborImageId)
    const [surface] = await getTestImageSurfacePlacements({ userId: user.id })
    const [neighborSurface] = await getTestImageSurfacePlacements({ userId: neighbor.id })
    if (!surface || !neighborSurface) throw new Error('surface placement disappeared')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-delivery-registry')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    const put = vi
      .spyOn(mediaDeliveryRegistryProvider, 'putMediaDeliveryRegistryRecord')
      .mockResolvedValue({ $metadata: {} })
    vi.spyOn(mediaDeliveryRegistryProvider, 'invalidateMediaDeliveryPath').mockResolvedValue({
      $metadata: {},
    })
    const records = []
    for (const [placement, assetId] of [
      [surface, imageId],
      [neighborSurface, neighborImageId],
    ] as const) {
      const input = {
        placementId: placement.placement_id,
        revision: placement.placement_revision,
        imageId: assetId,
      }
      const record = await stageImagePlacementDeliveryRecord({ ...input, state: 'allow' })
      await processMediaDeliveryRegistryRecord(record.mediaDeliveryRegistryRecordId)
      {
        await using transaction = await beginTransaction()
        await prepublishImagePlacementDenial(input, { query: transaction })
      }
      records.push(record)
    }
    put.mockClear()
    await repairFailedImageDeliveryMutation(
      { imageIds: [imageId] },
      records.map(record => record.mediaDeliveryRegistryRecordId),
    )
    await expect(
      getTestDeliveryRepairMarker(records[0]!.mediaDeliveryRegistryRecordId),
    ).resolves.toBeNull()
    await expect(
      getTestDeliveryRepairMarker(records[1]!.mediaDeliveryRegistryRecordId),
    ).resolves.toEqual(expect.any(String))
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: getImagePlacementDeliveryKey({
          placementId: surface.placement_id,
          revision: surface.placement_revision,
          imageId,
        }),
        state: 'allow',
      }),
    )
  })

  it('leaves overflow history durable and finishes withholding it on the next bounded repair pass', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, { recovery_page_size: 1 }),
    )
    const historical = await createTestDeliverySurface()
    const unrelated = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    let revision: number
    {
      await using query = await beginTransaction()
      revision = await advanceTestDeliveryPlacementRevision(query, historical.tuple.placementId)
      await query.commit()
    }
    const currentTuple = { ...historical.tuple, revision }
    const current = await stageImagePlacementDeliveryRecord({ ...currentTuple, state: 'allow' })
    {
      await using query = await beginTransaction()
      await advanceTestDeliveryPlacementRevision(query, historical.tuple.placementId)
      await query.commit()
    }
    const owned = [historical.mediaDeliveryRegistryRecordId, current.mediaDeliveryRegistryRecordId]
    await recordImageDeliveryRepairMarker(historical.tuple)
    await recordImageDeliveryRepairMarker(currentTuple)
    await recordImageDeliveryRepairMarker(unrelated.tuple)
    const unrelatedToken = await getTestDeliveryRepairMarker(
      unrelated.mediaDeliveryRegistryRecordId,
    )

    await repairFailedImageDeliveryMutation({ imageIds: [historical.tuple.imageId] }, owned)
    expect(await getTestDeliveryRepairMarker(historical.mediaDeliveryRegistryRecordId)).toBeNull()
    expect(await getTestDeliveryRepairMarker(current.mediaDeliveryRegistryRecordId)).not.toBeNull()
    expect(
      await getTestMediaDeliveryRecord(historical.mediaDeliveryRegistryRecordId),
    ).toMatchObject({
      desired_state: 'withheld',
    })
    expect(await reconcileMediaDeliveryRepairMarkers(1, owned)).toBe(1)
    await processMediaDeliveryRegistryRecord(current.mediaDeliveryRegistryRecordId)
    expect(await getTestDeliveryRepairMarker(current.mediaDeliveryRegistryRecordId)).toBeNull()
    expect(await getTestMediaDeliveryRecord(current.mediaDeliveryRegistryRecordId)).toMatchObject({
      desired_state: 'withheld',
    })
    expect(edge.records.get(getImagePlacementDeliveryKey(currentTuple))?.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(unrelated.mediaDeliveryRegistryRecordId)).toBe(
      unrelatedToken,
    )
    expect(await reconcileMediaDeliveryRepairMarkers(1, owned)).toBe(0)
  })
})
