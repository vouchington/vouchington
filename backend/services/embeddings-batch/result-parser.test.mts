import { describe, expect, it } from 'vitest'
import { parseBatchResult } from './result-parser.mts'

const vector = Array.from({ length: 1536 }, () => 0.125)
const result = (overrides: Record<string, unknown> = {}) => ({
  key: 'post:post-id',
  response: { tokenCount: '7', embedding: { values: vector } },
  ...overrides,
})

describe('Vertex batch result parser', () => {
  it('parses the output key, vector and provider token count without an echoed request', () => {
    expect(parseBatchResult(result())).toEqual({
      entityId: 'post-id',
      entityType: 'post',
      embedding: vector,
      inputTokenCount: 7,
    })
  })

  it('ignores a mismatched request echo and keeps the output key authoritative', () => {
    expect(
      parseBatchResult(
        result({ request: { content: { parts: [{ text: 'title: forged | text: unrelated' }] } } }),
      ),
    ).toMatchObject({ entityId: 'post-id', entityType: 'post', inputTokenCount: 7 })
  })

  it('accepts an omitted batch token count but rejects malformed counts and unsuccessful rows', () => {
    expect(parseBatchResult(result({ response: { embedding: { values: vector } } }))).toMatchObject(
      { inputTokenCount: null },
    )
    expect(
      parseBatchResult(
        result({ response: { tokenCount: 'not-a-count', embedding: { values: vector } } }),
      ),
    ).toBeNull()
    expect(parseBatchResult(result({ status: { code: 429 } }))).toBeNull()
  })

  it.each([null, false, true, [], {}, 1.5, ''])(
    'rejects a non-integral or non-numeric token count %j',
    tokenCount => {
      expect(
        parseBatchResult(result({ response: { tokenCount, embedding: { values: vector } } })),
      ).toBeNull()
    },
  )

  it('accepts image results by their key without parsing an echoed GCS URI', () => {
    expect(
      parseBatchResult({
        key: 'image:image-id',
        response: { tokenCount: '258', embedding: { values: vector } },
      }),
    ).toMatchObject({ entityId: 'image-id', entityType: 'image', inputTokenCount: 258 })
  })
})
