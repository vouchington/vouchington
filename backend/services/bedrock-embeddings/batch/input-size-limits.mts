import {
  EMBEDDING_DIMENSION,
  MAX_EMBEDDING_TEXT_LENGTH,
  truncateEmbeddingText,
} from '../config.mts'

/** Converted image bytes have this provider-bound maximum before base64 encoding. */
export const MAX_IMAGE_EMBEDDING_BYTES = 4 * 1024 * 1024
export type EmbeddingImageInput = {
  entity_id: string
  image_sha_256: Buffer
  format: 'jpeg' | 'png' | 'webp'
  bytes: string
}

export function createEmbeddingImageRecordLine(image: EmbeddingImageInput): string {
  return JSON.stringify({
    recordId: JSON.stringify({
      entity_id: image.entity_id,
      image_sha_256: image.image_sha_256.toString('hex'),
    }),
    modelInput: {
      taskType: 'SINGLE_EMBEDDING',
      singleEmbeddingParams: {
        embeddingPurpose: 'GENERIC_INDEX',
        embeddingDimension: EMBEDDING_DIMENSION,
        image: { format: image.format, source: { bytes: image.bytes } },
      },
    },
  })
}

/** Bound the actual framing with a UUID, SHA-256, longest format name and newline. */
export function minimumImageBatchSizeMB(records: number): number {
  const framing =
    Buffer.byteLength(
      createEmbeddingImageRecordLine({
        entity_id: '0'.repeat(36),
        image_sha_256: Buffer.alloc(32),
        format: 'jpeg',
        bytes: '',
      }),
    ) + 1
  return (records * (Math.ceil(MAX_IMAGE_EMBEDDING_BYTES / 3) * 4 + framing)) / 1024 / 1024
}

export type EmbeddingTextInput = { entity_id: string; content: string; content_sha256: Buffer }

export function createEmbeddingTextRecordLine(entity: EmbeddingTextInput): string {
  return JSON.stringify({
    recordId: JSON.stringify({
      entity_id: entity.entity_id,
      content_sha256: entity.content_sha256.toString('hex'),
    }),
    modelInput: {
      taskType: 'SINGLE_EMBEDDING',
      singleEmbeddingParams: {
        embeddingPurpose: 'GENERIC_INDEX',
        embeddingDimension: EMBEDDING_DIMENSION,
        text: { truncationMode: 'END', value: truncateEmbeddingText(entity.content) },
      },
    },
  })
}

/** JSON control-character escapes cost up to six bytes per UTF-16 code unit. */
export function minimumTextBatchSizeMB(records: number): number {
  const framing =
    Buffer.byteLength(
      createEmbeddingTextRecordLine({
        // The longest identifier is a crawl UUID plus its PostgreSQL INT order index.
        entity_id: `${'0'.repeat(36)}-${-(2 ** 31)}`,
        content: '',
        content_sha256: Buffer.alloc(32),
      }),
    ) + 1
  return (records * (MAX_EMBEDDING_TEXT_LENGTH * 6 + framing)) / 1024 / 1024
}
