import { MAX_IMAGE_EMBEDDING_BYTES } from '@services/bedrock-embeddings/batch/input-size-limits'
import { createPendingScan, type PendingScanOptions } from './scan-options.mts'
import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { transformImage } from '@vouchington/image-resize'
import { freezeImageUpload, MAX_IMAGE_UPLOAD_BYTES } from '@services/images/freeze-upload'
import { getImageFromS3 } from '@services/images/s3'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'

const MAX_IMAGE_EMBEDDING_PIXELS = 24_000_000
const MAX_IMAGE_EMBEDDING_DIMENSION = 1024

export const MAX_IMAGE_EMBEDDING_SOURCE_BYTES = MAX_IMAGE_UPLOAD_BYTES

type PendingImage = {
  id: string
  s3_key: string
  sha_256: Buffer
}

type ImageReadDependencies = {
  getImageFromS3: typeof getImageFromS3
}

const defaultImageReadDependencies: ImageReadDependencies = { getImageFromS3 }

export async function* streamPendingImages(
  options: PendingScanOptions = {},
): AsyncGenerator<PendingImage, void, unknown> {
  const cursor = options.cursor ?? { sweepStartedAt: new Date().toISOString() }
  const scan = createPendingScan({ ...options, cursor }, true)
  const pendingIds = options.cursor?.pendingImageIds ?? []
  let replayed = 0
  let completed = false
  const replayedIds = new Set<string>()
  let replayHasMore = true
  const replayCursor = () => ({
    ...cursor,
    pendingImageIds: replayHasMore ? pendingIds.filter(id => !replayedIds.has(id)) : [],
  })
  try {
    const eligibility = `deleted_at IS NULL AND quarantine_pending_at IS NULL
    AND openai_omni_moderation_created_at IS NOT NULL AND openai_omni_moderation_flagged = FALSE
    AND bedrock_nova_multimodal_v1_embedding_created_at IS NULL
    AND NOT ${lockExistsClause('images', 'images.id')}`
    if (pendingIds.length) {
      for await (const image of createAsyncGeneratorFromCursor<PendingImage>(
        `/* replayPendingEmbeddingImages */ SELECT id, s3_key, sha_256 FROM images
       WHERE id < $1::uuid AND id = ANY($2::uuid[]) AND ${eligibility} ORDER BY id DESC`,
        [scan.upperId, pendingIds],
        {
          batchSize: scan.limits.batchSize,
          maxRows: Math.min(pendingIds.length, scan.limits.maxRows),
          onComplete: result => {
            replayHasMore = result.hasMore
          },
        },
      )) {
        replayed += 1
        replayedIds.add(image.id)
        yield image
      }
    }
    const remaining = scan.limits.maxRows - replayed
    if (remaining === 0) {
      completed = true
      options.onComplete?.({ hasMore: true, cursor: replayCursor() })
      return
    }
    for await (const image of createAsyncGeneratorFromCursor<PendingImage>(
      `/* streamPendingImages */ SELECT id, s3_key, sha_256 FROM images
      WHERE id < $1::uuid AND ($2::uuid IS NULL OR id < $2::uuid)
        AND NOT (id = ANY($3::uuid[])) AND ${eligibility} ORDER BY id DESC`,
      [scan.upperId, scan.afterId, pendingIds],
      {
        batchSize: scan.limits.batchSize,
        maxRows: remaining,
        onComplete: result => {
          completed = true
          scan.complete(result)
        },
      },
    ))
      yield image
  } finally {
    if (!completed) options.onComplete?.({ hasMore: true, cursor: replayCursor() })
  }
}

export async function addImageToBatch(
  fileBuilder: BatchFileBuilder,
  image: PendingImage,
  maxInputSizeMB: number,
  dependencyOverrides: Partial<ImageReadDependencies> = {},
): Promise<boolean> {
  const dependencies = { ...defaultImageReadDependencies, ...dependencyOverrides }
  const response = await dependencies.getImageFromS3(getDeployEnvironment(), image.s3_key)
  const bytes = await createBedrockImageBytes(response.Body, image.id)

  return fileBuilder.addImageIfFits(
    {
      entity_id: image.id,
      image_sha_256: image.sha_256,
      format: 'jpeg',
      bytes: bytes.toString('base64'),
    },
    maxInputSizeMB,
  )
}

async function createBedrockImageBytes(body: unknown, imageId: string): Promise<Buffer> {
  const source = await freezeImageUpload(body as AsyncIterable<Uint8Array>, {
    maxBytes: MAX_IMAGE_EMBEDDING_SOURCE_BYTES,
  })
  try {
    const bytes = await transformImage(source.filename, {
      width: MAX_IMAGE_EMBEDDING_DIMENSION,
      height: MAX_IMAGE_EMBEDDING_DIMENSION,
      format: 'jpeg',
      quality: 80,
      progressive: true,
      maxInputPixels: MAX_IMAGE_EMBEDDING_PIXELS,
    })
    if (bytes.byteLength > MAX_IMAGE_EMBEDDING_BYTES) {
      throw new Error(`Image ${imageId} exceeds Bedrock embedding input limit after conversion`)
    }
    return bytes
  } finally {
    await source.cleanup()
  }
}
