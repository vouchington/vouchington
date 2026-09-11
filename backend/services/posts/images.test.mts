import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openai_moderation_omni_single } from '@queues/openai-moderation/queues'
import { spam_detection } from '@queues/spam-detection/queues'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import {
  beginTransaction,
  createTestUser,
  countPostImageRevisions,
  getTestPostClearanceState,
  getLatestPostClearanceMetadata,
  getPostClearanceChanges,
  getTestPostPublicationDirtyWorkForScope,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  setPostAiSummaryMarkdownForTest,
} from '@voucha/test-helpers'
import { lockPostPublication } from '@services/post-publication'
import { getPostImages, setPostImages } from './images.mts'
import { rollbackPostImages } from './images-rollback.mts'
import { createPostImageRollbackFixture } from './images.test-helpers.mts'

describe('setPostImages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues a content-changed post update after changing moderation inputs', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image spam replacement ${suffix}`,
      slug: `image-spam-replacement-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post body before image update',
      clearanceStatus: 'pending',
    })
    const aiSummaryMarkdown = `Image moderation summary ${suffix}`
    await setPostAiSummaryMarkdownForTest({ postId, aiSummaryMarkdown })
    const imageId = await insertTestImage(creator!.id)
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    const { content_sha256 } = createPostModerationContent({
      ...post,
      ai_summary_markdown: aiSummaryMarkdown,
      images: [{ image_id: imageId, order_index: 0 }],
    })

    await setPostImages(creator!, post, [{ image_id: imageId, order_index: 0 }])

    await expect(countPostImageRevisions(postId)).resolves.toBe(1)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toMatchObject({ reasons: expect.arrayContaining(['post_content_reset']) })

    await expect
      .poll(async () => {
        const waiting = await spam_detection.getJobs('waiting')
        return waiting.find(
          item => item.name === 'post' && (item.data as { id?: string }).id === postId,
        )?.data
      })
      .toMatchObject({
        id: postId,
        contentSha256: content_sha256.toString('hex'),
      })
    await expect
      .poll(async () => {
        const waiting = await openai_moderation_omni_single.getJobs('waiting')
        return waiting.find(
          item =>
            item.name === 'post' &&
            (item.data as { id?: string }).id === postId &&
            getDeduplicationId(item)?.includes(content_sha256.toString('hex')),
        )?.data
      })
      .toMatchObject({ id: postId })
  })

  it('rolls back image changes when the post update enqueue fails', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image rollback ${suffix}`,
      slug: `image-rollback-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post body before failed image update',
      clearanceStatus: 'approved',
    })
    const clearanceBefore = await getTestPostClearanceState(postId)
    expect(clearanceBefore?.approved_at).toBeInstanceOf(Date)
    const originalImageId = await insertTestImage(creator!.id)
    const replacementImageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId: originalImageId })
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    const enqueueError = new Error('enqueue failed')
    const rejectedEnqueue = Promise.reject(enqueueError) as ReturnType<typeof entitiesListeners.add>
    void rejectedEnqueue.catch(() => {})
    vi.spyOn(entitiesListeners, 'add').mockReturnValueOnce(rejectedEnqueue)

    await expect(
      setPostImages(creator!, post, [{ image_id: replacementImageId, order_index: 0 }]),
    ).rejects.toThrow(enqueueError)

    await expect(getPostImages(postId)).resolves.toEqual([
      { image_id: originalImageId, order_index: 0, caption: '' },
    ])
    await expect(countPostImageRevisions(postId)).resolves.toBe(0)
    await expect(getTestPostClearanceState(postId)).resolves.toMatchObject({
      approved_at: expect.any(Date),
      rejected_at: null,
    })
    const clearanceChanges = await getPostClearanceChanges(postId)
    expect(clearanceChanges.slice(-2)).toEqual([
      { change_type: 'reset_to_pending', changed_by_id: creator!.id },
      { change_type: 'approve', changed_by_id: creator!.id },
    ])
    await expect(getLatestPostClearanceMetadata(postId)).resolves.toMatchObject({
      reason: 'image_update_enqueue_rollback',
      compensates_change_id: expect.any(String),
    })
  })

  it('resets approved clearance before publishing an image change', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Approved image update ${suffix}`,
      slug: `approved-image-update-${suffix}`,
      createdById: creator.id,
      markdown: 'Approved post before image update',
      clearanceStatus: 'approved',
    })
    const imageId = await insertTestImage(creator.id)
    const post = (await getPostByAny(postId, { readOnly: false })) as Post

    await setPostImages(creator, post, [{ image_id: imageId, order_index: 0 }])

    await expect(getTestPostClearanceState(postId)).resolves.toMatchObject({
      approved_at: null,
    })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toMatchObject({
      reasons: expect.arrayContaining(['post_clearance_changed', 'post_content_reset']),
    })
  })

  it('skips rollback when post moderation hashes no longer match the failed edit', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image rollback stale hash ${suffix}`,
      slug: `image-rollback-stale-hash-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post body before stale rollback',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })

    await expect(
      rollbackPostImages(
        postId,
        createPostImageRollbackFixture({
          revisionId: randomUUID(),
          currentImages: [{ image_id: imageId, order_index: 0, caption: '' }],
          images: [],
          currentOpenaiModerationContentSha256: Buffer.alloc(32, 1),
          currentLlmModerationContentSha256: Buffer.alloc(32, 1),
          openaiModerationContentSha256: Buffer.alloc(32, 2),
          llmModerationContentSha256: Buffer.alloc(32, 2),
        }),
      ),
    ).resolves.toBe(false)
    await expect(getPostImages(postId)).resolves.toEqual([
      { image_id: imageId, order_index: 0, caption: '' },
    ])
  })

  it('skips rollback when post images no longer match the failed edit', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image rollback stale images ${suffix}`,
      slug: `image-rollback-stale-images-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post body before stale image rollback',
      clearanceStatus: 'pending',
    })
    const currentImageId = await insertTestImage(creator!.id)
    const staleImageId = await insertTestImage(creator!.id)
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    await setPostImages(creator!, post, [{ image_id: currentImageId, order_index: 0 }])
    const currentHash = createPostModerationContent({
      ...post,
      images: [{ image_id: currentImageId, order_index: 0 }],
    }).content_sha256

    await expect(
      rollbackPostImages(
        postId,
        createPostImageRollbackFixture({
          revisionId: randomUUID(),
          currentImages: [{ image_id: staleImageId, order_index: 0, caption: '' }],
          images: [],
          currentOpenaiModerationContentSha256: currentHash,
          currentLlmModerationContentSha256: currentHash,
          openaiModerationContentSha256: Buffer.alloc(32, 3),
          llmModerationContentSha256: Buffer.alloc(32, 3),
        }),
      ),
    ).resolves.toBe(false)
    await expect(getPostImages(postId)).resolves.toEqual([
      { image_id: currentImageId, order_index: 0, caption: '' },
    ])
  })

  it('locks rollback images before the post publication scope', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Image rollback lock order ${suffix}`,
      slug: `image-rollback-lock-order-${suffix}`,
      createdById: creator.id,
      markdown: '',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator.id)
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    await setPostImages(creator, post, [{ image_id: imageId, order_index: 0 }])
    const current = (await getPostByAny(postId, { readOnly: false })) as Post
    const moderationSha = createPostModerationContent({
      ...current,
      images: [{ image_id: imageId, order_index: 0 }],
    }).content_sha256
    const imageLocked = Promise.withResolvers<void>()
    const releaseImage = Promise.withResolvers<void>()
    const holder = holdImageRowLock({ imageId, imageLocked, releaseImage })
    await imageLocked.promise

    const rollingBack = rollbackPostImages(
      postId,
      createPostImageRollbackFixture({
        revisionId: randomUUID(),
        currentImages: [{ image_id: imageId, order_index: 0, caption: '' }],
        images: [{ image_id: imageId, order_index: 0, caption: '' }],
        currentOpenaiModerationContentSha256: moderationSha,
        currentLlmModerationContentSha256: moderationSha,
        openaiModerationContentSha256: moderationSha,
        llmModerationContentSha256: moderationSha,
      }),
    )
    await new Promise<void>(resolve => setImmediate(resolve))
    try {
      await expect(acquirePostPublicationLockWithShortTimeout(postId)).resolves.toBeUndefined()
    } finally {
      releaseImage.resolve()
    }
    await holder
    await rollingBack
  })
})

function getDeduplicationId(job: { opts: unknown }): string | undefined {
  return (job.opts as { deduplication?: { id?: string } }).deduplication?.id
}

async function holdImageRowLock({
  imageId,
  imageLocked,
  releaseImage,
}: {
  imageId: string
  imageLocked: PromiseWithResolvers<void>
  releaseImage: PromiseWithResolvers<void>
}): Promise<void> {
  await using query = await beginTransaction()
  await query(`SELECT id FROM images WHERE id = $1::uuid FOR UPDATE`, [imageId])
  imageLocked.resolve()
  await releaseImage.promise
  await query.commit()
}

async function acquirePostPublicationLockWithShortTimeout(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await lockPostPublication(query, postId)
  await query.commit()
}
