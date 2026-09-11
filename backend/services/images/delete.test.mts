import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import {
  approveTestPost,
  countPostImageRevisions,
  createTestUserDirect,
  getImageModerationState,
  getTestPostPublicationDirtyWorkForScope,
  getPostLLMModerationContentSha256,
  getPostModerationData,
  getPostModerationResetState,
  insertTestImage,
  insertTestCommunity,
  insertTestPost,
  insertTestPostImage,
  listTestPostPublicationImpactCommunityIds,
  markTestImageUploadStaged,
  readAllQueueJobs,
  setImageOpenAIModerationResults,
  setPostLLMModerationContentSha256,
  setPostModerationContentSha256,
  setPostOpenAIModerationResults,
  setPostSpamDetectionResults,
} from '@voucha/test-helpers'
import { deleteImageById } from './delete.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'
import * as imageStorage from './s3-upload-lifecycle.mts'

describe('deleteImageById rollback', () => {
  beforeEach(async () => {
    await entitiesListeners.obliterate({ force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues content-changed post updates for posts using the deleted image', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Delete image enqueue ${suffix}`,
      slug: `delete-image-enqueue-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post using image where deletion should enqueue post update',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })
    const addBulk = vi.spyOn(entitiesListeners, 'addBulk').mockResolvedValueOnce([])

    await deleteImageById(imageId)

    expect(addBulk).toHaveBeenCalledOnce()
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'processPostUpdated',
        data: { id: postId, contentChanged: true },
      }),
    ])
    await expect(countPostImageRevisions(postId)).resolves.toBe(1)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toMatchObject({ reasons: expect.arrayContaining(['post_content_reset']) })
  })

  it('restores shared image and post moderation state when bulk post update enqueue fails', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const community = await insertTestCommunity({
      name: `Delete shared image rollback ${suffix}`,
      slug: `delete-shared-image-rollback-${suffix}`,
      createdById: creator!.id,
    })
    const postIds = await Promise.all([
      insertTestPost({
        title: `Delete shared image rollback A ${suffix}`,
        slug: `delete-shared-image-rollback-a-${suffix}`,
        createdById: creator!.id,
        communityId: community.id,
        markdown: 'First post using the shared image',
        clearanceStatus: 'pending',
      }),
      insertTestPost({
        title: `Delete shared image rollback B ${suffix}`,
        slug: `delete-shared-image-rollback-b-${suffix}`,
        createdById: creator!.id,
        communityId: community.id,
        markdown: 'Second post using the shared image',
        clearanceStatus: 'pending',
      }),
    ])
    const imageId = await insertTestImage(creator!.id)
    await Promise.all(postIds.map(postId => insertTestPostImage({ postId, imageId })))
    await setImageOpenAIModerationResults(imageId, [{ category: 'old-image-state' }], true)

    for (const postId of postIds) {
      await approveTestPost(postId)
      await setPostSpamDetectionResults(postId, [
        { signal: 'fixture', score: 0.7, flagged: true, details: { postId } },
      ])
      await setPostOpenAIModerationResults(postId, {
        flagged: true,
        categories: { fixture: true },
      })
    }

    const beforeImage = await getImageModerationState(imageId)
    const beforePosts = await Promise.all(postIds.map(getPostModerationResetState))
    const enqueueError = new Error('bulk post update enqueue failed')
    const rejectedBulk = Promise.reject(enqueueError) as ReturnType<
      typeof entitiesListeners.addBulk
    >
    void rejectedBulk.catch(() => {})
    vi.spyOn(entitiesListeners, 'addBulk').mockReturnValueOnce(rejectedBulk)

    await expect(deleteImageById(imageId)).rejects.toThrow(enqueueError)

    await expect(getImageModerationState(imageId)).resolves.toEqual(beforeImage)
    await expect(Promise.all(postIds.map(getPostModerationResetState))).resolves.toEqual(
      beforePosts,
    )
    await expect(Promise.all(postIds.map(countPostImageRevisions))).resolves.toEqual([0, 0])
    const afterDirtyWork = await Promise.all(
      postIds.map(postId => getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })),
    )
    for (const [index, postId] of postIds.entries()) {
      const afterWork = afterDirtyWork[index]!
      expect(Number(afterWork!.generation)).toBe(2)
      expect(afterWork!.reasons).toEqual(['post_clearance_changed'])
      await expect(listTestPostPublicationImpactCommunityIds(afterWork!.id)).resolves.toContain(
        community.id,
      )
      expect(afterWork!.post_id).toBe(postId)
    }
    const waiting = await readAllQueueJobs(entitiesListeners)
    expect(
      waiting.filter(
        job =>
          job.name === 'processPostUpdated' &&
          postIds.includes((job.data as { id?: string }).id ?? ''),
      ),
    ).toEqual([])
  })

  it('serializes irreversible staged cleanup with a rollback-capable deletion', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Delete storage rollback ${suffix}`,
      slug: `delete-storage-rollback-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post whose image deletion rolls back while cleanup waits',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })
    await markTestImageUploadStaged(imageId)

    let rejectEnqueue!: (error: Error) => void
    let enqueueStarted!: () => void
    const started = new Promise<void>(resolve => (enqueueStarted = resolve))
    const blockedEnqueue = new Promise<never>((_, reject) => (rejectEnqueue = reject))
    vi.spyOn(entitiesListeners, 'addBulk').mockImplementationOnce(async () => {
      enqueueStarted()
      return await blockedEnqueue
    })
    const deleteKnown = vi
      .spyOn(imageStorage, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)
    const deleteSource = vi
      .spyOn(imageStorage, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const deletion = deleteImageById(imageId)
    void deletion.catch(() => {})
    await started
    const cleanup = cleanupStagedUploadSource(imageId)
    rejectEnqueue(new Error('enqueue rollback'))

    await expect(deletion).rejects.toThrow('enqueue rollback')
    await expect(cleanup).resolves.toBe(true)
    expect(deleteKnown).not.toHaveBeenCalled()
    expect(deleteSource).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    expect((await getImageModerationState(imageId))?.deleted_at).toBeNull()
  })

  it('keeps soft-delete committed and does not throw when omitRollback=true and enqueue fails', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Delete omit-rollback ${suffix}`,
      slug: `delete-omit-rollback-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post using image where enqueue will fail',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })

    const enqueueError = new Error('enqueue failed — omitRollback path')
    const rejected = Promise.reject(enqueueError) as ReturnType<typeof entitiesListeners.addBulk>
    void rejected.catch(() => {})
    vi.spyOn(entitiesListeners, 'addBulk').mockReturnValueOnce(rejected)

    // With omitRollback=true, the function should not throw even when enqueue fails
    await expect(deleteImageById(imageId, true)).resolves.toBeUndefined()

    // Soft-delete must stay committed (deleted_at set, not rolled back)
    const state = await getImageModerationState(imageId)
    expect(state?.deleted_at).not.toBeNull()
    await expect(countPostImageRevisions(postId)).resolves.toBe(1)
  })

  it('skips stale post rollback when a concurrent edit changes moderation hashes', async () => {
    const creator = await createTestUserDirect()
    expect(creator).toBeTruthy()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Delete shared image concurrent edit ${suffix}`,
      slug: `delete-shared-image-concurrent-edit-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post using an image that will be concurrently edited',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })
    await setImageOpenAIModerationResults(imageId, [{ category: 'old-image-state' }], true)
    await approveTestPost(postId)
    await setPostSpamDetectionResults(postId, [
      { signal: 'fixture', score: 0.7, flagged: true, details: { postId } },
    ])
    await setPostOpenAIModerationResults(postId, {
      flagged: true,
      categories: { fixture: true },
    })

    const beforePost = await getPostModerationResetState(postId)
    const editedHash = randomBytes(32)
    const enqueueError = new Error('bulk post update enqueue failed')
    vi.spyOn(entitiesListeners, 'addBulk').mockImplementationOnce(async () => {
      await setPostModerationContentSha256(postId, editedHash)
      await setPostLLMModerationContentSha256(postId, editedHash)
      throw enqueueError
    })

    await expect(deleteImageById(imageId)).rejects.toThrow(enqueueError)

    const afterPost = await getPostModerationResetState(postId)
    expect(afterPost).not.toEqual(beforePost)
    const afterModeration = (await getPostModerationData(postId)) as {
      openai_omni_moderation_content_sha256: Buffer | null
    } | null
    expect(afterModeration?.openai_omni_moderation_content_sha256).toEqual(editedHash)
    await expect(getPostLLMModerationContentSha256(postId)).resolves.toEqual(editedHash)
    expect(afterPost?.spam_detection_results).toBeNull()
    expect(afterPost?.openai_omni_moderation_flagged).toBeNull()
  })
})
