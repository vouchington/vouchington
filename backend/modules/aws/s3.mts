import { S3Client } from '@aws-sdk/client-s3'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { AWS_DUALSTACK_CLIENT_CONFIG } from '@vouchington/aws/request-handler'
import { AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'
import { getS3ClientCredentials } from './credentials.mts'

let imageUploadsClient: S3Client | undefined
let imagesClient: S3Client | undefined

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

export type S3EnvironmentKey = 'development' | 'production' | 'staging'

export function getS3EnvironmentKey(value: string | undefined): S3EnvironmentKey {
  if (value === 'production' || value === 'staging') return value
  return 'development'
}

function buildS3Buckets(): Record<keyof typeof S3_BUCKET_ENV, string> {
  return Object.fromEntries(
    Object.entries(S3_BUCKET_ENV).map(([key, name]) => {
      const value = process.env[name]?.trim()
      if (value) return [key, value]
      throw new Error(`Missing ${name}`)
    }),
  ) as Record<keyof typeof S3_BUCKET_ENV, string>
}

export const S3Buckets = buildS3Buckets()

/* no-mistakes: integration=aws */
export const S3ImagesClient = new Proxy({} as S3Client, {
  get(_, prop) {
    return getReceiverBoundProperty(getS3ImagesClient(), prop)
  },
})

function getS3ImagesClient(): S3Client {
  if (!imagesClient) {
    imagesClient = new S3Client({
      credentials: getS3ClientCredentials(),
      region: AWS_REGION,
      requestHandler: createResponseBodyBoundAwsRequestHandler(),
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return imagesClient
}

/* no-mistakes: integration=aws */
export const S3ImageUploadsClient = new Proxy({} as S3Client, {
  get(_, prop) {
    return getReceiverBoundProperty(getS3ImageUploadsClient(), prop)
  },
})

function getS3ImageUploadsClient(): S3Client {
  if (!imageUploadsClient) {
    imageUploadsClient = new S3Client({
      credentials: getS3ClientCredentials(),
      region: AWS_REGION,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      requestHandler: createResponseBodyBoundAwsRequestHandler(),
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return imageUploadsClient
}
