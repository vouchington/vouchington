import { describe, expect, it } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { presignImageUploadUrl } from './presign-upload-url.mts'

describe('presignImageUploadUrl', () => {
  function expectNoEmptyChecksumQueryParams(uploadUrl: URL): void {
    const emptyChecksumParams = [...uploadUrl.searchParams].filter(
      ([name, value]) => name.toLowerCase().includes('checksum') && value === '',
    )
    expect(emptyChecksumParams).toHaveLength(0)
  }

  it('signs a staging upload URL without empty checksum query params', async () => {
    const uploadUrl = new URL(
      await presignImageUploadUrl({
        s3Key: 'test-image-staged',
        contentType: 'image/png',
        contentLength: 1024,
        expiresInSeconds: 60,
      }),
    )

    expect(uploadUrl.hostname).toContain(S3Buckets.imageUploads)
    expectNoEmptyChecksumQueryParams(uploadUrl)
  })
})
