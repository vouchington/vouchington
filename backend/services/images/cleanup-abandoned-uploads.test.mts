import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  markImageDeleted,
  setImageHashAndProcessing,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageByHash, getImageById } from './get.mts'
import { deriveUploadStatus } from './get-upload-state.mts'

import * as s3Module from './s3-upload-lifecycle.mts'
import type { PrivateUser } from '@voucha/types/entities/user'
import { imagesQueue } from '@queues/images/queues'
import { randomBytes } from 'node:crypto'

describe('cleanupAbandonedUploads', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    return imagesQueue.obliterate({ force: true })
  })
  it('should cleanup pending uploads older than 24 hours', async () => {
    // Create a new upload
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp))

    // Mock S3 delete to avoid actual S3 operations
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    // Run cleanup
    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.image_id,
        s3_key: result.image_id,
        upload_staged_at: expect.any(Date),
      }),
    )

    // Verify the image was deleted from the database
    const deletedImage = await getImageById(result.image_id)
    expect(deletedImage).toBeNull()
  })

  it('should cleanup processing uploads older than 24 hours', async () => {
    // Create a new upload
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    // Backdate and set to processing
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000
    await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp), 'processing')
    const sha256 = randomBytes(32)
    await setTestImageHashWhileProcessing(result.image_id, sha256)

    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.image_id,
        sha_256: sha256,
        upload_staged_at: expect.any(Date),
      }),
    )

    const deletedImage = await getImageById(result.image_id)
    expect(deletedImage).toBeNull()
    expect((await getImageById(result.image_id, true))?.sha_256).toBeNull()
  })

  it('should not cleanup recent pending uploads', async () => {
    // Create a recent upload (should not be cleaned up)
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')

    await cleanupAbandonedUploads()

    expect(deleteFromS3Spy).not.toHaveBeenCalled()

    const image = await getImageById(result.image_id)
    expect(image).toBeDefined()
    expect(image && deriveUploadStatus(image)).toBe('pending')
  })

  it('should not cleanup completed uploads', async () => {
    // Create an upload
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    // Backdate and set to complete
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000
    await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp), 'complete')

    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    await cleanupAbandonedUploads()

    expect(deleteFromS3Spy).not.toHaveBeenCalled()

    const image = await getImageById(result.image_id)
    expect(image).toBeDefined()
    expect(image && deriveUploadStatus(image)).toBe('complete')
    expect(deleteSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ id: result.image_id }))
  })

  it('recovers immutable processing rows instead of deleting final media', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await backdateImageUploadStagedAt(result.image_id, new Date(Date.now() - 25 * 60 * 60 * 1000))
    const sha256 = randomBytes(32)
    await setImageHashAndProcessing(result.image_id, sha256)
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.recovered).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id }),
    )
    expect(deleteSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ id: result.image_id }))
    expect(await getImageById(result.image_id)).not.toBeNull()
    const job = (await imagesQueue.getJobs('waiting')).find(
      queued => (queued.data as { id?: string }).id === result.image_id,
    )
    expect(job?.data).toEqual({ id: result.image_id })
  })

  it('retries deleting a staged source after promotion', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(Date.now() - 2 * 60 * 60 * 1000),
      'complete',
    )
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteSourceSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id, upload_staged_at: expect.any(Date) }),
    )
    expect((await getImageById(result.image_id))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retries deleting all known storage for a deleted staged image', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(Date.now() - 2 * 60 * 60 * 1000),
      'complete',
    )
    await markImageDeleted(result.image_id)
    let failedOwnedDelete = false
    const deleteKnownSpy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockImplementation(async image => {
        if (image.id === result.image_id && !failedOwnedDelete) {
          failedOwnedDelete = true
          throw new Error('storage delete failed')
        }
      })

    await cleanupAbandonedUploads()

    expect((await getImageById(result.image_id, true))?.upload_source_deleted_at).toBeNull()

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteKnownSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id, deleted_at: expect.any(Date) }),
    )
    expect((await getImageById(result.image_id, true))?.upload_source_deleted_at).toBeInstanceOf(
      Date,
    )
  })

  it('retains a digest for cleanup retry, then releases it after storage deletion', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const sha256 = randomBytes(32)
    await backdateImageUploadStagedAt(result.image_id, new Date(Date.now() - 25 * 60 * 60 * 1000))
    await setTestImageHashWhileProcessing(result.image_id, sha256)
    let deleteAttempts = 0
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockImplementation(async () => {
        deleteAttempts += 1
        if (deleteAttempts === 1) throw new Error('storage delete failed')
      })

    const firstCleanup = await cleanupAbandonedUploads()

    expect(firstCleanup.cleaned).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id, sha_256: sha256 }),
    )
    expect((await getImageById(result.image_id, true))?.sha_256).toEqual(sha256)

    const secondCleanup = await cleanupAbandonedUploads()

    expect(secondCleanup.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: result.image_id, sha_256: sha256 }),
    )
    expect((await getImageById(result.image_id, true))?.sha_256).toBeNull()
    expect(await getImageByHash(sha256, true)).toBeNull()
  })

  it('cleans a bounded batch of old uploads', async () => {
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000
    const imageIds = []
    for (let i = 0; i < 5; i++) {
      const result = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp - i * 1000))
      imageIds.push(result.image_id)
    }
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBeGreaterThanOrEqual(5)
    for (const imageId of imageIds) {
      expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    }
  })
})
