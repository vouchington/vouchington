import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  markImageDeleted,
  setImageHashAndProcessing,
  setImageIdAndUploadStatus,
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

    // Manually backdate the image by setting its ID to an old UUIDv7
    // UUIDv7 encodes timestamp in the first 48 bits
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    const oldId = generateOldUuidV7(oldTimestamp)

    // Update the image with the old ID
    await setImageIdAndUploadStatus(result.image_id, oldId)

    // Mock S3 delete to avoid actual S3 operations
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    // Run cleanup
    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBe(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: oldId,
        s3_key: result.image_id,
        upload_staged_at: expect.any(Date),
      }),
    )

    // Verify the image was deleted from the database
    const deletedImage = await getImageById(oldId)
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
    const oldId = generateOldUuidV7(oldTimestamp)

    await setImageIdAndUploadStatus(result.image_id, oldId, 'processing')
    const sha256 = randomBytes(32)
    await setTestImageHashWhileProcessing(oldId, sha256)

    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBe(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: oldId, sha_256: sha256, upload_staged_at: expect.any(Date) }),
    )

    const deletedImage = await getImageById(oldId)
    expect(deletedImage).toBeNull()
    expect((await getImageById(oldId, true))?.sha_256).toBeNull()
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
    const oldId = generateOldUuidV7(oldTimestamp)

    await setImageIdAndUploadStatus(result.image_id, oldId, 'complete')

    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    await cleanupAbandonedUploads()

    expect(deleteFromS3Spy).not.toHaveBeenCalled()

    const image = await getImageById(oldId)
    expect(image).toBeDefined()
    expect(image && deriveUploadStatus(image)).toBe('complete')
    expect(deleteSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ id: oldId }))
  })

  it('recovers immutable processing rows instead of deleting final media', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const oldId = generateOldUuidV7(Date.now() - 25 * 60 * 60 * 1000)
    await setImageIdAndUploadStatus(result.image_id, oldId)
    const sha256 = randomBytes(32)
    await setImageHashAndProcessing(oldId, sha256)
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBe(0)
    expect(cleanupResult.recovered).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).not.toHaveBeenCalled()
    expect(deleteSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ id: oldId }))
    expect(await getImageById(oldId)).not.toBeNull()
    const job = (await imagesQueue.getJobs('waiting')).find(
      queued => (queued.data as { id?: string }).id === oldId,
    )
    expect(job?.data).toEqual({ id: oldId })
  })

  it('retries deleting a staged source after promotion', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const oldId = generateOldUuidV7(Date.now() - 2 * 60 * 60 * 1000)
    await setImageIdAndUploadStatus(result.image_id, oldId, 'complete')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteSourceSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: oldId, upload_staged_at: expect.any(Date) }),
    )
    expect((await getImageById(oldId))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retries deleting all known storage for a deleted staged image', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const oldId = generateOldUuidV7(Date.now() - 2 * 60 * 60 * 1000)
    await setImageIdAndUploadStatus(result.image_id, oldId, 'complete')
    await markImageDeleted(oldId)
    let failedOwnedDelete = false
    const deleteKnownSpy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockImplementation(async image => {
        if (image.id === oldId && !failedOwnedDelete) {
          failedOwnedDelete = true
          throw new Error('storage delete failed')
        }
      })

    await cleanupAbandonedUploads()

    expect((await getImageById(oldId, true))?.upload_source_deleted_at).toBeNull()

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteKnownSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: oldId, deleted_at: expect.any(Date) }),
    )
    expect((await getImageById(oldId, true))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retains a digest for cleanup retry, then releases it after storage deletion', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const oldId = generateOldUuidV7(Date.now() - 25 * 60 * 60 * 1000)
    const sha256 = randomBytes(32)
    await setImageIdAndUploadStatus(result.image_id, oldId)
    await setTestImageHashWhileProcessing(oldId, sha256)
    let deleteAttempts = 0
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockImplementation(async () => {
        deleteAttempts += 1
        if (deleteAttempts === 1) throw new Error('storage delete failed')
      })

    const firstCleanup = await cleanupAbandonedUploads()

    expect(firstCleanup.cleaned).toBe(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: oldId, sha_256: sha256 }),
    )
    expect((await getImageById(oldId, true))?.sha_256).toEqual(sha256)

    const secondCleanup = await cleanupAbandonedUploads()

    expect(secondCleanup.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: oldId, sha_256: sha256 }),
    )
    expect((await getImageById(oldId, true))?.sha_256).toBeNull()
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
      const oldId = generateOldUuidV7(oldTimestamp - i * 1000)
      await setImageIdAndUploadStatus(result.image_id, oldId)
      imageIds.push(oldId)
    }
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads()

    expect(cleanupResult.cleaned).toBe(5)
    for (const imageId of imageIds) {
      expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    }
  })
})

function generateOldUuidV7(timestamp: number): string {
  const timestampHex = timestamp.toString(16).padStart(12, '0')
  const part1 = timestampHex.slice(0, 8)
  const part2 = timestampHex.slice(8, 12)
  const part3 = Math.floor(Math.random() * 0x0fff) | 0x7000 // Version 7
  const part4 = Math.floor(Math.random() * 0x3fff) | 0x8000 // Variant 10
  const part5 = Math.floor(Math.random() * 0xffffffffffff)
  return `${part1}-${part2}-${part3.toString(16)}-${part4.toString(16)}-${part5.toString(16).padStart(12, '0')}`
}
