import { type MediaBody, withTemporaryMediaFile } from '@vouchington/media'
import sharp from 'sharp'
import createHttpError from 'http-errors'
import { getImageByIdFromPrimary } from '@services/images/get'
import { getImageFromS3 } from '@services/images/s3'
import { SUPPORTED_IMAGE_FORMATS } from '@services/images/constants'
import { finalizeImageMetadata, markImageUploadFailed } from '@services/images/upload-state'
import { deriveUploadStatus } from '@services/images/get-upload-state'
import { enqueueOnImageCreated } from '@queues/entity-listeners/enqueues'
import onError from '@modules/on-error'
import { unrecoverable } from '@vouchington/queue-errors'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { publishFailedImageState } from './publish-failed-image-state.mts'

type ReportableError = Error & {
  tags?: Record<string, string | number | boolean>
  extra?: Record<string, unknown>
}

interface ExtractedMetadata {
  format?: string
  width?: number
  height?: number
  size?: number
  [key: string]: unknown
}

async function readS3Body(s3Key: string): Promise<MediaBody> {
  const s3Response = await getImageFromS3(getDeployEnvironment(), s3Key)
  if (!s3Response.Body) {
    throw new Error('S3 response body is empty')
  }
  return s3Response.Body as unknown as MediaBody
}

export async function processExtractImageMetadata(imageId: string): Promise<void> {
  const image = await getImageByIdFromPrimary(imageId)
  if (!image) return
  const uploadStatus = deriveUploadStatus(image)
  if (uploadStatus === 'complete') return
  if (uploadStatus !== 'processing') {
    unrecoverable(
      new Error(`Cannot extract metadata for image ${imageId} in upload_status=${uploadStatus}`),
    )
  }
  const canonicalS3Key = image.sha_256?.toString('hex')
  if (!canonicalS3Key || image.s3_key !== canonicalS3Key) {
    const error = new Error(`Image ${imageId} does not have an immutable final S3 key`)
    await failImageMetadata(imageId, error.message)
    unrecoverable(error)
  }

  let shouldEnqueueImageCreated = false
  try {
    // ast-grep-ignore: no-three-sequential-awaits -- the S3 body supplies the temporary file; its extracted metadata supplies the finalized image transition
    const body = await readS3Body(canonicalS3Key)
    const metadata = await withTemporaryMediaFile(
      body,
      async filename => {
        const sharpMetadata = await sharp(filename).metadata()
        const extractedMetadata: ExtractedMetadata = { ...sharpMetadata }

        if (
          !extractedMetadata.format ||
          !SUPPORTED_IMAGE_FORMATS.includes(extractedMetadata.format)
        ) {
          throw createHttpError(415, `Unsupported format: ${extractedMetadata.format}`)
        }
        return extractedMetadata
      },
      { prefix: 'image-extract-' },
    )

    const { rowCount } = await finalizeImageMetadata(imageId, metadata)
    if (rowCount === 0) return

    shouldEnqueueImageCreated = true
    imageStatePubSub
      .publish(imageId, {
        id: imageId,
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      })
      .catch(onError)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await failImageMetadata(imageId, errorMessage)
    throw err
  }

  if (shouldEnqueueImageCreated) {
    try {
      await enqueueOnImageCreated(imageId)
    } catch (err) {
      const reportError = (
        err instanceof Error
          ? err
          : new Error('Failed to enqueue image-created listener', { cause: err })
      ) as ReportableError
      reportError.tags = { imageId }
      reportError.extra = {
        s3Key: image.s3_key,
        context: 'extractImageMetadata.enqueueOnImageCreated',
      }
      onError(reportError)
    }
  }
}

async function failImageMetadata(imageId: string, errorMessage: string): Promise<void> {
  await markImageUploadFailed(imageId, errorMessage)
  await publishFailedImageState(
    imageId,
    errorMessage,
    (id, state) => imageStatePubSub.publish(id, state),
    onError,
  )
}
