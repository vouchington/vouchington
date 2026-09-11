import { describe, expect, it } from 'vitest'
import { buildS3Buckets } from './s3.mts'

describe('buildS3Buckets', () => {
  it('uses the dedicated upload bucket when configured', () => {
    const buckets = buildS3Buckets({
      NODE_ENV: 'test',
      S3_BUCKET_IMAGE_UPLOADS: 'test-image-uploads',
      VITEST: 'true',
    })

    expect(buckets.imageUploads).toBe('test-image-uploads')
    expect(buckets.images).toBe('test-images')
  })
})
