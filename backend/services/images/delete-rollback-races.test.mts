import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { setPostClearanceStatus } from '@services/post-clearance'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { getPostModerationInput } from '@services/posts/moderation-input'
import { getPostImages } from '@services/posts/images'
import { stagePostImagePlacementDeliveryRecords } from '@services/media-delivery-safety'
import type { Post } from '@services/posts/types'
import {
  createTestUserDirect,
  getPostLLMModerationContentSha256,
  getPostModerationResetState,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  removeTestPostImage,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { completeLocalTestImagePlacementDeliveryRecord } from '../../test-helpers/data-stores/psql/posts.mts'
import { deleteImageById } from './delete.mts'

describe('deleteImageById rollback races', () => {
  beforeEach(async () => {
    await entitiesListeners.obliterate({ force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not restore a post-image relation removed while deletion enqueue is pending', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Delete image concurrent relation ${suffix}`,
      slug: `delete-image-concurrent-relation-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post whose image relation is concurrently removed',
      clearanceStatus: 'approved',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })
    await stagePostImagePlacementDeliveryRecords(postId)
    const initialPlacement = (await getPostImages(postId))[0]!
    await completeLocalTestImagePlacementDeliveryRecord({
      placementId: initialPlacement.placement_id,
      revision: initialPlacement.placement_revision,
      imageId,
    })
    const originalPost = (await getPostByAny(postId, { readOnly: false })) as Post
    expect(originalPost.images).toEqual([
      expect.objectContaining({ image_id: imageId, placement_id: initialPlacement.placement_id }),
    ])
    await setPostLLMModerationContentSha256(
      postId,
      createPostModerationContent(originalPost).content_sha256,
    )
    const enqueueError = new Error('bulk post update enqueue failed')
    vi.spyOn(entitiesListeners, 'addBulk').mockImplementationOnce(async () => {
      await removeTestPostImage(postId, imageId)
      throw enqueueError
    })

    await expect(deleteImageById(imageId)).rejects.toThrow(enqueueError)

    await expect(getPostImages(postId)).resolves.toEqual([])
    await expect(getTestPostImagePlacement(postId, imageId)).resolves.toMatchObject({
      placement_id: initialPlacement.placement_id,
      placement_revision: initialPlacement.placement_revision + 2,
      retired_at: expect.any(Date),
      retirement_reason: 'owner_removed',
    })
    const currentPost = (await getPostByAny(postId, { readOnly: false })) as Post
    await expect(getPostLLMModerationContentSha256(postId)).resolves.toEqual(
      createPostModerationContent(currentPost).content_sha256,
    )
    await expect(getPostModerationResetState(postId)).resolves.toMatchObject({
      approved_at: null,
      rejected_at: null,
      in_review_at: null,
    })
  })

  it('does not restore obsolete clearance across an intervening platform decision', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Delete image concurrent clearance ${suffix}`,
      slug: `delete-image-concurrent-clearance-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post whose clearance changes while deletion enqueue is pending',
      clearanceStatus: 'approved',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })
    await stagePostImagePlacementDeliveryRecords(postId)
    const initialPlacement = (await getPostImages(postId))[0]!
    await completeLocalTestImagePlacementDeliveryRecord({
      placementId: initialPlacement.placement_id,
      revision: initialPlacement.placement_revision,
      imageId,
    })
    const originalPost = (await getPostByAny(postId, { readOnly: false })) as Post
    expect(originalPost.images).toEqual([expect.objectContaining({ image_id: imageId })])
    await setPostLLMModerationContentSha256(
      postId,
      createPostModerationContent(originalPost).content_sha256,
    )
    const enqueueError = new Error('bulk post update enqueue failed')
    vi.spyOn(entitiesListeners, 'addBulk').mockImplementationOnce(async () => {
      await setPostClearanceStatus(
        postId,
        'rejected',
        creator!.id,
        undefined,
        {
          reason: 'test_intervening_platform_decision',
        },
        {
          reasonCode: 'platform_policy',
          platformOverride: true,
        },
      )
      throw enqueueError
    })

    await expect(deleteImageById(imageId)).rejects.toThrow(enqueueError)

    await expect(getPostModerationResetState(postId)).resolves.toMatchObject({
      approved_at: null,
      rejected_at: null,
      in_review_at: null,
    })
    const restoredPost = await getPostModerationInput(postId)
    if (!restoredPost) throw new Error('restored post was not found')
    await expect(getPostLLMModerationContentSha256(postId)).resolves.toEqual(
      createPostModerationContent(restoredPost).content_sha256,
    )
  })
})
