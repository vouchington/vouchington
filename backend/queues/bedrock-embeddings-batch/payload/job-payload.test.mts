import { describe, expect, it } from 'vitest'
import { parseEmbeddingScanCursor } from './job-payload.mts'

describe('embedding scan payload', () => {
  it('accepts an empty root and preserves exact chunk continuation fields', () => {
    expect(parseEmbeddingScanCursor({})).toBeUndefined()
    const cursor = {
      sweepStartedAt: new Date().toISOString(),
      afterId: 'synthetic-crawl-id',
      afterOrderIndex: 0,
      pendingImageIds: [crypto.randomUUID()],
    }
    expect(parseEmbeddingScanCursor({ cursor })).toEqual(cursor)
  })
  it.each([
    { cursor: { sweepStartedAt: 'invalid' } },
    { cursor: { sweepStartedAt: new Date().toISOString(), afterOrderIndex: 1 } },
    { cursor: { sweepStartedAt: new Date().toISOString(), afterId: 'id', afterOrderIndex: -1 } },
    { unrelated: true },
    { cursor: { sweepStartedAt: new Date().toISOString(), pendingImageIds: ['bad-id'] } },
  ])('rejects malformed continuations', data => {
    expect(() => parseEmbeddingScanCursor(data)).toThrow(/embedding/)
  })
})
