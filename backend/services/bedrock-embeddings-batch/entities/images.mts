import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { getPublicImageUrl } from '@services/images'
import { fetch } from 'undici'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'

const IMAGE_EMBEDDING_WIDTH = 400
const MAX_IMAGE_EMBEDDING_BYTES = 4 * 1024 * 1024
const BEDROCK_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'

type PendingImage = {
  id: string
  s3_key: string
  sha_256: Buffer
}

export async function* streamPendingImages(): AsyncGenerator<PendingImage, void, unknown> {
  const query = `/* streamPendingImages */
    SELECT id, s3_key, sha_256
    FROM images
    WHERE deleted_at IS NULL
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
): Promise<boolean> {
  const imageUrl = getPublicImageUrl(image.s3_key, IMAGE_EMBEDDING_WIDTH)
  if (!imageUrl) {
    throw new Error(`Refusing to fetch non-public image URL for image ${image.id}`)
  }
  const response = await fetch(imageUrl, {
    dispatcher: getExternalRequestDispatcher(),
    headers: {
      accept: BEDROCK_IMAGE_ACCEPT,
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch image ${image.id}: ${response.status}`)
  }

  const bytes = await readImageBytes(response, image.id)

  return await fileBuilder.addImageIfFits(
    {
      entity_id: image.id,
      image_sha_256: image.sha_256,
      format: getImageFormat(response.headers.get('content-type')),
      bytes: bytes.toString('base64'),
    },
    maxInputSizeMB,
  )
}

async function readImageBytes(response: Response, imageId: string): Promise<Buffer> {
  const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10)
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_EMBEDDING_BYTES) {
    throw new Error(`Image ${imageId} exceeds Bedrock embedding input limit`)
  }
  if (!response.body) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  for await (const value of response.body) {
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
