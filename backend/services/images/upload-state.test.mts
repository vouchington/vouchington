import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertPendingTestImage, updateImageStatus } from '@voucha/test-helpers'
import { getImageById } from './get.mts'
import { markImageUploadFailed, finalizeImageMetadata } from './upload-state.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('markImageUploadFailed', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('sets upload_failed_at and upload_error on a processing image', async () => {
    const image_id = await insertPendingTestImage(user.id)
    await updateImageStatus(image_id, 'processing')

    await markImageUploadFailed(image_id, 'something went wrong')

    const image = await getImageById(image_id)
    expect(image?.upload_failed_at).toBeTruthy()
    expect(image?.upload_error).toBe('something went wrong')
    expect(image?.upload_completed_at).toBeNull()
  })

  it('preserves the first failure timestamp on re-entry (WHERE no-op)', async () => {
    const image_id = await insertPendingTestImage(user.id)
    await updateImageStatus(image_id, 'processing')

    await markImageUploadFailed(image_id, 'first error')
    const after1 = await getImageById(image_id)
    const firstFailedAt = after1?.upload_failed_at

    // Second call should not overwrite upload_failed_at (COALESCE guard)
    await markImageUploadFailed(image_id, 'second error')
    const after2 = await getImageById(image_id)
    expect(after2?.upload_failed_at?.getTime()).toBe(firstFailedAt?.getTime())
    expect(after2?.upload_error).toBe('first error')
  })

  it('is a no-op for a pending image (not yet in processing)', async () => {
    const image_id = await insertPendingTestImage(user.id)

    await markImageUploadFailed(image_id, 'should not apply')

    const image = await getImageById(image_id)
    expect(image?.upload_failed_at).toBeNull()
    expect(image?.upload_error).toBeNull()
  })
})

describe('finalizeImageMetadata', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('sets upload_completed_at on a processing image and returns rowCount 1', async () => {
    const image_id = await insertPendingTestImage(user.id)
    await updateImageStatus(image_id, 'processing')

    const { rowCount } = await finalizeImageMetadata(image_id, {
      format: 'jpeg',
      width: 100,
      height: 100,
    })
    expect(rowCount).toBe(1)

    const image = await getImageById(image_id)
    expect(image?.upload_completed_at).toBeTruthy()
    expect(image?.upload_failed_at).toBeNull()
    expect(image?.data).toMatchObject({ format: 'jpeg', width: 100, height: 100 })
  })

  it('returns rowCount 0 for a non-processing image (idempotent)', async () => {
    const image_id = await insertPendingTestImage(user.id)

    const { rowCount } = await finalizeImageMetadata(image_id, { format: 'jpeg' })
    expect(rowCount).toBe(0)
  })
})
