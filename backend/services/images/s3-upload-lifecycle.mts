import fs from 'node:fs/promises'
import { timingSafeEqual } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3Buckets, S3ImageUploadsClient, S3ImagesClient } from '@modules/aws'
import type { MediaBody } from '@vouchington/media'
import { freezeImageUpload } from './freeze-upload.mts'

export interface ImageUploadSourceRecord {
  id: string
  s3_key: string
  upload_staged_at: Date | null
}

interface FrozenImageFile {
  contentType?: string
  filename: string
  sha256: Buffer
}

/* no-mistakes: integration=aws */
export async function getImageUploadSourceFromS3(image: ImageUploadSourceRecord) {
  return await S3ImageUploadsClient.send(
    new GetObjectCommand({
      Bucket: S3Buckets.imageUploads,
      Key: image.id,
    }),
  )
}

/* no-mistakes: integration=aws */
export async function promoteFrozenImageToS3(
  image: FrozenImageFile,
): Promise<{ created: boolean; s3Key: string }> {
  const s3Key = image.sha256.toString('hex')
  const created = await putFrozenImageToS3AtKey(s3Key, image)
  return { created, s3Key }
}

/**
 * Preserve the public image-ID key without retaining browser-controlled bytes.
 * The alias is conditionally created from the same verified frozen file as the
 * digest object and is never overwritten.
 */
export async function ensureImageDeliveryAliasInS3(
  imageId: string,
  image: FrozenImageFile,
): Promise<{ created: boolean; s3Key: string }> {
  const created = await putFrozenImageToS3AtKey(imageId, image)
  return { created, s3Key: imageId }
}

async function putFrozenImageToS3AtKey(key: string, image: FrozenImageFile): Promise<boolean> {
  try {
    await using fd = await fs.open(image.filename, 'r')
    await S3ImagesClient.send(
      new PutObjectCommand({
        Bucket: S3Buckets.images,
        Key: key,
        Body: fd.createReadStream(),
        IfNoneMatch: '*',
        ...(image.contentType ? { ContentType: image.contentType } : {}),
      }),
    )
    return true
  } catch (error) {
    if (!isPreconditionFailed(error)) throw error
  }

  const existing = await S3ImagesClient.send(
    new GetObjectCommand({ Bucket: S3Buckets.images, Key: key }),
  )
  if (!existing.Body) throw new Error(`Final image ${key} has no readable body`)
  const frozen = await freezeImageUpload(existing.Body as unknown as MediaBody)
  try {
    if (!timingSafeEqual(frozen.sha256, image.sha256)) {
      throw new Error(`Final image integrity mismatch at key ${key}`)
    }
  } finally {
    await frozen.cleanup()
  }
  return false
}

/* no-mistakes: integration=aws */
export async function deleteImageUploadSourceFromS3(image: ImageUploadSourceRecord): Promise<void> {
  await S3ImageUploadsClient.send(
    new DeleteObjectCommand({
      Bucket: S3Buckets.imageUploads,
      Key: image.id,
    }),
  )
}

/* no-mistakes: integration=aws */
export async function deleteImageDeliveryAliasFromS3(imageId: string): Promise<void> {
  await S3ImagesClient.send(
    new DeleteObjectCommand({
      Bucket: S3Buckets.images,
      Key: imageId,
    }),
  )
}

/* no-mistakes: integration=aws */
export async function deleteKnownImageStorageFromS3(
  image: ImageUploadSourceRecord & { sha_256?: Buffer | null },
): Promise<void> {
  const results = await Promise.allSettled(
    getKnownImageStorageTargets(image).map(target =>
      target.client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: target.key })),
    ),
  )
  const errors = results.flatMap(result =>
    result.status === 'rejected'
      ? [result.reason instanceof Error ? result.reason : new Error(String(result.reason))]
      : [],
  )
  if (errors.length > 0) {
    throw new AggregateError(errors, `Failed to delete storage for image ${image.id}`)
  }
}

function getKnownImageStorageTargets(
  image: ImageUploadSourceRecord & { sha_256?: Buffer | null },
): Array<{ bucket: string; client: typeof S3ImagesClient; key: string }> {
  const targets = new Map<string, { bucket: string; client: typeof S3ImagesClient; key: string }>()
  if (image.upload_staged_at !== null) {
    targets.set(`${S3Buckets.imageUploads}/${image.id}`, {
      bucket: S3Buckets.imageUploads,
      client: S3ImageUploadsClient,
      key: image.id,
    })
    if (image.s3_key !== image.id) {
      targets.set(`${S3Buckets.images}/${image.s3_key}`, {
        bucket: S3Buckets.images,
        client: S3ImagesClient,
        key: image.s3_key,
      })
    }
  } else {
    targets.set(`${S3Buckets.images}/${image.s3_key}`, {
      bucket: S3Buckets.images,
      client: S3ImagesClient,
      key: image.s3_key,
    })
  }
  if (image.sha_256) {
    const digestKey = image.sha_256.toString('hex')
    targets.set(`${S3Buckets.images}/${digestKey}`, {
      bucket: S3Buckets.images,
      client: S3ImagesClient,
      key: digestKey,
    })
    targets.set(`${S3Buckets.images}/${image.id}`, {
      bucket: S3Buckets.images,
      client: S3ImagesClient,
      key: image.id,
    })
  }
  return [...targets.values()]
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const metadata = '$metadata' in error ? error.$metadata : undefined
  return (
    (typeof metadata === 'object' &&
      metadata !== null &&
      'httpStatusCode' in metadata &&
      metadata.httpStatusCode === 412) ||
    ('name' in error && error.name === 'PreconditionFailed')
  )
}
