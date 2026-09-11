import fs from 'node:fs/promises'
import {
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { getS3EnvironmentKey, S3Buckets, S3ImagesClient } from '@modules/aws'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'

/**
 * Local subset of sharp's `Metadata` we actually use here.
 * Avoids pulling sharp into the API container.
 */
interface ImageMetadata {
  format?: string
}

export const MIME_TYPES: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
  heif: 'image/heif',
  heic: 'image/heic',
  jp2: 'image/jp2',
  jxl: 'image/jxl',
}

interface ImageFile {
  filename: string
  hash: Buffer
  metadata: ImageMetadata
  s3Key?: string
}

interface ImageRecord {
  id?: string
  s3_key?: string
  hash?: Buffer
  sha_256?: Buffer | null
  upload_staged_at?: Date | null
}

/* no-mistakes: integration=aws */
export const uploadImageToS3 = async (image: ImageFile) => {
  await using fd = await fs.open(image.filename, 'r')
  const command = new PutObjectCommand({
    Bucket: S3Buckets.images,
    Key: image.s3Key || image.hash.toString('hex'),
    Body: fd.createReadStream(),
    ContentType:
      (image.metadata.format && MIME_TYPES[image.metadata.format]) || 'application/octet-stream',
  })

  return await S3ImagesClient.send(command)
}

/* no-mistakes: integration=aws */
export async function deleteImagesFromS3(images: ImageRecord[]): Promise<void> {
  const objects = images.map(image => {
    const key = image.s3_key || (image.hash || image.sha_256)?.toString('hex')
    if (!key) throw new Error('No S3 key or hash provided for deletion')
    return { Key: key }
  })
  if (objects.length === 0) return

  const errors: Error[] = []
  for (let offset = 0; offset < objects.length; offset += 1000) {
    const chunk = objects.slice(offset, offset + 1000)
    try {
      // oxlint-disable-next-line no-await-in-loop -- S3 accepts at most 1,000 objects per delete request, and every bounded chunk must be attempted.
      const result = await S3ImagesClient.send(
        new DeleteObjectsCommand({
          Bucket: S3Buckets.images,
          Delete: { Objects: chunk, Quiet: true },
        }),
      )
      errors.push(
        ...(result.Errors ?? []).map(
          error =>
            new Error(
              `Failed to delete image ${error.Key ?? 'unknown'}: ${error.Message ?? error.Code}`,
            ),
        ),
      )
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to delete one or more images from S3')
  }
}

/* no-mistakes: integration=aws */
export const getImageFromS3 = async (env: string, key: string) => {
  const bucket = getImageReadBucket(env)

  return await S3ImagesClient.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}

/* no-mistakes: integration=aws */
export async function copyImageToQuarantine(image: { s3_key: string }): Promise<void> {
  await S3ImagesClient.send(
    new CopyObjectCommand({
      Bucket: S3Buckets.quarantine,
      Key: image.s3_key,
      CopySource: `${S3Buckets.images}/${image.s3_key}`,
    }),
  )
}

/* no-mistakes: integration=aws */
export async function deleteImageRenders(s3Key: string): Promise<void> {
  const list = await S3ImagesClient.send(
    new ListObjectsV2Command({
      Bucket: S3Buckets.renders,
      Prefix: `${s3Key}--`,
    }),
  )
  const objects = list.Contents?.filter(obj => obj.Key != null) ?? []
  if (objects.length === 0) return
  await S3ImagesClient.send(
    new DeleteObjectsCommand({
      Bucket: S3Buckets.renders,
      Delete: {
        Objects: objects.map(obj => ({ Key: obj.Key! })),
        Quiet: true,
      },
    }),
  )
}

export function getImageReadBucket(env: string, currentEnv = getDeployEnvironment()): string {
  const requestedEnvKey = getS3EnvironmentKey(env)
  if (requestedEnvKey !== getS3EnvironmentKey(currentEnv)) {
    throw new Error('Cross-environment image reads are disabled')
  }
  return S3Buckets.images
}
