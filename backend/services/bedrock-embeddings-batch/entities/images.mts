import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { getImageFromS3 } from '@services/images/s3'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'

const MAX_IMAGE_EMBEDDING_BYTES = 4 * 1024 * 1024

type PendingImage = {
  id: string
  s3_key: string
  sha_256: Buffer
}

type ImageReadDependencies = {
  getImageFromS3: typeof getImageFromS3
}

const defaultImageReadDependencies: ImageReadDependencies = { getImageFromS3 }

export async function* streamPendingImages(): AsyncGenerator<PendingImage, void, unknown> {
  const query = `/* streamPendingImages */
    SELECT id, s3_key, sha_256
    FROM images
    WHERE deleted_at IS NULL
      AND quarantine_pending_at IS NULL
      AND openai_omni_moderation_created_at IS NOT NULL
      AND openai_omni_moderation_flagged = FALSE
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NULL
      AND NOT ${lockExistsClause('images', 'images.id')}
    ORDER BY id DESC
  `

  for await (const image of createAsyncGeneratorFromCursor<PendingImage>(query, [], {
    batchSize: 100,
  })) {
    yield image
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
  const bytes = await readImageBytes(response.Body, image.id)

  return await fileBuilder.addImageIfFits(
    {
      entity_id: image.id,
      image_sha_256: image.sha_256,
      format: getImageFormat(response.ContentType ?? null),
      bytes: bytes.toString('base64'),
    },
    maxInputSizeMB,
  )
}

async function readImageBytes(body: unknown, imageId: string): Promise<Buffer> {
  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
  if (transformable?.transformToByteArray) {
    const bytes = Buffer.from(await transformable.transformToByteArray())
    if (bytes.byteLength > MAX_IMAGE_EMBEDDING_BYTES) {
      throw new Error(`Image ${imageId} exceeds Bedrock embedding input limit`)
    }
    return bytes
  }
  const iterable = body as AsyncIterable<Uint8Array> | undefined
  if (!iterable) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  for await (const value of iterable) {
    totalBytes += value.byteLength
    if (totalBytes > MAX_IMAGE_EMBEDDING_BYTES) {
      throw new Error(`Image ${imageId} exceeds Bedrock embedding input limit`)
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks)
}

function getImageFormat(contentType: string | null): 'jpeg' | 'png' | 'webp' {
  if (contentType?.includes('png')) return 'png'
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpeg'
  if (contentType?.includes('webp')) return 'webp'
  throw new Error(`Unsupported Bedrock image embedding content type: ${contentType ?? 'unknown'}`)
}
