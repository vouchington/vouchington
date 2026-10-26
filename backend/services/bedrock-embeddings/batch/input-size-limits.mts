import {
  createEmbeddingImageRecordLine as createImageLine,
  createEmbeddingTextRecordLine as createTextLine,
  minimumImageBatchSizeMB as minimumImageMB,
  minimumTextBatchSizeMB as minimumTextMB,
} from '@vouchington/utils/bedrock-embedding-batches'

/** Converted image bytes have this provider-bound maximum before base64 encoding. */
export const MAX_IMAGE_EMBEDDING_BYTES = 4 * 1024 * 1024

/**
 * Longest `recordId` we write: `{"entity_id":"<crawl UUID>-<INT>","content_sha256":"<64 hex>"}`
 * (image ids carry one more character in `image_sha_256`).
 */
const SIZE_OPTIONS = { maxRecordIdLength: 150, maxImageBytes: MAX_IMAGE_EMBEDDING_BYTES }

export type EmbeddingImageInput = {
  entity_id: string
  image_sha_256: Buffer
  format: 'jpeg' | 'png' | 'webp'
  bytes: string
}

export type EmbeddingTextInput = { entity_id: string; content: string; content_sha256: Buffer }

export function createEmbeddingImageRecordLine(image: EmbeddingImageInput): string {
  return createImageLine({
    recordId: JSON.stringify({
      entity_id: image.entity_id,
      image_sha_256: image.image_sha_256.toString('hex'),
    }),
    format: image.format,
    bytes: image.bytes,
  })
}

export function createEmbeddingTextRecordLine(entity: EmbeddingTextInput): string {
  return createTextLine({
    recordId: JSON.stringify({
      entity_id: entity.entity_id,
      content_sha256: entity.content_sha256.toString('hex'),
    }),
    content: entity.content,
  })
}

export const minimumImageBatchSizeMB = (records: number): number =>
  minimumImageMB(records, SIZE_OPTIONS)

export const minimumTextBatchSizeMB = (records: number): number =>
  minimumTextMB(records, SIZE_OPTIONS)
