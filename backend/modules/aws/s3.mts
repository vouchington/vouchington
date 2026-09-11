import { S3Client } from '@aws-sdk/client-s3'
import createHttpError from 'http-errors'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION } from './config.mts'
import { getS3Credentials, hasS3Credentials } from './credentials.mts'

let imageUploadsClient: S3Client | undefined
let imagesClient: S3Client | undefined

const TEST_S3_CREDENTIALS = {
  accessKeyId: 'test-s3-access-key-id',
  secretAccessKey: 'test-s3-secret-access-key',
}

const S3_BUCKET_ENV = {
  images: 'S3_BUCKET_IMAGES',
  imageUploads: 'S3_BUCKET_IMAGE_UPLOADS',
  sitemaps: 'S3_BUCKET_SITEMAPS',
  renders: 'S3_BUCKET_RENDERS',
  assets: 'S3_BUCKET_ASSETS',
  crawls: 'S3_BUCKET_CRAWLS',
  userExports: 'S3_BUCKET_USER_EXPORTS',
  quarantine: 'S3_BUCKET_QUARANTINE',
} as const

const TEST_S3_BUCKETS: Record<keyof typeof S3_BUCKET_ENV, string> = {
  images: 'test-images',
  imageUploads: 'test-image-uploads',
  sitemaps: 'test-sitemaps',
  renders: 'test-renders',
  assets: 'test-assets',
  crawls: 'test-crawls',
  userExports: 'test-user-exports',
  quarantine: 'test-quarantine',
}

export type S3EnvironmentKey = 'development' | 'production' | 'staging'

export function getS3EnvironmentKey(value: string | undefined): S3EnvironmentKey {
  if (value === 'production' || value === 'staging') return value
  return 'development'
}

export function buildS3Buckets(
  env: NodeJS.ProcessEnv = process.env,
): Record<keyof typeof S3_BUCKET_ENV, string> {
  return Object.fromEntries(
    Object.entries(S3_BUCKET_ENV).map(([key, name]) => {
      const value = env[name]?.trim()
      if (value) return [key, value]
      if (isVitestProcess(env)) return [key, TEST_S3_BUCKETS[key as keyof typeof S3_BUCKET_ENV]]
      throw new Error(`Missing ${name}`)
    }),
  ) as Record<keyof typeof S3_BUCKET_ENV, string>
}

export const S3Buckets = buildS3Buckets()

/* no-mistakes: integration=aws */
export const S3ImagesClient = new Proxy({} as S3Client, {
  get(_, prop) {
    const target = getS3ImagesClient()
    const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
  },
})

function getS3ImagesClient(): S3Client {
  if (!imagesClient) {
    imagesClient = new S3Client({
      credentials: getS3ClientCredentials(),
      region: AWS_REGION,
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return imagesClient
}

/* no-mistakes: integration=aws */
export const S3ImageUploadsClient = new Proxy({} as S3Client, {
  get(_, prop) {
    const target = getS3ImageUploadsClient()
    const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
  },
})

function getS3ImageUploadsClient(): S3Client {
  if (!imageUploadsClient) {
    imageUploadsClient = new S3Client({
      credentials: getS3ClientCredentials(),
      region: AWS_REGION,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return imageUploadsClient
}

export function getS3ClientCredentials(env: NodeJS.ProcessEnv = process.env) {
  if (hasS3Credentials(env)) {
    return getS3Credentials(env)
  }

  if (isVitestProcess(env)) {
    return TEST_S3_CREDENTIALS
  }

  // Deployed staging/production uses OpenTofu-managed IAM task roles.
  const environment = env.ENVIRONMENT?.trim()
  if (environment === 'staging' || environment === 'production') {
    return undefined
  }

  throw createMissingS3CredentialsError(env)
}

function isVitestProcess(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' || env.VITEST === 'true'
}

function createMissingS3CredentialsError(env: NodeJS.ProcessEnv): Error & { status: 503 } {
  const localSetupMessage =
    'S3 credentials are not configured. S3-backed features such as image uploads, sitemap/crawl storage, and user exports require S3_AWS_ACCESS_KEY_ID and S3_AWS_SECRET_ACCESS_KEY in ~/voucha.env, then ./dev/initialize web.'
  const deployedMessage = 'Missing S3 credentials'
  const message = env.NODE_ENV === 'development' ? localSetupMessage : deployedMessage

  return createHttpError(503, message)
}
