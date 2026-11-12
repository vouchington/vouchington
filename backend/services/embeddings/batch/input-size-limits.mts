import { buildEmbeddingContent } from '../single/request.mts'
import type { BatchJobType } from './types.mts'

export const MAX_BATCH_RECORDS = 1_000_000
export const MAX_BATCH_INPUT_BYTES = 1_000_000_000
export const MAX_IMAGE_EMBEDDING_BYTES = 4 * 1024 * 1024

export type EmbeddingImageInput = {
  entity_id: string
  image_sha_256: Buffer
  format: 'jpeg' | 'png' | 'webp'
  bytes: string
}
export type EmbeddingTextInput = { entity_id: string; content: string; content_sha256: Buffer }
const KEY_TYPES: Record<BatchJobType, string> = {
  topics: 'topic',
  posts: 'post',
  rss_feed_items: 'rss_feed_item',
  crawl_chunks: 'crawl_chunk',
  images: 'image',
}

export function createEmbeddingImageRecordLine(image: EmbeddingImageInput, uri: string): string {
  return JSON.stringify({
    key: `image:${image.entity_id}`,
    request: {
      content: { parts: [{ fileData: { fileUri: uri, mimeType: `image/${image.format}` } }] },
      embed_content_config: { output_dimensionality: 1536 },
    },
  })
}

export function createEmbeddingTextRecordLine(
  entity: EmbeddingTextInput,
  jobType: BatchJobType = 'topics',
): string {
  return JSON.stringify({
    key: `${KEY_TYPES[jobType]}:${entity.entity_id}`,
    request: {
      content: buildEmbeddingContent(entity.content),
      embed_content_config: { output_dimensionality: 1536 },
    },
  })
}

// Admission only needs room for one actual serialized row. The builder enforces the exact byte cap.
export const minimumImageBatchSizeMB = (records: number): number => (records * 512) / 1024 / 1024
export const minimumTextBatchSizeMB = (records: number): number => (records * 512) / 1024 / 1024
