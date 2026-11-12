import { describe, expect, it } from 'vitest'
import {
  createEmbeddingTextRecordLine,
  createEmbeddingImageRecordLine,
  MAX_BATCH_INPUT_BYTES,
  MAX_BATCH_RECORDS,
} from './input-size-limits.mts'

describe('Vertex batch request contract', () => {
  it('writes keyed requests with the shared document text bound', () => {
    const content = 'synthetic'.repeat(2000)
    const record = JSON.parse(
      createEmbeddingTextRecordLine(
        { entity_id: 'id', content, content_sha256: Buffer.alloc(32) },
        'posts',
      ),
    )
    expect(record).toEqual({
      key: 'post:id',
      request: {
        content: { parts: [{ text: `title: none | text: ${content.slice(0, 8192)}` }] },
        embed_content_config: { output_dimensionality: 1536 },
      },
    })
    expect(MAX_BATCH_INPUT_BYTES).toBe(1_000_000_000)
    expect(MAX_BATCH_RECORDS).toBe(1_000_000)
  })
  it('uses GCS fileData for images', () => {
    expect(
      JSON.parse(
        createEmbeddingImageRecordLine(
          { entity_id: 'id', image_sha_256: Buffer.alloc(32), format: 'jpeg', bytes: 'YWJj' },
          'gs://synthetic/image.jpeg',
        ),
      ),
    ).toEqual({
      key: 'image:id',
      request: {
        content: {
          parts: [{ fileData: { fileUri: 'gs://synthetic/image.jpeg', mimeType: 'image/jpeg' } }],
        },
        embed_content_config: { output_dimensionality: 1536 },
      },
    })
  })
})
