import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageById } from './get.mts'
import { deriveUploadStatus } from './get-upload-state.mts'
import type { PrivateUser } from '@voucha/types/entities/user'
import { MediaError } from '@vouchington/media'
import { S3Buckets } from '@modules/aws'

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

  it('should create a presigned upload URL', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024 * 1024, // 1MB
    })

    const uploadUrl = new URL(result.upload_url)

    expect(result.image_id).toBeDefined()
    expect(uploadUrl.pathname).toContain(result.image_id)
    expect(uploadUrl.hostname).toContain(S3Buckets.imageUploads)
    expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(uploadUrl.searchParams.get('X-Amz-Credential')).toBeTruthy()
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(uploadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).not.toContain('x-amz-checksum')
    expectNoEmptyChecksumQueryParams(uploadUrl)
    expect(result.expires_at).toBeDefined()

    // Verify expiration is ~1 hour from now
    const expiresAt = new Date(result.expires_at)
    const now = new Date()
    const diffMinutes = (expiresAt.getTime() - now.getTime()) / 1000 / 60
    expect(diffMinutes).toBeGreaterThan(55)
    expect(diffMinutes).toBeLessThan(65)
  })

  it('should reject unsupported formats', async () => {
    await expect(
      createImageUploadUrl(user, {
        contentType: 'application/pdf',
        contentLength: 1024,
      }),
    ).rejects.toThrow('Unsupported format: pdf')
  })

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
    const formats = ['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif', 'heif', 'heic']

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

    expect(image).toBeDefined()
    expect(deriveUploadStatus(image)).toBe('pending')
    expect(image.created_by_id).toBe(user.id)
    expect(image.s3_key).toBe(result.image_id)
    expect(image.sha_256).toBeNull()
    expect(image.upload_staged_at).toBeInstanceOf(Date)
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

  it('preserves media errors outside the image validation contract', async () => {
    const error = new MediaError('POLICY_INVALID', 'Invalid upload policy')

    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
        dependencies: {
          presignImageUploadUrl: async () => {
            throw error
          },
        },
      }),
    ).rejects.toBe(error)
  })
})
