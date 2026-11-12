import { describe, expect, it } from 'vitest'
import {
  createEmbeddingTextRecordLine,
  createEmbeddingImageRecordLine,
  MAX_BATCH_INPUT_BYTES,
  MAX_BATCH_RECORDS,
} from './input-size-limits.mts'
import { estimateTokens } from '@modules/utils'

describe('Vertex batch request contract', () => {
  it('writes keyed requests with the actual title and a full-prompt token budget', () => {
    const content = 'synthetic body '.repeat(2_100)
    const title = 'Synthetic actual title'
    const record = JSON.parse(
      createEmbeddingTextRecordLine(
        { entity_id: 'id', title, content, content_sha256: Buffer.alloc(32) },
        'posts',
      ),
    )
    const prompt = record.request.content.parts[0].text
    expect(record.key).toBe('post:id')
    expect(prompt.startsWith(`title: ${title} | text: `)).toBe(true)
    expect(prompt).not.toContain('title: none')
    expect(prompt).toContain('synthetic body')
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(7_680)
    expect(record.request.embed_content_config).toEqual({ output_dimensionality: 1536 })
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
