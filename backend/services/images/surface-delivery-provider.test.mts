import { afterEach, describe, expect, it, vi } from 'vitest'
import * as mediaDeliveryRegistryProvider from '@modules/aws/media-delivery-registry'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { markImageQuarantinePending } from '@voucha/test-helpers/entities/image-safety'

describe('surface delivery provider boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('does not push an edge denial when quarantine starts', async () => {
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

    await markImageQuarantinePending(imageId)

    expect(put).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })
})
