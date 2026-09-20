import { afterEach, describe, expect, it, vi } from 'vitest'
import * as mediaDeliveryRegistryProvider from '@modules/aws/media-delivery-registry'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRecord,
  insertTestImage,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import {
  getImagePlacementDeliveryKey,
  getLegacyImageDeliveryKey,
  prepublishImagePlacementDenials,
  publishLegacyImageDeliveryRecord,
} from './delivery-registry.mts'

describe('surface delivery provider boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('pre-denies an active surface tuple and its generic alias before a safety or delete transition', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await setTestUserProfileImage(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    expect(placement).toBeDefined()
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-delivery-registry')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    const put = vi
      .spyOn(mediaDeliveryRegistryProvider, 'putMediaDeliveryRegistryRecord')
      .mockResolvedValue({ $metadata: {} })
    const invalidate = vi
      .spyOn(mediaDeliveryRegistryProvider, 'invalidateMediaDeliveryPath')
      .mockResolvedValue({ $metadata: {} })

    await prepublishImagePlacementDenials({ imageId })
    await publishLegacyImageDeliveryRecord(imageId, 'withheld')

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: getImagePlacementDeliveryKey({
          placementId: placement!.placement_id,
          revision: placement!.placement_revision,
          imageId,
        }),
        state: 'withheld',
      }),
    )
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: getLegacyImageDeliveryKey(imageId),
        state: 'withheld',
      }),
    )
    expect(invalidate).toHaveBeenCalledWith(
      `/images/placements/${placement!.placement_id}/${placement!.placement_revision}/${imageId}`,
    )
    expect(await getTestMediaDeliveryRecord(getLegacyImageDeliveryKey(imageId))).toMatchObject({
      desired_state: 'withheld',
      state: 'completed',
    })
  })
})
