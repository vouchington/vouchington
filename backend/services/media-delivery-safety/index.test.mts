import * as mediaDeliveryRegistryProvider from '@modules/aws/media-delivery-registry'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  prepublishTestImageSurfaceDenial,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('media delivery surface safety', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('publishes and invalidates the old exact tuple before the owner transaction continues', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await setTestUserProfileImage(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    if (!placement) throw new Error('surface placement was not created')
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

    await prepublishTestImageSurfaceDenial({ surfaceKind: 'user-profile-image', userId: user.id })

    const deliveryKey = `image-placement:${placement.placement_id}:${placement.placement_revision}:${imageId}`
    expect(put).toHaveBeenCalledWith({
      deliveryKey,
      state: 'withheld',
      generation: expect.any(String),
    })
    expect(invalidate).toHaveBeenCalledWith(
      `/images/placements/${placement.placement_id}/${placement.placement_revision}/${imageId}`,
    )
  })
})
