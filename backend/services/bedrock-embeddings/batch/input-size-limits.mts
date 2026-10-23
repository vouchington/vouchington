import {
  createEmbeddingImageRecordLine as imageRecord,
  createEmbeddingTextRecordLine as textRecord,
  minimumImageBatchSizeMB as imageSize,
  minimumTextBatchSizeMB as textSize,
} from '@vouchington/utils/bedrock-embedding-batches'
import { EMBEDDING_DIMENSION, MAX_EMBEDDING_TEXT_LENGTH } from '../config.mts'

/** Converted image bytes have this provider-bound maximum before base64 encoding. */
export const MAX_IMAGE_EMBEDDING_BYTES = 4 * 1024 * 1024
export type EmbeddingImageInput = {
  entity_id: string
  image_sha_256: Buffer
  format: 'jpeg' | 'png' | 'webp'
  bytes: string
}

export function createEmbeddingImageRecordLine(image: EmbeddingImageInput): string {
  return imageRecord(
    {
      recordId: JSON.stringify({
        entity_id: image.entity_id,
        image_sha_256: image.image_sha_256.toString('hex'),
      }),
      format: image.format,
      bytes: image.bytes,
    },
    { dimension: EMBEDDING_DIMENSION, purpose: 'GENERIC_INDEX' },
  )
}
export function minimumImageBatchSizeMB(records: number): number {
  return imageSize(records, {
    dimension: EMBEDDING_DIMENSION,
    maxImageBytes: MAX_IMAGE_EMBEDDING_BYTES,
    maxRecordIdLength: 150,
  })
}

export type EmbeddingTextInput = { entity_id: string; content: string; content_sha256: Buffer }

export function createEmbeddingTextRecordLine(entity: EmbeddingTextInput): string {
  return textRecord(
    {
      recordId: JSON.stringify({
        entity_id: entity.entity_id,
        content_sha256: entity.content_sha256.toString('hex'),
      }),
      content: entity.content,
    },
    {
      dimension: EMBEDDING_DIMENSION,
      maxTextLength: MAX_EMBEDDING_TEXT_LENGTH,
      purpose: 'GENERIC_INDEX',
    },
  )
}
export function minimumTextBatchSizeMB(records: number): number {
  // A crawl UUID plus its signed PostgreSQL INT order index and SHA-256 metadata fits 160 units.
  return textSize(records, {
    dimension: EMBEDDING_DIMENSION,
    maxTextLength: MAX_EMBEDDING_TEXT_LENGTH,
    maxRecordIdLength: 160,
  })
}
