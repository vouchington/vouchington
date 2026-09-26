import { beginTransaction } from '@data-stores/psql'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as mediaDeliveryRegistryProvider from '@modules/aws/media-delivery-registry'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRecord,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { syncImageSurfacePlacement } from '../images/surface-placements.mts'
import {
  compensateFailedImageDeliveryMutation,
  getImagePlacementDeliveryKey,
  processMediaDeliveryRegistryRecord,
  stageImagePlacementDeliveryRecord,
} from './index.mts'

describe('media delivery registry processor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('projects a staged placement then retries its provider failure after backoff', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await setTestUserProfileImage(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    if (!placement) throw new Error('surface placement was not created')
    stubPublication()
    const put = vi
      .spyOn(mediaDeliveryRegistryProvider, 'putMediaDeliveryRegistryRecord')
      .mockResolvedValueOnce({ $metadata: {} })
      .mockRejectedValueOnce(new Error('registry outage'))
      .mockResolvedValueOnce({ $metadata: {} })
    vi.spyOn(mediaDeliveryRegistryProvider, 'invalidateMediaDeliveryPath').mockResolvedValue({
      $metadata: {},
    })
    const deliveryKey = getImagePlacementDeliveryKey({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    })
    await stageImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
      state: 'allow',
    })
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('completed')
    expect(put).toHaveBeenCalledWith({
      deliveryKey,
      state: 'allow',
      generation: expect.stringMatching(/^\d+$/),
    })
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({
      desired_state: 'allow',
      state: 'completed',
    })
    await stageImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
      state: 'withheld',
    })
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).rejects.toThrow('registry outage')
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({
      desired_state: 'withheld',
      state: 'pending',
    })
    await expect(
      processMediaDeliveryRegistryRecord(deliveryKey, new Date(Date.now() + 2 * 60 * 1000)),
    ).resolves.toBe('completed')
    expect(put).toHaveBeenCalledTimes(3)
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({
      desired_state: 'withheld',
      state: 'completed',
    })
  })

  it('republishes current post placements after a rolled-back delivery mutation', async () => {
    const user = await createTestUserDirect()
    const [postId, imageId] = await Promise.all([
      insertTestPost({
        title: `delivery recovery ${crypto.randomUUID()}`,
        slug: `delivery-recovery-${crypto.randomUUID()}`,
        createdById: user.id,
        markdown: 'image',
      }),
      insertTestImage(user.id),
    ])
    await insertTestPostImage({ postId, imageId })
    const placement = await getTestPostImagePlacement(postId, imageId)
    if (!placement) throw new Error('post placement disappeared')
    stubPublication()
    vi.spyOn(mediaDeliveryRegistryProvider, 'putMediaDeliveryRegistryRecord').mockResolvedValue({
      $metadata: {},
    })
    vi.spyOn(mediaDeliveryRegistryProvider, 'invalidateMediaDeliveryPath').mockResolvedValue({
      $metadata: {},
    })
    await compensateFailedImageDeliveryMutation({ postIds: [postId], imageIds: [imageId] })
    const deliveryKey = getImagePlacementDeliveryKey({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    })
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({
      desired_state: 'allow',
      state: 'completed',
    })
  })

  it('allocates a later generation after a rolled-back denial staging transaction', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await setTestUserProfileImage(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    if (!placement) throw new Error('surface placement was not created')
    const input = {
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    }
    const initial = await stageImagePlacementDeliveryRecord({ ...input, state: 'allow' })
    let rolledBackGeneration: string
    {
      await using transaction = await beginTransaction()
      const staged = await stageImagePlacementDeliveryRecord(
        { ...input, state: 'withheld' },
        { query: transaction },
      )
      rolledBackGeneration = staged.generation
    }
    const repaired = await stageImagePlacementDeliveryRecord({ ...input, state: 'withheld' })

    expect(BigInt(rolledBackGeneration!)).toBeGreaterThan(BigInt(initial.generation))
    expect(BigInt(repaired.generation)).toBeGreaterThan(BigInt(rolledBackGeneration!))
  })

  it('replaces an allow staged from a retired surface tuple with a newer withheld generation', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await setTestUserProfileImage(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    if (!placement) throw new Error('surface placement was not created')
    stubPublication()
    const put = vi
      .spyOn(mediaDeliveryRegistryProvider, 'putMediaDeliveryRegistryRecord')
      .mockResolvedValue({ $metadata: {} })
    vi.spyOn(mediaDeliveryRegistryProvider, 'invalidateMediaDeliveryPath').mockResolvedValue({
      $metadata: {},
    })
    const deliveryKey = getImagePlacementDeliveryKey({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    })
    await stageImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
      state: 'allow',
    })
    await using transaction = await beginTransaction()
    await syncImageSurfacePlacement(
      { surfaceKind: 'user-profile-image', userId: user.id },
      null,
      transaction,
    )
    await transaction.commit()
    // A stale reconciliation snapshot can attempt this upsert after retirement committed.
    await stageImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
      state: 'allow',
    })

    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('completed')
    expect(put).toHaveBeenLastCalledWith({
      deliveryKey,
      state: 'withheld',
      generation: expect.stringMatching(/^\d+$/),
    })
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({
      desired_state: 'withheld',
      state: 'completed',
    })
  })
})

function stubPublication(): void {
  vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
  vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-delivery-registry')
  vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
  vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
}
