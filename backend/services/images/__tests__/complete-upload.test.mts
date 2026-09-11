import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertPendingTestImage,
  updateImageStatus,
  markImageComplete,
} from '@voucha/test-helpers'
import { completeImageUpload } from '../complete-upload.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import assert from 'node:assert'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('completeImageUpload', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('should return 404 for non-existent image', async () => {
    await expect(
      completeImageUpload(user, '01936f8e-8b2a-7890-a456-123456789012'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('should return 403 if user does not own the upload', async () => {
    const user1 = await createTestUser()
    assert(user1)
    const user2 = await createTestUser()
    assert(user2)
    const image_id = await insertPendingTestImage(user1.id)

    await expect(completeImageUpload(user2, image_id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('should return 409 if already processing', async () => {
    const image_id = await insertPendingTestImage(user.id)

    // Manually set to processing
    await updateImageStatus(image_id, 'processing')

    await expect(completeImageUpload(user, image_id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('should return existing image if already complete', async () => {
    const image_id = await insertPendingTestImage(user.id)

    // Manually set to complete with a valid hash
    await markImageComplete(image_id)

    const result = await completeImageUpload(user, image_id)
    expect(deriveUploadStatus(result)).toBe('complete')
    expect(result.id).toBe(image_id)
  })

  it('should reject with 400 for invalid status', async () => {
    const image_id = await insertPendingTestImage(user.id)

    // Manually set to failed
    await updateImageStatus(image_id, 'failed')

    await expect(completeImageUpload(user, image_id)).rejects.toMatchObject({
      status: 400,
    })
  })
})
