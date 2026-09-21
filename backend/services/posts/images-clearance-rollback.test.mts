import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import {
  checkPostClearance,
  ensureCurrentPostModerationVersion,
  recordPostModerationDisposition,
  setPostClearanceStatus,
} from '@services/post-clearance'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import {
  countPostImageRevisions,
  createTestUser,
  createSystemUser,
  getPostLLMModerationContentSha256,
  getTestPostModerationRetryDelayMinutes,
  getLatestPostClearanceDecision,
  getLatestPostClearanceTransparencyCategories,
  getTestPostClearanceState,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  markImageDeleted,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { createPostModerationContent } from './content.mts'
import { getPostModerationInput } from './moderation-input.mts'
import { getPostImages, setPostImages } from './images.mts'
import { rollbackPostImages } from './images-rollback.mts'
import { createPostImageRollbackFixture } from './images.test-helpers.mts'

describe('setPostImages clearance rollback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves a platform override when an image update enqueue rolls back', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image platform rollback ${suffix}`,
      slug: `image-platform-rollback-${suffix}`,
      createdById: creator.id,
      markdown: 'Post body before a failed image update',
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await Promise.all([
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'openai_omni',
        disposition: 'pass',
        reasonCode: 'provider_pass',
      }),
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'spam_detection',
        disposition: 'pass',
        reasonCode: 'provider_pass',
      }),
    ])
    await setPostClearanceStatus(
      postId,
      'rejected',
      creator.id,
      undefined,
      { reason: 'test_platform_override' },
      {
        reasonCode: 'platform_policy',
        privateNote: 'Internal platform decision',
        platformOverride: true,
      },
    )
    const decisionBefore = await getLatestPostClearanceDecision(postId)
    const originalImageId = await insertTestImage(creator.id)
    const replacementImageId = await insertTestImage(creator.id)
    await insertTestPostImage({ postId, imageId: originalImageId })
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    const enqueueError = new Error('enqueue failed')
    const rejectedEnqueue = Promise.reject(enqueueError) as ReturnType<typeof entitiesListeners.add>
    void rejectedEnqueue.catch(() => {})
    vi.spyOn(entitiesListeners, 'add').mockReturnValueOnce(rejectedEnqueue)

    await expect(
      setPostImages(creator, post, [{ image_id: replacementImageId, order_index: 0 }]),
    ).rejects.toThrow(enqueueError)

    const restoredDecision = await getLatestPostClearanceDecision(postId)
    expect(restoredDecision).toMatchObject({
      changed_by_id: creator.id,
      public_reason_code: 'platform_policy',
      private_note: 'Internal platform decision',
      platform_override: true,
    })
    expect(restoredDecision!.id).not.toBe(decisionBefore!.id)
    await checkPostClearance(postId)
    await expect(getLatestPostClearanceDecision(postId)).resolves.toEqual(restoredDecision)
    await expect(getTestPostClearanceState(postId)).resolves.toMatchObject({
      approved_at: null,
      rejected_at: expect.any(Date),
    })
  })

  it('keeps the current images and creates durable moderation work when an old image is deleted', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image unavailable rollback ${suffix}`,
      slug: `image-unavailable-rollback-${suffix}`,
      createdById: creator.id,
      markdown: 'Post body before an image becomes unavailable during rollback',
      clearanceStatus: 'pending',
    })
    const originalImageId = await insertTestImage(creator.id)
    const replacementImageId = await insertTestImage(creator.id)
    await insertTestPostImage({ postId, imageId: originalImageId })
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    const enqueueError = new Error('enqueue failed')
    vi.spyOn(entitiesListeners, 'add').mockImplementationOnce(async () => {
      await markImageDeleted(originalImageId)
      throw enqueueError
    })

    await expect(
      setPostImages(creator, post, [{ image_id: replacementImageId, order_index: 0 }]),
    ).rejects.toThrow(enqueueError)

    await expect(getPostImages(postId)).resolves.toMatchObject([
      { image_id: replacementImageId, order_index: 0, caption: '' },
    ])
    const currentPost = await getPostModerationInput(postId, { readOnly: false })
    expect(currentPost).toBeTruthy()
    await expect(getPostLLMModerationContentSha256(postId)).resolves.toEqual(
      createPostModerationContent(currentPost!).content_sha256,
    )
    await expect(countPostImageRevisions(postId)).resolves.toBe(1)
    await expect(
      getTestPostModerationRetryDelayMinutes(postId, 'openai_omni'),
    ).resolves.not.toBeNull()
    await expect(
      getTestPostModerationRetryDelayMinutes(postId, 'spam_detection'),
    ).resolves.not.toBeNull()
  })

  it('restores an automated rejection without creating another moderation event', async () => {
    const creator = await createTestUser()
    const moderationSystem = await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Automated rejection rollback ${suffix}`,
      slug: `automated-rejection-rollback-${suffix}`,
      createdById: creator.id,
      markdown: 'Post body before an automated rejection rollback',
      clearanceStatus: 'pending',
    })
    const originalImageId = await insertTestImage(creator.id)
    const replacementImageId = await insertTestImage(creator.id)
    await insertTestPostImage({ postId, imageId: originalImageId })
    const originalPost = (await getPostByAny(postId, { readOnly: false })) as Post
    await setPostLLMModerationContentSha256(
      postId,
      createPostModerationContent(originalPost).content_sha256,
    )
    const version = await ensureCurrentPostModerationVersion(postId)
    await Promise.all([
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'openai_omni',
        disposition: 'reject',
        reasonCode: 'sexual_minors',
      }),
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'spam_detection',
        disposition: 'pass',
        reasonCode: 'provider_pass',
      }),
    ])
    await checkPostClearance(postId)
    const rejectedPost = (await getPostByAny(postId, { readOnly: false })) as Post
    const rejectedDecision = await getLatestPostClearanceDecision(postId)
    expect(rejectedDecision?.changed_by_id).toBe(moderationSystem.id)
    await expect(getLatestPostClearanceTransparencyCategories(postId)).resolves.toEqual([
      'openai_omni',
    ])
    const enqueueError = new Error('enqueue failed')
    const rejectedEnqueue = Promise.reject(enqueueError) as ReturnType<typeof entitiesListeners.add>
    void rejectedEnqueue.catch(() => {})
    vi.spyOn(entitiesListeners, 'add').mockReturnValueOnce(rejectedEnqueue)

    await expect(
      setPostImages(creator, rejectedPost, [{ image_id: replacementImageId, order_index: 0 }]),
    ).rejects.toThrow(enqueueError)

    const restoredPost = (await getPostByAny(postId, { readOnly: false })) as Post
    const restoredDecision = await getLatestPostClearanceDecision(postId)
    expect(restoredPost.updated_by_id).toBe(rejectedPost.updated_by_id)
    expect(restoredDecision).toMatchObject({
      changed_by_id: moderationSystem.id,
      public_reason_code: 'deterministic_policy_block',
      platform_override: false,
    })
    expect(restoredDecision!.id).not.toBe(rejectedDecision!.id)
    await expect(getLatestPostClearanceTransparencyCategories(postId)).resolves.toEqual([])
  })

  it('rejects an image rollback that lacks the compensated clearance change', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image rollback missing compensation ${suffix}`,
      slug: `image-rollback-missing-compensation-${suffix}`,
      createdById: creator.id,
      markdown: 'Post whose corrupt image rollback has no compensated clearance change',
      clearanceStatus: 'pending',
    })
    const hash = Buffer.alloc(32, 7)
    await setPostLLMModerationContentSha256(postId, hash)

    await expect(
      rollbackPostImages(
        postId,
        createPostImageRollbackFixture({
          currentLlmModerationContentSha256: hash,
          llmModerationContentSha256: hash,
          currentLatestClearanceChangeId: null,
          latestClearanceChangeId: randomUUID(),
        }),
      ),
    ).rejects.toThrow(`Post image rollback is missing the compensated change for post ${postId}`)
  })
})
