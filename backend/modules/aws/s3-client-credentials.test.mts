import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildS3Buckets, getS3ClientCredentials } from './s3.mts'

const ENV_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'S3_AWS_ACCESS_KEY_ID',
  'S3_AWS_SECRET_ACCESS_KEY',
  'S3_AWS_SESSION_TOKEN',
  'NODE_ENV',
  'VITEST',
  'S3_BUCKET_IMAGES',
  'S3_BUCKET_IMAGE_UPLOADS',
] as const

const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>

// getS3ClientCredentials() re-reads process.env on every call (no module-load-time state), so
// these tests mutate process.env directly against the static import above rather than
// re-importing via vi.resetModules() — a dynamic re-import here would race sibling test files'
// static `import ... from './s3.mts'` the same way the env-key/bucket tests below used to.
describe('getS3ClientCredentials', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    restoreEnv()
  })

  afterAll(() => {
    restoreEnv()
  })

  it('uses deterministic credentials for test S3 clients when no AWS env exists', () => {
    process.env.NODE_ENV = 'test'

    expect(getS3ClientCredentials()).toEqual({
      accessKeyId: 'test-s3-access-key-id',
      secretAccessKey: 'test-s3-secret-access-key',
    })
  })

  it('uses deterministic credentials in Vitest even when NODE_ENV is stubbed', () => {
    process.env.NODE_ENV = 'development'
    process.env.VITEST = 'true'

    expect(getS3ClientCredentials()).toEqual({
      accessKeyId: 'test-s3-access-key-id',
      secretAccessKey: 'test-s3-secret-access-key',
    })
  })

  it('still prefers configured S3 credentials in test mode', () => {
    process.env.NODE_ENV = 'test'
    process.env.S3_AWS_ACCESS_KEY_ID = 'real-s3-key'
    process.env.S3_AWS_SECRET_ACCESS_KEY = 'real-s3-secret'

    expect(getS3ClientCredentials()).toEqual({
      accessKeyId: 'real-s3-key',
      secretAccessKey: 'real-s3-secret',
    })
  })

  it('requires configured S3 credentials outside test mode', () => {
    process.env.NODE_ENV = 'development'

    const error = getThrownError(() => getS3ClientCredentials())
    expect(error).toMatchObject({
      message: expect.stringContaining('S3 credentials are not configured'),
      status: 503,
    })
  })

  it('falls back to IAM task role credentials in deployed environments', () => {
    expect(
      getS3ClientCredentials({ ENVIRONMENT: 'staging', NODE_ENV: 'production' }),
    ).toBeUndefined()
  })
})

describe('buildS3Buckets', () => {
  const injected = {
    S3_BUCKET_IMAGES: 'runtime-images',
    S3_BUCKET_IMAGE_UPLOADS: 'runtime-image-uploads',
    S3_BUCKET_SITEMAPS: 'runtime-sitemaps',
    S3_BUCKET_RENDERS: 'runtime-renders',
    S3_BUCKET_ASSETS: 'runtime-assets',
    S3_BUCKET_CRAWLS: 'runtime-crawls',
    S3_BUCKET_USER_EXPORTS: 'runtime-user-exports',
    S3_BUCKET_QUARANTINE: 'runtime-quarantine',
  }

  it('uses only injected runtime bucket names outside tests', () => {
    expect(buildS3Buckets({ ...injected, ENVIRONMENT: 'staging' })).toEqual({
      images: 'runtime-images',
      imageUploads: 'runtime-image-uploads',
      sitemaps: 'runtime-sitemaps',
      renders: 'runtime-renders',
      assets: 'runtime-assets',
      crawls: 'runtime-crawls',
      userExports: 'runtime-user-exports',
      quarantine: 'runtime-quarantine',
    })
  })

  it('fails without every injected bucket outside tests', () => {
    expect(() =>
      buildS3Buckets({ ...injected, S3_BUCKET_IMAGES: '', ENVIRONMENT: 'staging' }),
    ).toThrow('Missing S3_BUCKET_IMAGES')
  })

  it('uses identifier-free synthetic buckets in Vitest', () => {
    expect(buildS3Buckets({ NODE_ENV: 'test' })).toMatchObject({
      images: 'test-images',
      renders: 'test-renders',
    })
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

function getThrownError(fn: () => unknown): Error {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error) return error
  }

  throw new Error('Expected function to throw')
}
