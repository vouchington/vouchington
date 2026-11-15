import { afterEach, describe, expect, it, vi } from 'vitest'
import * as mediaDeliveryRegistryProvider from '@modules/aws/media-delivery-registry'
import { getTestDeliveryRepairMarker } from '@voucha/test-helpers/entities/media-delivery-repair'
import {
  beginTransaction,
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  repairFailedImageDeliveryMutation,
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
    await repairFailedImageDeliveryMutation({ imageIds: [imageId] })
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
})
