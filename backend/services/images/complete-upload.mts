import type { MediaBody } from '@vouchington/media'
import { isUniqueViolation } from '@data-stores/psql'
import { enqueueExtractImageMetadata } from '@queues/images/enqueues'
import onError from '@modules/on-error'
import createHttpError from 'http-errors'
import { getImageByHash, getImageByIdFromPrimary } from './get.mts'
import {
  deletePendingImage,
  persistImageHashWhileProcessing,
  replaceFailedImage,
} from './complete-upload-digest.mts'
import {
  claimImageUpload,
  markImageUploadSourceDeleted,
  persistPromotedImageKey,
} from './complete-upload-state.mts'
import { deriveUploadStatus } from './get-upload-state.mts'
import { freezeImageUpload } from './freeze-upload.mts'
import {
  deleteImageUploadSourceFromS3,
  ensureImageDeliveryAliasInS3,
  getImageUploadSourceFromS3,
  promoteFrozenImageToS3,
} from './s3-upload-lifecycle.mts'
import { markImageUploadFailed } from './upload-state.mts'
import { deleteImagesFromS3 } from './s3.mts'

type CompleteImageUploadDependencies = {
  freezeImageUpload: typeof freezeImageUpload
  getImageByHash: typeof getImageByHash
  persistImageHashWhileProcessing: typeof persistImageHashWhileProcessing
}

const defaultDependencies: CompleteImageUploadDependencies = {
  freezeImageUpload,
  getImageByHash,
  persistImageHashWhileProcessing,
}

export async function completeImageUpload(
  user: { id: string },
  imageId: string,
  dependencies: Partial<CompleteImageUploadDependencies> = {},
) {
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const claim = await claimImageUpload(user.id, imageId)
  if (!claim.claimed) return claim.image

  const image = claim.image
  let frozen: Awaited<ReturnType<typeof freezeImageUpload>> | undefined
  try {
    const source = await getImageUploadSourceFromS3(image)
    if (!source.Body) throw new Error('S3 response body is empty')
    frozen = await resolvedDependencies.freezeImageUpload(source.Body as unknown as MediaBody)

    const existingImage = await resolvedDependencies.getImageByHash(frozen.sha256, true)
    if (existingImage?.deleted_at) {
      await deleteImageUploadSourceFromS3(image)
      await deletePendingImage(imageId)
      throw createHttpError(400, 'Image was previously flagged and deleted')
    }

    let processingImage
    if (
      existingImage &&
      existingImage.id !== imageId &&
      deriveUploadStatus(existingImage) === 'failed'
    ) {
      processingImage = await replaceFailedImage(existingImage, image, frozen.sha256)
      if (processingImage.id !== imageId) return processingImage
    } else if (existingImage && existingImage.id !== imageId) {
      await deleteImageUploadSourceFromS3(image)
      await deletePendingImage(imageId)
      return existingImage
    } else {
      try {
        processingImage = await resolvedDependencies.persistImageHashWhileProcessing(
          frozen.sha256,
          imageId,
        )
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
        await deleteDuplicateUpload(image, imageId)
        const winner = await resolvedDependencies.getImageByHash(frozen.sha256)
        if (winner) return winner
        throw err
      }
    }

    const promotion = await promoteFrozenImageToS3({
      filename: frozen.filename,
      sha256: frozen.sha256,
      contentType: source.ContentType,
    })
    const deliveryAlias = await ensureImageDeliveryAliasInS3(imageId, {
      filename: frozen.filename,
      sha256: frozen.sha256,
      contentType: source.ContentType,
    })

    try {
      processingImage = await persistPromotedImageKey(imageId, frozen.sha256, promotion.s3Key)
    } catch (err) {
      await cleanupRejectedPromotionIfTerminal(imageId, promotion, deliveryAlias)
      throw err
    }

    try {
      await deleteImageUploadSourceFromS3(image)
      await markImageUploadSourceDeleted(imageId)
    } catch (err) {
      onError(err as Error)
    }

    try {
      await enqueueExtractImageMetadata(imageId)
    } catch (err) {
      onError(err as Error)
    }
    return processingImage
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await markImageUploadFailed(imageId, errorMessage)
    throw err
  } finally {
    if (frozen) {
      try {
        await frozen.cleanup()
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }
}

async function cleanupRejectedPromotionIfTerminal(
  imageId: string,
  promotion: { created: boolean; s3Key: string },
  deliveryAlias: { created: boolean; s3Key: string },
): Promise<void> {
  try {
    const image = await getImageByIdFromPrimary(imageId, true)
    if (!image?.deleted_at && !image?.upload_failed_at) return
    const createdKeys = [promotion, deliveryAlias]
      .filter(result => result.created)
      .map(({ s3Key }) => ({ s3_key: s3Key }))
    if (createdKeys.length > 0) await deleteImagesFromS3(createdKeys)
  } catch (err) {
    onError(err as Error)
  }
}

async function deleteDuplicateUpload(
  image: Parameters<typeof deleteImageUploadSourceFromS3>[0],
  imageId: string,
): Promise<void> {
  await deleteImageUploadSourceFromS3(image)
  await deletePendingImage(imageId).catch(onError)
}
