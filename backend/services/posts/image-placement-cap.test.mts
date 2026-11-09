import {
  moveTestImageCapacitySlot,
  readTestImageCapacitySlots,
} from '@voucha/test-helpers/image-placement-capacity'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { randomUUID } from 'node:crypto'
import {
  mediaDeliverySafetyWorkConfig,
  mediaDeliverySafetyWorkMaxValues,
} from '@services/media-delivery-safety/work-limits'
import { writeTestImageSurfaceMutation } from '@voucha/test-helpers/image-surface-mutation'
import {
  beginTransaction,
  createTestUser,
  insertTestImage,
  insertTestPost,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTestPostImagePlacement } from '@voucha/test-helpers/entities/post-images'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { syncPostImagePlacements } from './image-placements.mts'

const limitError = { status: 409, code: 'IMAGE_PLACEMENT_LIMIT_REACHED' }

async function post(userId: string): Promise<string> {
  const suffix = randomUUID()
  return insertTestPost({
    title: `Placement cap ${suffix}`,
    slug: `placement-cap-${suffix}`,
    createdById: userId,
    markdown: 'Placement cap',
  })
}

async function attach(postId: string, imageIds: string[]): Promise<void> {
  await using query = await beginTransaction()
  await syncPostImagePlacements(postId, imageIds, query)
  await query.commit()
}

describe('image placement capacity', () => {
  beforeEach(async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('allows the last slot, keeps active pairs idempotent, and rejects a new pair', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 2,
      }),
    )
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const [first, second, third] = await Promise.all([post(user.id), post(user.id), post(user.id)])
    await attach(first!, [imageId])
    await attach(second!, [imageId])
    const original = await getTestPostImagePlacement(first!, imageId)
    await attach(first!, [imageId, imageId])
    expect(await getTestPostImagePlacement(first!, imageId)).toMatchObject({
      placement_id: original!.placement_id,
      retired_at: null,
    })
    await expect(attach(third!, [imageId])).rejects.toMatchObject(limitError)
    await expect(getTestPostImagePlacement(third!, imageId)).resolves.toBeNull()
  })

  it('requires a slot to reactivate a retired pair and rolls back mixed batches', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const user = await createTestUser()
    const [imageId, otherImage] = await Promise.all([
      insertTestImage(user.id),
      insertTestImage(user.id),
    ])
    const [first, second] = await Promise.all([post(user.id), post(user.id)])
    await attach(first!, [imageId])
    const original = await getTestPostImagePlacement(first!, imageId)
    await attach(first!, [])
    await attach(second!, [imageId])
    await expect(attach(first!, [imageId, otherImage])).rejects.toMatchObject(limitError)
    await expect(getTestPostImagePlacement(first!, otherImage)).resolves.toBeNull()
    await expect(getTestPostImagePlacement(first!, imageId)).resolves.toMatchObject({
      placement_id: original!.placement_id,
      retirement_reason: 'owner_removed',
    })
    await attach(second!, [])
    await attach(first!, [imageId])
    await expect(getTestPostImagePlacement(first!, imageId)).resolves.toMatchObject({
      placement_id: original!.placement_id,
      retired_at: null,
    })
  })

  it('serializes competing posts for the final slot', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const [first, second] = await Promise.all([post(user.id), post(user.id)])
    const results = await Promise.allSettled([
      attach(first!, [imageId]),
      attach(second!, [imageId]),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find(result => result.status === 'rejected')
    expect(rejection).toMatchObject({ status: 'rejected', reason: limitError })
    const placements = await Promise.all([
      getTestPostImagePlacement(first!, imageId),
      getTestPostImagePlacement(second!, imageId),
    ])
    expect(placements.filter(placement => placement?.retired_at === null)).toHaveLength(1)
  })

  it('shares capacity between post and surface placements', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const postId = await post(user.id)
    await attach(postId, [imageId])
    const reference = { surfaceKind: 'user-profile-image' as const, userId: user.id }
    const attachSurface = async () => {
      await using query = await beginTransaction()
      const result = await writeTestImageSurfaceMutation(reference, imageId, user.id, query)
      await query.commit()
      return result
    }
    await expect(attachSurface()).rejects.toMatchObject(limitError)
    expect(await getTestImageSurfacePlacements({ imageId, userId: user.id })).toHaveLength(0)
    await attach(postId, [])
    const surface = await attachSurface()
    await expect(attachSurface()).resolves.toMatchObject({ placement_id: surface!.placement_id })
    await expect(attach(postId, [imageId])).rejects.toMatchObject(limitError)
  })
  it('counts sparse high slots after a cap reduction and admits only the remaining free prefix', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 2,
      }),
    )
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const [first, second, third] = await Promise.all([post(user.id), post(user.id), post(user.id)])
    await attach(first!, [imageId])
    const original = await getTestPostImagePlacement(first!, imageId)
    await moveTestImageCapacitySlot(
      original!.placement_id,
      mediaDeliverySafetyWorkMaxValues.max_placements_per_image,
    )
    await attach(second!, [imageId])
    expect(await readTestImageCapacitySlots(imageId)).toEqual([
      1,
      mediaDeliverySafetyWorkMaxValues.max_placements_per_image,
    ])
    await expect(attach(third!, [imageId])).rejects.toMatchObject(limitError)
    const restoreReduced = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      max_placements_per_image: 1,
    })
    try {
      await attach(first!, [])
      await expect(attach(third!, [imageId])).rejects.toMatchObject(limitError)
      expect(await readTestImageCapacitySlots(imageId)).toEqual([1])
    } finally {
      restoreReduced()
    }
  })
})
