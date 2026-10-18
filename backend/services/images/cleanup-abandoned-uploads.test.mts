import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageById } from './get.mts'
import { deriveUploadStatus } from './get-upload-state.mts'
import { randomBytes } from 'node:crypto'

import * as s3Module from './s3-upload-lifecycle.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('cleanupAbandonedUploads', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should cleanup pending uploads older than 24 hours', async () => {
    // Create a new upload
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    const now = new Date()
    const oldTimestamp = now.getTime() - 25 * 60 * 60 * 1000 // 25 hours ago
    await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp))

    // Mock S3 delete to avoid actual S3 operations
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    // Run cleanup
    const cleanupResult = await cleanupAbandonedUploads({
      imageIds: [result.image_id],
      now: new Date(now.getTime()),
    })

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

    const now = new Date()
    // Backdate and set to processing
    const oldTimestamp = now.getTime() - 25 * 60 * 60 * 1000
    await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp), 'processing')
    const sha256 = randomBytes(32)
    await setTestImageHashWhileProcessing(result.image_id, sha256)

    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads({
      imageIds: [result.image_id],
      now: new Date(now.getTime()),
    })

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
    const now = new Date()

    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')

    await cleanupAbandonedUploads({ imageIds: [result.image_id], now: new Date(now.getTime()) })

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
    const now = new Date()

    // Backdate and set to complete
    const oldTimestamp = now.getTime() - 25 * 60 * 60 * 1000
    await backdateImageUploadStagedAt(result.image_id, new Date(oldTimestamp), 'complete')

    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    await cleanupAbandonedUploads({ imageIds: [result.image_id], now: new Date(now.getTime()) })

    expect(deleteFromS3Spy).not.toHaveBeenCalled()

    const image = await getImageById(result.image_id)
    expect(image).toBeDefined()
    expect(image && deriveUploadStatus(image)).toBe('complete')
    expect(deleteSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ id: result.image_id }))
  })

  it('cleans a bounded batch of old uploads', async () => {
    const now = new Date()
    const oldTimestamp = now.getTime() - 25 * 60 * 60 * 1000
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

    const cleanupResult = await cleanupAbandonedUploads({ imageIds, now: new Date(now.getTime()) })

    expect(cleanupResult.cleaned).toBeGreaterThanOrEqual(5)
    for (const imageId of imageIds) {
      expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    }
  })
})
