import type { S3Client } from '@aws-sdk/client-s3'
import type { MediaBody } from '@vouchington/media'
import { createS3MediaObjects } from '@vouchington/media/s3'
import { createReadStream } from 'node:fs'
import { MAX_INPUT_IMAGE_BYTES } from '../config.mts'
import { S3OperationError } from '../errors.mts'
import {
  type FetchedImage,
  type ImageBody,
  type TempImageFile,
  spoolImageToTempFile,
} from '../temp-file.mts'

export async function streamToTempFile(
  stream: MediaBody,
  maxBytes: number = MAX_INPUT_IMAGE_BYTES,
): Promise<TempImageFile> {
  return spoolImageToTempFile(
    stream,
    maxBytes,
    bytes =>
      new S3OperationError(
        `Image too large: ${bytes} bytes exceeds maximum of ${maxBytes} bytes`,
        413,
      ),
  )
}

export async function fetchImageFromS3(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<FetchedImage> {
  try {
    const response = await createS3MediaObjects({ client, bucket }).getObject(key)
    if (response.contentLength != null && response.contentLength > MAX_INPUT_IMAGE_BYTES) {
      response.body.destroy?.()
      throw new S3OperationError(
        `Image too large: ${response.contentLength} bytes exceeds maximum of ${MAX_INPUT_IMAGE_BYTES} bytes`,
        413,
      )
    }

    const file = await streamToTempFile(response.body)
    const etag = response.etag || ''
    const contentType = response.contentType || 'application/octet-stream'

    return { file, etag, contentType }
  } catch (error: unknown) {
    if (error instanceof S3OperationError) {
      throw error
    }
    if (error instanceof TypeError && error.message === 'S3 returned an unreadable media body') {
      throw new S3OperationError('No body in S3 response', 404)
    }
    if (
      (error as { name?: string }).name === 'NoSuchKey' ||
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
    ) {
      throw new S3OperationError(`Image not found: ${key}`, 404)
    }
    throw new S3OperationError(`Failed to fetch image from S3: ${(error as Error).message}`, 500)
  }
}

export async function putImageToCache(
  client: S3Client,
  bucket: string,
  key: string,
  body: ImageBody,
  contentType: string,
  originEtag: string,
): Promise<void> {
  try {
    await createS3MediaObjects({ client, bucket }).putObject({
      key,
      Body: Buffer.isBuffer(body) ? body : createReadStream(body.path),
      ContentType: contentType,
      StorageClass: 'ONEZONE_IA',
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        originEtag: originEtag.replaceAll('"', ''),
      },
    })
  } catch (error: unknown) {
    throw new S3OperationError(`Failed to write to cache: ${(error as Error).message}`, 500)
  }
}
