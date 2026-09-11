import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = ['NODE_ENV', 'S3_BUCKET_IMAGES', 'VITEST'] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>

describe('getImageReadBucket', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
    process.env.VITEST = 'true'
  })

  afterEach(() => {
    restoreEnv()
  })

  it('uses S3_BUCKET_IMAGES when reading from the active environment', async () => {
    process.env.NODE_ENV = 'development'
    process.env.S3_BUCKET_IMAGES = 'custom-images-bucket'
    const { getImageReadBucket } = await import('../s3.mts')

    expect(getImageReadBucket('development')).toBe('custom-images-bucket')
  })

  it('rejects cross-environment reads instead of resolving private bucket topology', async () => {
    process.env.NODE_ENV = 'development'
    process.env.S3_BUCKET_IMAGES = 'custom-images-bucket'
    const { getImageReadBucket } = await import('../s3.mts')

    expect(() => getImageReadBucket('staging')).toThrow(
      'Cross-environment image reads are disabled',
    )
  })
})

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}
