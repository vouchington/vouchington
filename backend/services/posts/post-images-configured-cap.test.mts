import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  createTestUser,
  insertTestImage,
  insertTestPost,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postContentLimitsConfig } from '@services/post-content-limits'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'
import { syncPostImagePlacements } from './image-placements.mts'
import { validatePostImageInputs } from './image-input-validation.mts'

const limitError = { status: 400, code: 'POST_IMAGE_LIMIT_REACHED' }

async function completedImageInputs(userId: string, count: number) {
  const imageIds = await Promise.all(Array.from({ length: count }, () => insertTestImage(userId)))
  return imageIds.map((image_id, order_index) => ({ image_id, order_index }))
}

async function attach(postId: string, imageIds: string[]): Promise<void> {
  await using query = await beginTransaction()
  await syncPostImagePlacements(postId, imageIds, query)
  await query.commit()
}

describe('configured post image cap', () => {
  beforeEach(async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
  })

  it('rejects writes above a lowered cap and accepts exactly the cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postContentLimitsConfig, { post_images_max: 2 }),
    )
    const user = await createTestUser()
    const images = await completedImageInputs(user.id, 3)
    await expect(validatePostImageInputs(images, user.id, false)).rejects.toMatchObject(limitError)
    await expect(
      validatePostImageInputs(images.slice(0, 2), user.id, false),
    ).resolves.toBeUndefined()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Configured cap ${suffix}`,
      slug: `configured-cap-${suffix}`,
      createdById: user.id,
      markdown: 'Configured cap',
    })
    await expect(
      attach(
        postId,
        images.map(image => image.image_id),
      ),
    ).rejects.toMatchObject(limitError)
  })

  it('accepts more images than the default once the cap is raised', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postContentLimitsConfig, { post_images_max: 25 }),
    )
    const user = await createTestUser()
    const images = await completedImageInputs(user.id, 21)
    await expect(validatePostImageInputs(images, user.id, false)).resolves.toBeUndefined()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Raised cap ${suffix}`,
      slug: `raised-cap-${suffix}`,
      createdById: user.id,
      markdown: 'Raised cap',
    })
    await expect(
      attach(
        postId,
        images.map(image => image.image_id),
      ),
    ).resolves.toBeUndefined()
  })
})
