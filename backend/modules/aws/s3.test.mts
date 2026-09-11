import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { describe, expect, it } from 'vitest'
import { hasS3Credentials } from './credentials.mts'
import { S3Buckets, S3ImageUploadsClient, S3ImagesClient } from './s3.mts'

describe.skipIf(!hasS3Credentials())('S3ImagesClient', () => {
  it(
    'supports creating presigned upload URLs in test mode',
    { timeout: 30_000 },
    /* no-mistakes: integration=aws */
    async () => {
      const uploadUrl = await getSignedUrl(
        S3ImagesClient,
        new PutObjectCommand({
          Bucket: S3Buckets.images,
          Key: 'test-image',
          ContentType: 'image/png',
        }),
        { expiresIn: 60 },
      )

      const parsedUrl = new URL(uploadUrl)

      expect(parsedUrl.pathname).toContain('test-image')
      expect(parsedUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
      expect(parsedUrl.searchParams.get('X-Amz-Credential')).toBeTruthy()
      expect(parsedUrl.searchParams.get('X-Amz-Signature')).toBeTruthy()
    },
  )
})

describe.skipIf(!hasS3Credentials())('S3ImageUploadsClient', () => {
  it(
    'supports creating presigned upload URLs in test mode',
    { timeout: 30_000 },
    /* no-mistakes: integration=aws */
    async () => {
      const uploadUrl = await getSignedUrl(
        S3ImageUploadsClient,
        new PutObjectCommand({
          Bucket: S3Buckets.imageUploads,
          Key: 'test-image-upload',
          ContentType: 'image/png',
        }),
        { expiresIn: 60 },
      )

      const parsedUrl = new URL(uploadUrl)

      expect(parsedUrl.pathname).toContain('test-image-upload')
      expect(parsedUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
      expect(parsedUrl.searchParams.get('X-Amz-Credential')).toBeTruthy()
      expect(parsedUrl.searchParams.get('X-Amz-Signature')).toBeTruthy()
    },
  )
})
