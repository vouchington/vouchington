import { randomUUID } from 'node:crypto'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'
import {
  beginTransaction,
  createTestUser,
  getTestCurrentPostClearance,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  countTestPostModerationAttempts,
  getTestCurrentPostModerationVersion,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { createPostImageRollbackFixture } from '@voucha/test-helpers/services/posts/images.fixtures'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createPostModerationContent } from './content.mts'
import { syncPostImagePlacements } from './image-placements.mts'
import { rollbackPostImages } from './images-rollback.mts'
import { getPostImages } from './images.mts'
import { getPostModerationInput } from './moderation-input.mts'

describe('image rollback capacity refusal', () => {
  it('retains current images and admits moderation when the rollback snapshot is stale', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Stale image rollback ${suffix}`,
      slug: `stale-image-rollback-${suffix}`,
      createdById: creator.id,
      markdown: 'Current post',
      clearanceStatus: 'pending',
    })
    const [currentImage, staleImage] = await Promise.all([
      insertTestImage(creator.id),
      insertTestImage(creator.id),
    ])
    await insertTestPostImage({ postId, imageId: currentImage! })
    const content = await getPostModerationInput(postId, { readOnly: false })
    const hash = createPostModerationContent(content!).content_sha256
    await setPostLLMModerationContentSha256(postId, hash)
    const clearance = await getTestCurrentPostClearance(postId)
    expect(await getTestCurrentPostModerationVersion(postId)).toBeNull()

    await expect(
      rollbackPostImages(
        postId,
        createPostImageRollbackFixture({
          currentImages: [{ image_id: staleImage!, order_index: 0, caption: '' }],
          images: [{ image_id: staleImage!, order_index: 0, caption: '' }],
          currentLlmModerationContentSha256: hash,
          currentClearanceVersion: clearance!.clearance_version,
        }),
      ),
    ).resolves.toBe(false)
    await expect(getPostImages(postId)).resolves.toMatchObject([
      { image_id: currentImage, order_index: 0, caption: '' },
    ])
    const version = await getTestCurrentPostModerationVersion(postId)
    expect(version?.content_sha256).toEqual(hash)
    await expect(countTestPostModerationAttempts(postId, 'openai_omni')).resolves.toBe(1)
    await expect(countTestPostModerationAttempts(postId, 'spam_detection')).resolves.toBe(1)
    expect((await backgroundQueue.getJob(`${version!.id}__openai_omni`))?.data).toEqual({
      versionId: version!.id,
    })
    expect((await backgroundQueue.getJob(`${version!.id}__spam_detection`))?.data).toEqual({
      versionId: version!.id,
    })
  })

  it('retains current content and admits moderation when the prior image has no capacity', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Capacity rollback ${suffix}`,
      slug: `capacity-rollback-${suffix}`,
      createdById: creator.id,
      markdown: 'Current post',
      clearanceStatus: 'pending',
    })
    const competingPostId = await insertTestPost({
      title: `Capacity competitor ${suffix}`,
      slug: `capacity-competitor-${suffix}`,
      createdById: creator.id,
      markdown: 'Competing post',
      clearanceStatus: 'pending',
    })
    const [oldImage, currentImage] = await Promise.all([
      insertTestImage(creator.id),
      insertTestImage(creator.id),
    ])
    // Retain a retired pair for the old image, then let another post consume its only live slot.
    await using first = await beginTransaction()
    await syncPostImagePlacements(postId, [oldImage!], first)
    await first.commit()
    await using removal = await beginTransaction()
    await syncPostImagePlacements(postId, [], removal)
    await removal.commit()
    await insertTestPostImage({ postId: competingPostId, imageId: oldImage! })
    await insertTestPostImage({ postId, imageId: currentImage! })
    const content = await getPostModerationInput(postId, { readOnly: false })
    const hash = createPostModerationContent(content!).content_sha256
    await setPostLLMModerationContentSha256(postId, hash)
    const clearance = await getTestCurrentPostClearance(postId)
    expect(await getTestCurrentPostModerationVersion(postId)).toBeNull()
    expect(await countTestPostModerationAttempts(postId)).toBe(0)

    const result = await rollbackPostImages(
      postId,
      createPostImageRollbackFixture({
        currentImages: [{ image_id: currentImage!, order_index: 0, caption: '' }],
        images: [{ image_id: oldImage!, order_index: 0, caption: '' }],
        currentLlmModerationContentSha256: hash,
        currentClearanceVersion: clearance!.clearance_version,
      }),
    )
    expect(result).toBe(false)
    await expect(getPostImages(postId)).resolves.toMatchObject([
      { image_id: currentImage, order_index: 0, caption: '' },
    ])
    await expect(getTestCurrentPostClearance(postId)).resolves.toMatchObject({
      clearance_version: clearance!.clearance_version,
      clearance_status: 'pending',
    })
    const version = await getTestCurrentPostModerationVersion(postId)
    expect(version?.content_sha256).toEqual(hash)
    await expect(countTestPostModerationAttempts(postId, 'openai_omni')).resolves.toBe(1)
    await expect(countTestPostModerationAttempts(postId, 'spam_detection')).resolves.toBe(1)
    expect((await backgroundQueue.getJob(`${version!.id}__openai_omni`))?.data).toEqual({
      versionId: version!.id,
    })
    expect((await backgroundQueue.getJob(`${version!.id}__spam_detection`))?.data).toEqual({
      versionId: version!.id,
    })
  })
})
