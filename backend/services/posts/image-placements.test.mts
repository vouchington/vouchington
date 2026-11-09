import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  createTestUser,
  insertTestImage,
  insertTestPost,
} from '@voucha/test-helpers'
import { getTestPostImagePlacement } from '@voucha/test-helpers/entities/post-images'
import { hasTestRetainedMediaBinding } from '@voucha/test-helpers/entities/retained-media'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { syncPostImagePlacements } from './image-placements.mts'

describe('syncPostImagePlacements', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('creates exact retained pairs in a batch and reuses placements after retirement', async () => {
    const user = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Batched placements ${suffix}`,
      slug: `batched-placements-${suffix}`,
      createdById: user!.id,
      markdown: 'A post with several images',
    })
    const imageIds = await Promise.all(Array.from({ length: 3 }, () => insertTestImage(user!.id)))

    await using query = await beginTransaction()
    await syncPostImagePlacements(postId, [imageIds[2]!, imageIds[0]!, imageIds[1]!], query)
    await query.commit()

    const placements = await Promise.all(
      imageIds.map(imageId => getTestPostImagePlacement(postId, imageId)),
    )
    const placementIds = placements.map(placement => placement?.placement_id)
    expect(new Set(placementIds).size).toBe(3)
    expect(placements.every(placement => placement?.retired_at === null)).toBe(true)
    expect(placements.every(placement => placement?.retirement_reason === null)).toBe(true)
    await expect(
      Promise.all(placementIds.map(placementId => hasTestRetainedMediaBinding(placementId!))),
    ).resolves.toEqual([true, true, true])

    await using removal = await beginTransaction()
    await syncPostImagePlacements(postId, [imageIds[0]!, imageIds[2]!], removal)
    await removal.commit()
    await expect(getTestPostImagePlacement(postId, imageIds[1]!)).resolves.toMatchObject({
      placement_id: placementIds[1],
      retirement_reason: 'owner_removed',
    })

    await using restoration = await beginTransaction()
    await syncPostImagePlacements(postId, imageIds, restoration)
    await restoration.commit()
    const restored = await Promise.all(
      imageIds.map(imageId => getTestPostImagePlacement(postId, imageId)),
    )
    expect(restored.map(placement => placement?.placement_id)).toEqual(placementIds)
    expect(restored.every(placement => placement?.retired_at === null)).toBe(true)
  })

  it('does not create any placement when a retained image identity is missing', async () => {
    const user = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Missing retained image ${suffix}`,
      slug: `missing-retained-image-${suffix}`,
      createdById: user!.id,
      markdown: 'A post with a missing image identity',
    })
    const imageId = await insertTestImage(user!.id)

    {
      await using query = await beginTransaction()
      await expect(
        syncPostImagePlacements(postId, [imageId, randomUUID()], query),
      ).rejects.toMatchObject({ code: '23503' })
    }
    await expect(getTestPostImagePlacement(postId, imageId)).resolves.toBeNull()
  })

  it('rolls back a SQL-failed placement scope and leaves the parent executor usable', async () => {
    const user = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Recoverable placement SQL ${suffix}`,
      slug: `recoverable-placement-sql-${suffix}`,
      createdById: user.id,
      markdown: 'Recoverable image placement',
    })
    const imageId = await insertTestImage(user.id)
    await using query = await beginTransaction()
    await expect(syncPostImagePlacements(randomUUID(), [imageId], query)).rejects.toMatchObject({
      code: '23503',
    })
    await syncPostImagePlacements(postId, [imageId], query)
    await query.commit()
    expect(await getTestPostImagePlacement(postId, imageId)).not.toBeNull()
  })
})
