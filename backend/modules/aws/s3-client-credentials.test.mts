import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupCredentialEnv } from '@voucha/test-helpers/modules/aws/credentials-fixtures'
import { getS3ClientCredentials } from './credentials.mts'

describe('getS3ClientCredentials', () => {
  const { setEnv } = setupCredentialEnv()

  it('uses configured credentials including their session token', () => {
    setEnv('S3_AWS_ACCESS_KEY_ID', 'real-s3-key')
    setEnv('S3_AWS_SECRET_ACCESS_KEY', 'real-s3-secret')
    setEnv('S3_AWS_SESSION_TOKEN', 'owned-session-token')

    expect(getS3ClientCredentials()).toEqual({
      accessKeyId: 'real-s3-key',
      secretAccessKey: 'real-s3-secret',
      sessionToken: 'owned-session-token',
    })
  })

  it('requires credentials for local S3-backed features', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ENVIRONMENT', 'development')

    expect(() => getS3ClientCredentials()).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('S3 credentials are not configured'),
        status: 503,
      }),
    )
  })

  it('uses IAM task roles in deployed environments', () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    expect(getS3ClientCredentials()).toBeUndefined()
  })
})

describe('S3 runtime configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('rejects a missing required bucket at module initialization', async () => {
    vi.stubEnv('S3_BUCKET_IMAGES', ' ')
    vi.resetModules()

    await expect(import('./s3.mts')).rejects.toThrow('Missing S3_BUCKET_IMAGES')
  })
})
