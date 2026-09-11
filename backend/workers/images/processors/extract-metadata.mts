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
import { unrecoverable } from '@modules/queue-errors'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { publishFailedImageState } from './publish-failed-image-state.mts'

type ReportableError = Error & {
  tags?: Record<string, string | number | boolean>
  extra?: Record<string, unknown>
}

function publishImageState(
  imageId: string,
  state: Parameters<typeof imageStatePubSub.publish>[1],
): ReturnType<typeof imageStatePubSub.publish> {
  return imageStatePubSub.publish(imageId, state)
}

interface ExtractedMetadata {
  format?: string
  width?: number
  height?: number
  size?: number
  [key: string]: unknown
}

export type ProcessExtractImageMetadataDeps = {
  withTemporaryMediaFile: (
    body: MediaBody,
    useFile: (path: string) => Promise<ExtractedMetadata>,
    options?: Parameters<typeof withTemporaryMediaFile>[2],
  ) => Promise<ExtractedMetadata>
  getImageFromS3: typeof getImageFromS3
  getImageById: typeof getImageByIdFromPrimary
  getDeployEnvironment: typeof getDeployEnvironment
  finalizeImageMetadata: typeof finalizeImageMetadata
  markImageUploadFailed: typeof markImageUploadFailed
  enqueueOnImageCreated: typeof enqueueOnImageCreated
  publishImageState: typeof imageStatePubSub.publish
  createSharp: (filename: string) => { metadata(): Promise<unknown> }
  onError: typeof onError
  unrecoverable: typeof unrecoverable
}

const defaultDeps: ProcessExtractImageMetadataDeps = {
  withTemporaryMediaFile,
  getImageFromS3,
  getImageById: getImageByIdFromPrimary,
  getDeployEnvironment,
  finalizeImageMetadata,
  markImageUploadFailed,
  enqueueOnImageCreated,
  publishImageState,
  createSharp: sharp,
  onError,
  unrecoverable,
}

async function readS3Body(
  s3Key: string,
  deps: ProcessExtractImageMetadataDeps,
): Promise<MediaBody> {
  const s3Response = await deps.getImageFromS3(deps.getDeployEnvironment(), s3Key)
  if (!s3Response.Body) {
    throw new Error('S3 response body is empty')
  }
  return s3Response.Body as unknown as MediaBody
}

export async function processExtractImageMetadata(
  imageId: string,
  deps: Partial<ProcessExtractImageMetadataDeps> = {},
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps }
  const image = await resolvedDeps.getImageById(imageId)
  if (!image) return
  const uploadStatus = deriveUploadStatus(image)
  if (uploadStatus === 'complete') return
  if (uploadStatus !== 'processing') {
    resolvedDeps.unrecoverable(
      new Error(`Cannot extract metadata for image ${imageId} in upload_status=${uploadStatus}`),
    )
  }
  const canonicalS3Key = image.sha_256?.toString('hex')
  if (!canonicalS3Key || image.s3_key !== canonicalS3Key) {
    const error = new Error(`Image ${imageId} does not have an immutable final S3 key`)
    await failImageMetadata(imageId, error.message, resolvedDeps)
    resolvedDeps.unrecoverable(error)
  }

  let shouldEnqueueImageCreated = false
  try {
    // ast-grep-ignore: no-three-sequential-awaits -- ordered source, spool, and DB transition
    const body = await readS3Body(canonicalS3Key, resolvedDeps)
    const metadata = await resolvedDeps.withTemporaryMediaFile(
      body,
      async filename => {
        const sharpMetadata = await resolvedDeps.createSharp(filename).metadata()
        const metadata: ExtractedMetadata = { ...(sharpMetadata as Record<string, unknown>) }

        if (!metadata.format || !SUPPORTED_IMAGE_FORMATS.includes(metadata.format)) {
          throw createHttpError(415, `Unsupported format: ${metadata.format}`)
        }
        return metadata
      },
      { prefix: 'image-extract-' },
    )

    const { rowCount } = await resolvedDeps.finalizeImageMetadata(imageId, metadata)
    if (rowCount === 0) return

    shouldEnqueueImageCreated = true
    resolvedDeps
      .publishImageState(imageId, {
        id: imageId,
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      })
      .catch(resolvedDeps.onError)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await failImageMetadata(imageId, errorMessage, resolvedDeps)
    throw error
  }

  if (shouldEnqueueImageCreated) {
    try {
      await resolvedDeps.enqueueOnImageCreated(imageId)
    } catch (error) {
      const reportError = (
        error instanceof Error
          ? error
          : new Error('Failed to enqueue image-created listener', { cause: error })
      ) as ReportableError
      reportError.tags = { imageId }
      reportError.extra = {
        s3Key: image.s3_key,
        context: 'extractImageMetadata.enqueueOnImageCreated',
      }
      resolvedDeps.onError(reportError)
    }
  }
}

async function failImageMetadata(
  imageId: string,
  errorMessage: string,
  deps: ProcessExtractImageMetadataDeps,
): Promise<void> {
  await deps.markImageUploadFailed(imageId, errorMessage)
  await publishFailedImageState(imageId, errorMessage, deps.publishImageState, deps.onError)
}
