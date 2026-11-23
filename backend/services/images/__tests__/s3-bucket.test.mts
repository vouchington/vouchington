import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getImageReadBucket', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', undefined)
    vi.stubEnv('S3_BUCKET_IMAGES', undefined)
    vi.stubEnv('VITEST', 'true')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses S3_BUCKET_IMAGES when reading from the active environment', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('S3_BUCKET_IMAGES', 'custom-images-bucket')
    const { getImageReadBucket } = await import('../s3.mts')

    expect(getImageReadBucket('development')).toBe('custom-images-bucket')
  })

  it('rejects cross-environment reads instead of resolving private bucket topology', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('S3_BUCKET_IMAGES', 'custom-images-bucket')
    const { getImageReadBucket } = await import('../s3.mts')

    expect(() => getImageReadBucket('staging')).toThrow(
      'Cross-environment image reads are disabled',
    )
  })
})
