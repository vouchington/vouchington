import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, hasTestRetainedImageIdentity } from '@voucha/test-helpers'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageById } from './get.mts'
import { deriveUploadStatus } from './get-upload-state.mts'
import type { PrivateUser } from '@voucha/types/entities/user'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { S3Buckets, S3ImageUploadsClient } from '@modules/aws'

const NOW = Date.UTC(2026, 0, 31, 23, 59, 59)

describe('createImageUploadUrl', () => {
  let user: PrivateUser

  function expectNoEmptyChecksumQueryParams(uploadUrl: URL): void {
    const emptyChecksumParams = [...uploadUrl.searchParams].filter(
      ([name, value]) => name.toLowerCase().includes('checksum') && value === '',
    )
    expect(emptyChecksumParams).toHaveLength(0)
  }

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create a presigned upload URL', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024 * 1024, // 1MB
    })

    const uploadUrl = new URL(result.upload_url)

    expect(result.image_id).toBeDefined()
    expect(uploadUrl.pathname).toContain(result.image_id)
    expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(uploadUrl.searchParams.get('X-Amz-Credential')).toBeTruthy()
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(uploadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).not.toContain('x-amz-checksum')
    expectNoEmptyChecksumQueryParams(uploadUrl)
    expect(result.expires_at).toBeDefined()

    expect(result.expires_at).toBe(new Date(NOW + 3600 * 1000).toISOString())
  })

  it('accepts an upload through the presigned URL into the uploads bucket', async () => {
    vi.useRealTimers()
    const body = Buffer.from('presigned upload body')
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: body.length,
    })

    const response = await fetch(result.upload_url, {
      method: 'PUT',
      headers: { 'content-type': result.content_type },
      body,
    })
    expect(response.status).toBe(200)

    const stored = await S3ImageUploadsClient.send(
      new HeadObjectCommand({ Bucket: S3Buckets.imageUploads, Key: result.image_id }),
    )
    expect(stored).toMatchObject({ ContentLength: body.length, ContentType: 'image/jpeg' })
  })

  it('should reject unsupported formats', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'application/pdf',
        contentLength: 1024,
      }),
    ).rejects.toThrow('Unsupported format: pdf')
  })

  it.each(['text/jpeg', 'application/png', 'image/jpeg/extra'])(
    'rejects an unaccepted complete media type: %s',
    async contentType => {
      await expect(
        createImageUploadUrl(user, { contentType, contentLength: 1024 }),
      ).rejects.toMatchObject({ status: 400 })
    },
  )

  it('should preserve invalid content type message', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/',
        contentLength: 1024,
      }),
    ).rejects.toThrow('Invalid content type: image/')
  })

  it('should reject images larger than 50MB', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 51 * 1024 * 1024,
      }),
    ).rejects.toThrow('Image too large (max 50MB)')
  })

  it('should support all allowed image formats', async () => {
    const formats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'avif', 'heif', 'heic']

    for (const format of formats) {
      const result = await createImageUploadUrl(user, {
        contentType: `image/${format}`,
        contentLength: 1024,
      })

      const uploadUrl = new URL(result.upload_url)

      expect(result.image_id).toBeDefined()
      expect(uploadUrl.pathname).toContain(result.image_id)
      expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
      expect(uploadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy()
      expectNoEmptyChecksumQueryParams(uploadUrl)
    }
  })

  it('should create database record with pending status', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    // Verify via getImageById instead of direct DB access
    const image = await getImageById(result.image_id)

    expect(image).not.toBeNull()
    if (!image) throw new Error('Expected pending image upload')
    expect(deriveUploadStatus(image)).toBe('pending')
    expect(image.created_by_id).toBe(user.id)
    expect(image.s3_key).toBe(result.image_id)
    expect(image.sha_256).toBeNull()
    expect(image.upload_staged_at).toBeInstanceOf(Date)
    expect(await hasTestRetainedImageIdentity(result.image_id)).toBe(true)
  })

  it('should normalize content type and return it', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg; charset=utf-8',
      contentLength: 1024,
    })

    expect(result.content_type).toBe('image/jpeg')
  })

  it('should handle content type with spaces', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: '  IMAGE/PNG  ',
      contentLength: 1024,
    })

    expect(result.content_type).toBe('image/png')
  })

  it('should reject zero content length', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 0,
      }),
    ).rejects.toThrow('Content length must be greater than 0')
  })

  it('should reject negative content length', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: -100,
      }),
    ).rejects.toThrow('Content length must be greater than 0')
  })

  it('should reject non-integer content length', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024.5,
      }),
    ).rejects.toThrow('Content length must be an integer')
  })
})
