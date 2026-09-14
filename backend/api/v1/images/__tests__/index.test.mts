import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertPendingTestImage, markImageComplete } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import * as createImageUploadUrlModule from '@services/images/create-upload-url'

const createImageUploadUrlSpy = vi.spyOn(createImageUploadUrlModule, 'createImageUploadUrl')

describe('POST /api/v1/images/upload-url', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create upload URL for authenticated user', async () => {
    createImageUploadUrlSpy.mockResolvedValueOnce({
      image_id: '00000000-0000-0000-0000-000000000001',
      upload_url: 'https://images.example.test/00000000-0000-0000-0000-000000000001?signature=fake',
      content_type: 'image/jpeg',
      expires_at: '2030-01-01T00:00:00.000Z',
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/images/upload-url')
      .send({
        content_type: 'image/jpeg',
        content_length: 1024 * 1024,
      })
      .expect(201)

    expect(response.body.upload.image_id).toBeDefined()
    expect(response.body.upload.upload_url).toBe(
      `https://images.example.test/${response.body.upload.image_id}?signature=fake`,
    )
    expect(response.body.upload.content_type).toBe('image/jpeg')
    expect(response.body.upload.expires_at).toBeDefined()
    expect(createImageUploadUrlSpy).toHaveBeenCalledWith(user, {
      contentType: 'image/jpeg',
      contentLength: 1024 * 1024,
    })
  })

  it('returns only the allowlisted completion response fields', async () => {
    const imageId = await insertPendingTestImage(user.id)
    await markImageComplete(imageId)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.post(`/api/v1/images/${imageId}/completions`).expect(200)

    expect(response.body).toEqual({
      image: {
        id: imageId,
        upload_status: 'complete',
      },
    })
  })
})
