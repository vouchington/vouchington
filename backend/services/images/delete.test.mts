import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  approveTestPost,
  countPostImageRevisions,
  getImageModerationState,
  markImageDeleted,
  markImageQuarantinePending,
  markTestImageUploadStaged,
  getPostModerationResetState,
  overrideDynamicConfigFieldsForTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import {
  captureImageDeletionTransactions,
  createImageDeletionFixture,
  failingImageDeletionAcknowledgement,
  failingImageDeletionTransaction,
  readImageDeletionPostOutcome,
  quarantineBeforeImageDeletionTransaction,
} from '@voucha/test-helpers/image-deletion'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { ENTITY_LISTENERS_POST_UPDATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { getImageDeletionPageJobId } from '@queues/background/enqueues/image-deletion'
import { background } from '@queues/background/queues'
import { deleteImageById, processImageDeletionPage } from './delete.mts'
import { getImageByAny, getImageByIdFromPrimary } from './get.mts'
import { imagesWorkConfig } from './work-limits.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'

describe('paged image deletion', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preserves quarantine reconciliation when a stale lookup races quarantine admission', async () => {
    const fixture = await createImageDeletionFixture(1)
    const before = await getPostModerationResetState(fixture.postIds[0]!)
    const image = await getImageByIdFromPrimary(fixture.imageId)
    const storage = installOwnedUploadCleanupStorage([
      image!.id,
      image!.s3_key,
      image!.sha_256!.toString('hex'),
    ])
    await deleteImageById(fixture.imageId, {
      beginTransaction: quarantineBeforeImageDeletionTransaction(fixture.imageId),
    })
    await expect(getImageModerationState(fixture.imageId)).resolves.toMatchObject({
      deleted_at: null,
      quarantine_pending_at: expect.any(Date),
    })
    await expect(getImageByAny(fixture.imageId)).resolves.toBeNull()
    await expect(getPostModerationResetState(fixture.postIds[0]!)).resolves.toEqual(before)
    await expect(countPostImageRevisions(fixture.postIds[0]!)).resolves.toBe(0)
    expect(storage.calls).toEqual([])
  })

  it('retains source storage and post state for a soft-deleted unconfirmed quarantine', async () => {
    const fixture = await createImageDeletionFixture(1)
    const before = await getPostModerationResetState(fixture.postIds[0]!)
    const image = await getImageByIdFromPrimary(fixture.imageId)
    const storage = installOwnedUploadCleanupStorage([
      image!.id,
      image!.s3_key,
      image!.sha_256!.toString('hex'),
    ])
    await markImageQuarantinePending(fixture.imageId)
    await markImageDeleted(fixture.imageId)
    await expect(processImageDeletionPage(fixture.imageId)).rejects.toThrow(
      'Image quarantine copy is not confirmed',
    )
    await expect(getImageByAny(fixture.imageId)).resolves.toBeNull()
    await expect(getPostModerationResetState(fixture.postIds[0]!)).resolves.toEqual(before)
    await expect(countPostImageRevisions(fixture.postIds[0]!)).resolves.toBe(0)
    expect(storage.calls).toEqual([])
  })

  it('replays committed listener receipts under a smaller limit without a second post reset', async () => {
    const fixture = await createImageDeletionFixture()
    const image = await getImageByIdFromPrimary(fixture.imageId)
    const storage = installOwnedUploadCleanupStorage([
      image!.id,
      image!.s3_key,
      image!.sha_256!.toString('hex'),
    ])
    const restore = overrideDynamicConfigFieldsForTest(imagesWorkConfig, { deletion_page_size: 2 })
    try {
      await expect(
        deleteImageById(fixture.imageId, {
          beginTransaction: failingImageDeletionAcknowledgement(),
        }),
      ).rejects.toThrow('injected deletion admission acknowledgement failure')
      await expect(Promise.all(fixture.postIds.map(countPostImageRevisions))).resolves.toEqual([
        1, 1, 0,
      ])
      // A verdict reached after the committed deletion must survive a late listener replay.
      await approveTestPost(fixture.postIds[0]!)
      const committed = await Promise.all(
        fixture.postIds.slice(0, 2).map(getPostModerationResetState),
      )
      restore()
      const restoreSmaller = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
        deletion_page_size: 1,
      })
      try {
        await processImageDeletionPage(fixture.imageId)
        const partialAdmission = await background.getJob(
          getImageDeletionPageJobId(fixture.imageId, fixture.postIds[1]!, fixture.postIds[0]!),
        )
        expect(partialAdmission).toMatchObject({
          data: { cursor: fixture.postIds[1], admittedThrough: fixture.postIds[0] },
        })
        await processImageDeletionPage(fixture.imageId)
        await expect(Promise.all(fixture.postIds.map(countPostImageRevisions))).resolves.toEqual([
          1, 1, 0,
        ])
        await expect(
          Promise.all(fixture.postIds.slice(0, 2).map(getPostModerationResetState)),
        ).resolves.toEqual(committed)
        expect(storage.calls).toEqual([])
        await processImageDeletionPage(fixture.imageId)
        await expect(Promise.all(fixture.postIds.map(countPostImageRevisions))).resolves.toEqual([
          1, 1, 1,
        ])
        expect(storage.calls.some(call => call.Key === fixture.imageId)).toBe(true)
      } finally {
        restoreSmaller()
      }
    } finally {
      restore()
      storage.restore()
    }
  })

  it('keeps a failed middle page fenced, resumes without resetting completed posts, and matches one-page deletion', async () => {
    const paged = await createImageDeletionFixture()
    const baseline = await createImageDeletionFixture()
    await markTestImageUploadStaged(paged.imageId)
    const images = await Promise.all(
      [paged, baseline].map(fixture => getImageByIdFromPrimary(fixture.imageId)),
    )
    const storage = installOwnedUploadCleanupStorage(
      images.flatMap(image => [image!.id, image!.s3_key, image!.sha_256!.toString('hex')]),
    )
    const transactions = captureImageDeletionTransactions()
    const restore = overrideDynamicConfigFieldsForTest(imagesWorkConfig, { deletion_page_size: 1 })
    try {
      await deleteImageById(paged.imageId, { beginTransaction: transactions.beginTransaction })
      expect(transactions.statements[0]!.join('\n')).not.toMatch(
        /lockPostPublicationPostScopes|FROM posts\b|UPDATE posts\b/i,
      )
      expect(transactions.postScopeKeys[0]).toEqual([])
      await expect(getImageByAny(paged.imageId)).resolves.toBeNull()
      await expect(Promise.all(paged.postIds.map(countPostImageRevisions))).resolves.toEqual([
        1, 0, 0,
      ])
      const firstPageState = await getPostModerationResetState(paged.postIds[0]!)
      expect(storage.calls).toEqual([])
      const continuation = await background.getJob(
        getImageDeletionPageJobId(paged.imageId, paged.postIds[0]!, paged.postIds[0]!),
      )
      expect(continuation).toMatchObject({
        data: { imageId: paged.imageId, cursor: paged.postIds[0] },
      })

      await expect(
        processImageDeletionPage(paged.imageId, {
          beginTransaction: failingImageDeletionTransaction(),
        }),
      ).rejects.toThrow('injected middle deletion page failure')
      await expect(cleanupStagedUploadSource(paged.imageId)).resolves.toBe(false)
      await expect(getImageByAny(paged.imageId)).resolves.toBeNull()
      await expect(Promise.all(paged.postIds.map(countPostImageRevisions))).resolves.toEqual([
        1, 0, 0,
      ])
      expect(storage.calls).toEqual([])

      await processImageDeletionPage(paged.imageId)
      await expect(Promise.all(paged.postIds.map(countPostImageRevisions))).resolves.toEqual([
        1, 1, 0,
      ])
      await expect(getPostModerationResetState(paged.postIds[0]!)).resolves.toEqual(firstPageState)
      expect(storage.calls).toEqual([])
      const pageJobs = (await readAllQueueJobs(entitiesListeners)).filter(
        job =>
          job.name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
          paged.postIds.includes((job.data as { id: string }).id),
      )
      expect(pageJobs.map(job => (job.data as { id: string }).id).toSorted()).toEqual(
        paged.postIds.slice(0, 2),
      )

      await processImageDeletionPage(paged.imageId)
      await processImageDeletionPage(paged.imageId)
      await expect(Promise.all(paged.postIds.map(countPostImageRevisions))).resolves.toEqual([
        1, 1, 1,
      ])
      const completed = await Promise.all(paged.postIds.map(getPostModerationResetState))
      await processImageDeletionPage(paged.imageId)
      await expect(Promise.all(paged.postIds.map(getPostModerationResetState))).resolves.toEqual(
        completed,
      )
      expect(storage.calls.some(call => call.Key === paged.imageId)).toBe(true)

      restore()
      const restoreBaseline = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
        deletion_page_size: 3,
      })
      try {
        await deleteImageById(baseline.imageId)
        await processImageDeletionPage(baseline.imageId)
        await expect(Promise.all(baseline.postIds.map(countPostImageRevisions))).resolves.toEqual([
          1, 1, 1,
        ])
        await expect(Promise.all(paged.postIds.map(readImageDeletionPostOutcome))).resolves.toEqual(
          await Promise.all(baseline.postIds.map(readImageDeletionPostOutcome)),
        )
      } finally {
        restoreBaseline()
      }
    } finally {
      restore()
      storage.restore()
    }
  })
})
