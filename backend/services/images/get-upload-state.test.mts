import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertPendingTestImage,
  insertTestImage,
  markImageDeleted,
  markImageModerationFlagged,
  updateImageStatus,
} from '@voucha/test-helpers'
import { getImageUploadState, deriveUploadStatus } from './get-upload-state.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('deriveUploadStatus', () => {
  it('returns pending when all timestamps are null', () => {
    expect(
      deriveUploadStatus({
        upload_started_at: null,
        upload_completed_at: null,
        upload_failed_at: null,
      }),
    ).toBe('pending')
  })

  it('returns processing when only upload_started_at is set', () => {
    expect(
      deriveUploadStatus({
        upload_started_at: new Date(),
        upload_completed_at: null,
        upload_failed_at: null,
      }),
    ).toBe('processing')
  })

  it('returns complete when upload_completed_at is set', () => {
    expect(
      deriveUploadStatus({
        upload_started_at: new Date(),
        upload_completed_at: new Date(),
        upload_failed_at: null,
      }),
    ).toBe('complete')
  })

  it('returns failed when upload_failed_at is set', () => {
    expect(
      deriveUploadStatus({
        upload_started_at: new Date(),
        upload_completed_at: null,
        upload_failed_at: new Date(),
      }),
    ).toBe('failed')
  })
})

describe('getImageUploadState', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('throws 404 for missing image', async () => {
    await expect(
      getImageUploadState(user.id, '01936f8e-8b2a-7890-a456-123456789012'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 (not 403) when user does not own the image', async () => {
    const otherUser = await createTestUser()
    const image_id = await insertPendingTestImage(otherUser.id)

    await expect(getImageUploadState(user.id, image_id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('returns pending state for fresh upload URL', async () => {
    const image_id = await insertPendingTestImage(user.id)

    const state = await getImageUploadState(user.id, image_id)
    expect(state).toMatchObject({
      id: image_id,
      upload_status: 'pending',
      ready: false,
      blocked: false,
      upload_error: null,
    })
  })

  it('returns processing state', async () => {
    const image_id = await insertPendingTestImage(user.id)
    await updateImageStatus(image_id, 'processing')

    const state = await getImageUploadState(user.id, image_id)
    expect(state.upload_status).toBe('processing')
    expect(state.ready).toBe(false)
    expect(state.blocked).toBe(false)
  })

  it('returns ready=false when complete but moderation has not yet run', async () => {
    const image_id = await insertPendingTestImage(user.id)
    await updateImageStatus(image_id, 'complete')

    const state = await getImageUploadState(user.id, image_id)
    expect(state.upload_status).toBe('complete')
    expect(state.ready).toBe(false)
    expect(state.blocked).toBe(false)
  })

  it('returns ready=true for complete + moderated + not deleted', async () => {
    const imageId = await insertTestImage(user.id)

    const state = await getImageUploadState(user.id, imageId)
    expect(state.upload_status).toBe('complete')
    expect(state.ready).toBe(true)
    expect(state.blocked).toBe(false)
  })

  it('returns blocked=true when moderation has flagged the image even before delete runs', async () => {
    const imageId = await insertTestImage(user.id)
    await markImageModerationFlagged(imageId)

    const state = await getImageUploadState(user.id, imageId)
    expect(state.upload_status).toBe('complete')
    expect(state.ready).toBe(false)
    expect(state.blocked).toBe(true)
  })

  it('returns blocked=true once moderation soft-deletes the image', async () => {
    const imageId = await insertTestImage(user.id)
    await markImageDeleted(imageId)

    const state = await getImageUploadState(user.id, imageId)
    expect(state.blocked).toBe(true)
    expect(state.ready).toBe(false)
  })

  it('returns failed state with upload_error', async () => {
    const image_id = await insertPendingTestImage(user.id)
    await updateImageStatus(image_id, 'failed')

    const state = await getImageUploadState(user.id, image_id)
    expect(state.upload_status).toBe('failed')
    expect(state.ready).toBe(false)
    expect(state.blocked).toBe(false)
  })
})
