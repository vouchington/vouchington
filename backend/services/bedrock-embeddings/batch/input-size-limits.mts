import { EMBEDDING_DIMENSION } from '../config.mts'

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
