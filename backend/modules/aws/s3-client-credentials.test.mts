import { describe, expect, it } from 'vitest'
import { registerClientCredentialEnvCases } from './client-credential-env-cases.mts'
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

describe('getS3ClientCredentials', () => {
  registerClientCredentialEnvCases({
    envKeys: ENV_KEYS,
    readCredentials: getS3ClientCredentials,
    serviceName: 'S3',
    accessKeyEnv: 'S3_AWS_ACCESS_KEY_ID',
    secretAccessKeyEnv: 'S3_AWS_SECRET_ACCESS_KEY',
    testAccessKeyId: 'test-s3-access-key-id',
    testSecretAccessKey: 'test-s3-secret-access-key',
    configuredAccessKeyId: 'real-s3-key',
    configuredSecretAccessKey: 'real-s3-secret',
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
